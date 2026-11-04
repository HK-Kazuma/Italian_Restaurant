import { createBoiler, pressButton, setNoodle, startShortBoil, takeNoodle, updateBoiler } from './boiler';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
import { MENU, findMatchingTicket, getMenu } from './recipe';
import { serveScore } from './score';
import { createTicket, nextTicketInterval, pickMenu } from './tickets';
import type { GameState, Item, Phase, Target, Toast } from './types';

// クリックしたら起きること。null = 今の手持ちではこの設備に何もできない
type Action = () => void;

const TOAST_SECONDS = 2.5;

export class Game {
  state: GameState;

  constructor(
    readonly cfg: GameConfig = DEFAULT_CONFIG,
    private rng: () => number = Math.random,
  ) {
    this.state = this.initialState('title');
  }

  private initialState(phase: Phase): GameState {
    return {
      phase,
      time: 0,
      hand: null,
      boilers: Array.from({ length: this.cfg.boilerCount }, createBoiler),
      plateSlots: Array.from({ length: this.cfg.plateSlotCount }, () => null),
      tickets: [],
      nextTicketAt: this.cfg.firstTicketAt,
      nextTicketId: 1,
      score: 0,
      combo: 0,
      maxCombo: 0,
      served: 0,
      mistakes: 0,
      toast: null,
    };
  }

  start(): void {
    this.state = this.initialState('playing');
  }

  pause(): void {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  resume(): void {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  update(dt: number): void {
    const s = this.state;
    if (s.phase !== 'playing') return;

    s.time += dt;
    for (const b of s.boilers) updateBoiler(b, dt, this.cfg);
    this.spawnTickets();

    if (s.time >= this.cfg.gameDuration) {
      s.time = this.cfg.gameDuration;
      s.phase = 'result';
    }
  }

  private spawnTickets(): void {
    const s = this.state;
    if (s.time < s.nextTicketAt) return;
    if (s.tickets.length < this.cfg.maxOpenTickets) {
      s.tickets.push(createTicket(s.nextTicketId++, pickMenu(MENU, this.rng), s.time));
    }
    const progress = s.time / this.cfg.gameDuration;
    s.nextTicketAt = s.time + nextTicketInterval(progress, this.cfg, this.rng);
  }

  // --- 操作 ---

  // 視点の先の設備を左クリック
  interact(target: Target): void {
    this.planInteract(target)?.();
  }

  // 茹で麺器をダブルクリック（のびかけ → ショート茹で）
  doubleClick(target: Target): void {
    this.planDoubleClick(target)?.();
  }

  // 右クリック：手に持っている物を捨てる
  discard(): void {
    const s = this.state;
    if (s.phase !== 'playing' || !s.hand) return;
    s.hand = null;
    this.say('捨てた', 'info');
  }

  // 実行せずに「できるか」を知るため、操作はクロージャとして返す（ハイライトにも使う）
  planInteract(target: Target): Action | null {
    const s = this.state;
    if (s.phase !== 'playing') return null;
    const hand = s.hand;

    switch (target.kind) {
      case 'noodleRack':
        if (hand) return null;
        return () => (s.hand = { kind: 'rawNoodle' });

      case 'plateStack':
        if (hand) return null;
        return () => (s.hand = { kind: 'plate', contents: [] });

      case 'topping':
        if (hand) return null;
        return () => (s.hand = { kind: 'ingredient', id: target.id });

      case 'boilerBasket': {
        const b = s.boilers[target.index];
        if (b.state === 'empty' && hand?.kind === 'rawNoodle') {
          return () => {
            setNoodle(b);
            s.hand = null;
          };
        }
        if (b.state === 'lifted' && !hand) {
          return () => {
            takeNoodle(b);
            s.hand = { kind: 'ingredient', id: 'noodle' };
          };
        }
        if (b.state === 'overdue') {
          return () => this.say('のびかけ！ダブルクリックでショート茹で', 'info');
        }
        return null;
      }

      case 'boilerButton': {
        const b = s.boilers[target.index];
        if (b.state !== 'set') return null;
        return () => pressButton(b, this.cfg);
      }

      case 'plateSlot': {
        const slot = s.plateSlots[target.index];
        if (!hand && slot) {
          return () => {
            s.hand = { kind: 'plate', contents: slot };
            s.plateSlots[target.index] = null;
          };
        }
        if (hand?.kind === 'plate' && !slot) {
          return () => {
            s.plateSlots[target.index] = hand.contents;
            s.hand = null;
          };
        }
        if (hand?.kind === 'ingredient' && slot && slot.length < this.cfg.maxPlateContents) {
          return () => {
            slot.push(hand.id);
            s.hand = null;
          };
        }
        return null;
      }

      case 'servePass':
        if (hand?.kind !== 'plate') return null;
        return () => this.serve(hand);
    }
  }

  planDoubleClick(target: Target): Action | null {
    if (this.state.phase !== 'playing') return null;
    if (target.kind !== 'boilerBasket' && target.kind !== 'boilerButton') return null;
    const b = this.state.boilers[target.index];
    if (b.state !== 'overdue') return null;
    return () => startShortBoil(b, this.cfg);
  }

  // 提供：皿の中身と一致する最も古い伝票を消してスコア加算。なければ注文ミス
  private serve(plate: Extract<Item, { kind: 'plate' }>): void {
    const s = this.state;
    s.hand = null;

    if (plate.contents.length === 0) {
      this.say('空の皿は出せない', 'info');
      return;
    }

    const ticket = findMatchingTicket(plate.contents, s.tickets);
    if (!ticket) {
      s.score = Math.max(0, s.score - this.cfg.orderMissPenalty);
      s.combo = 0;
      s.mistakes++;
      this.say(`注文ミス！ −${this.cfg.orderMissPenalty}`, 'bad');
      return;
    }

    const menu = getMenu(ticket.menuId);
    const result = serveScore(menu, s.time - ticket.arrivedAt, s.combo, this.cfg);
    s.tickets = s.tickets.filter((t) => t.id !== ticket.id);
    s.score += result.total;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.served++;
    this.say(`${menu.name} +${result.total}（×${result.multiplier.toFixed(1)}）`, 'good');
  }

  private say(text: string, kind: Toast['kind']): void {
    this.state.toast = { text, kind, expiresAt: this.state.time + TOAST_SECONDS };
  }
}

export function describeItem(item: Item | null): string {
  if (!item) return '';
  switch (item.kind) {
    case 'rawNoodle':
      return '生麺';
    case 'ingredient':
      return INGREDIENTS[item.id].name;
    case 'plate':
      return item.contents.length === 0
        ? '皿（空）'
        : `皿（${item.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
  }
}
