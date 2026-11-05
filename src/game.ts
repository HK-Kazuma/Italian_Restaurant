import { createBoiler, pressButton, setNoodle, startShortBoil, takeNoodle, updateBoiler } from './boiler';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
import {
  addIngredient,
  canAddIngredient,
  canInsert,
  canPour,
  canMix,
  createPot,
  createWasher,
  insertPot,
  isWashing,
  mixPot,
  pourOnto,
  startHeating,
  takeWashedPot,
  updateHeat,
  updateWasher,
} from './pot';
import { canStackPack, createPack, findWarmPack, soakPack, stockItem } from './pack';
import { MENU, findMatchingTicket, findSauceRecipe, getMenu } from './recipe';
import { serveScore } from './score';
import { createTicket, nextTicketInterval, pickMenu } from './tickets';
import { BOTTLE_IDS, BOTTLE_PLATE, BOTTLE_SURFACES, BOTTLE_VERB } from './bottle';
import { BOTTLE_HOME, SURFACES } from './layout';
import type { BottleId, BottlePreview, BottleSpot, GameState, IngredientId, Item, Phase, Pot, Target, Toast, TrayId } from './types';

// クリックしたら起きること。null = 今の手持ちではこの設備に何もできない
type Action = () => void;

const TOAST_SECONDS = 2.5;

// トレー・ケースから取れる中身
const TRAY_CONTENT: Record<TrayId, IngredientId> = { spinach: 'spinach', saltOil: 'saltOilSauce' };
const TRAY_NAME: Record<TrayId, string> = { spinach: 'ほうれん草のトレー', saltOil: '塩オイルソースのケース' };

// ボトルをサラダ台の上に置くときの決まり
const BOTTLE_EDGE = 0.06; // 天板の縁から、これだけ内側までしか置けない
const BOTTLE_GAP = 0.14; // ボトルどうしの最小の間隔

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
      plateSlots: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => null),
      plateStyles: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => 'plate' as const),
      trays: { spinach: 'fridge', saltOil: 'fridge' },
      fridgeOpen: false,
      bottles: Object.fromEntries(BOTTLE_IDS.map((id) => [id, { ...BOTTLE_HOME[id] }])) as Record<BottleId, BottleSpot>,
      hotWater: Array.from({ length: this.cfg.hotWaterSlotCount }, () => null),
      potSlots: Array.from({ length: this.cfg.potCount }, () => createPot(this.cfg.mixClicks)),
      ihBurners: Array.from({ length: this.cfg.ihBurnerCount }, () => null),
      washer: createWasher(),
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
    updateWasher(s.washer, dt);
    for (const pack of s.hotWater) if (pack) soakPack(pack, dt, this.cfg); // 熱湯に浸かっている間だけ温まる
    for (const pot of s.ihBurners) if (pot) updateHeat(pot, dt); // 加熱が進むのはIHに載っている間だけ
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

  // 右クリック：冷蔵庫に視点が合っていれば扉を開閉、それ以外は手に持っている物を捨てる
  rightClick(target: Target | null): void {
    if (this.state.phase !== 'playing') return;
    if (target && (target.kind === 'fridgeDoor' || target.kind === 'fridgeTray' || (target.kind === 'stock' && target.inFridge))) {
      this.state.fridgeOpen = !this.state.fridgeOpen;
      return;
    }
    if (this.state.hand?.kind === 'bottle') {
      this.useBottle(target);
      return;
    }
    this.discard();
  }

  // ボトルを持っているとき、右クリックでサラダの皿にかける・振る。ボトルは手に残る
  private useBottle(target: Target | null): void {
    const hand = this.state.hand;
    if (hand?.kind !== 'bottle') return;
    const plate = this.plateForBottle(hand.id, target);
    if (!plate) {
      this.say(BOTTLE_PLATE[hand.id] === 'salad' ? 'サラダの皿に視点を合わせて右クリック' : 'パスタの皿に視点を合わせて右クリック', 'info');
      return;
    }
    plate.push(hand.id);
    this.say(`${INGREDIENTS[hand.id].name}を${BOTTLE_VERB[hand.id]}`, 'info');
  }

  // 視点が合っている皿のうち、このボトルをかけられるもの（サラダの皿 / パスタの皿。中身を増やせる間だけ）。なければ null
  private plateForBottle(id: BottleId, target: Target | null): IngredientId[] | null {
    if (target?.kind !== 'plateSlot') return null;
    const isSaladSlot = target.index >= this.cfg.plateSlotCount;
    if (isSaladSlot !== (BOTTLE_PLATE[id] === 'salad')) return null;
    const plate = this.state.plateSlots[target.index];
    return plate && plate.length < this.cfg.maxPlateContents ? plate : null;
  }

  // IHの鍋に視点が合っていて、いま混ぜられるなら、その進み具合（HUD の案内に使う）。なければ null
  mixProgressAt(target: Target | null): { done: number; need: number } | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.hand || target?.kind !== 'ihBurner') return null;
    const pot = s.ihBurners[target.index];
    return pot && canMix(pot) ? { done: pot.mixCount, need: pot.mixNeed } : null;
  }

  // 手に持ったボトルを右クリックでかけられる場所か（HUD の案内に使う）
  canUseBottleAt(target: Target | null): boolean {
    const hand = this.state.hand;
    return this.state.phase === 'playing' && hand?.kind === 'bottle' && this.plateForBottle(hand.id, target) !== null;
  }

  // 手に持ったボトルを、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 位置は天板の内側に収める。置けない台や、ほかのボトルに近すぎる場所では valid = false（reason に理由）
  previewBottle(target: Target | null): BottlePreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'bottle' || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const size = SURFACES[surface];
    const halfW = size.width / 2 - BOTTLE_EDGE;
    const halfD = size.depth / 2 - BOTTLE_EDGE;
    const x = Math.min(halfW, Math.max(-halfW, target.x));
    const z = Math.min(halfD, Math.max(-halfD, target.z));

    if (!BOTTLE_SURFACES[hand.id].includes(surface)) return { id: hand.id, surface, x, z, valid: false, reason: 'surface' };
    const tooClose = BOTTLE_IDS.some((id) => {
      const spot = s.bottles[id];
      return id !== hand.id && spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < BOTTLE_GAP;
    });
    return tooClose
      ? { id: hand.id, surface, x, z, valid: false, reason: 'gap' }
      : { id: hand.id, surface, x, z, valid: true };
  }

  // 手に持っている物を捨てる
  discard(): void {
    const s = this.state;
    if (s.phase !== 'playing' || !s.hand) return;
    if (s.hand.kind === 'bottle') {
      this.say('ボトルは捨てられない（台の上に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'tray') {
      this.say('トレー・ケースは捨てられない（サラダ台の上に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'pot') {
      // 鍋は総数が決まっているので、捨てると循環から消えてしまう
      this.say('鍋は捨てられない', 'info');
      return;
    }
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
        return () => (s.hand = { kind: 'rawNoodle', id: 'noodle' });

      case 'plateStack':
        if (hand) return null;
        return () => (s.hand = { kind: 'plate', contents: [], style: target.style ?? 'plate' });

      case 'stock':
        if (target.inFridge && !s.fridgeOpen) return null; // 扉が閉まっていると取れない
        if (!hand) return () => (s.hand = stockItem(target.id, this.cfg)); // お玉1杯・パック1つ・1掴みなど
        // コーンスープのパックだけ、クリックした回数だけ重ねて持てる（最大5つ）
        if (canStackPack(hand, target.id, this.cfg)) return () => hand.packs.push(createPack(target.id));
        return null;

      case 'fridgeTray':
        // 冷蔵庫の中のトレー・ケース。取って、サラダ台の置き場に置く
        if (hand || !s.fridgeOpen || s.trays[target.id] !== 'fridge') return null;
        return () => {
          s.hand = { kind: 'tray', id: target.id };
          s.trays[target.id] = 'hand';
        };

      case 'traySlot':
        // 同じ種類の置き場にだけ置ける
        if (hand?.kind === 'tray' && hand.id === target.id) {
          return () => {
            s.trays[target.id] = 'table';
            s.hand = null;
          };
        }
        // 置いたものから1回分を取る：ほうれん草（トングで1掴み）、塩オイルソース（お玉1杯）
        if (!hand && s.trays[target.id] === 'table') {
          return () => (s.hand = { kind: 'ingredient', id: TRAY_CONTENT[target.id] });
        }
        return null;

      case 'fridgeDoor':
        // 左クリックでは開かない（右クリックで開閉）。閉まっている間だけ案内を出す
        if (s.fridgeOpen) return null;
        return () => this.say('右クリックで冷蔵庫を開ける', 'info');

      case 'bottle': {
        if (hand || !s.bottles[target.id]) return null;
        return () => {
          s.hand = { kind: 'bottle', id: target.id };
          s.bottles[target.id] = null;
        };
      }

      case 'tableTop': {
        const p = this.previewBottle(target);
        if (!p?.valid) return null;
        return () => {
          s.bottles[p.id] = { surface: p.surface, x: p.x, z: p.z };
          s.hand = null;
        };
      }

      case 'boilerBasket': {
        const b = s.boilers[target.index];
        if (b.state === 'empty' && hand?.kind === 'rawNoodle') {
          return () => {
            setNoodle(b, hand.id);
            s.hand = null;
          };
        }
        if (b.state === 'lifted' && !hand) {
          return () => {
            const noodle = takeNoodle(b);
            if (noodle) s.hand = { kind: 'ingredient', id: noodle };
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
            s.hand = { kind: 'plate', contents: slot, style: s.plateStyles[target.index] };
            s.plateSlots[target.index] = null;
          };
        }
        if (hand?.kind === 'plate' && !slot) {
          return () => {
            s.plateSlots[target.index] = hand.contents;
            s.plateStyles[target.index] = hand.style ?? 'plate';
            s.hand = null;
          };
        }
        // 温まったコーンスープのパックを、空のスープ皿に入れる（1皿に1つ）
        if (hand?.kind === 'pack' && slot && s.plateStyles[target.index] === 'bowl' && slot.length === 0) {
          const i = findWarmPack(hand.packs, 'cornSoup');
          if (i >= 0) {
            return () => {
              slot.push('cornSoup');
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
            };
          }
        }
        if (hand?.kind === 'ingredient' && slot && slot.length < this.cfg.maxPlateContents) {
          return () => {
            slot.push(hand.id);
            s.hand = null;
          };
        }
        // 加熱し終えた鍋の中身（ソース、または麺とソース）を皿にかける。鍋は手に残る
        if (hand?.kind === 'pot' && slot && canPour(hand.pot, slot, this.cfg.maxPlateContents)) {
          return () => pourOnto(hand.pot, slot);
        }
        return null;
      }

      case 'servePass':
        if (hand?.kind !== 'plate') return null;
        return () => this.serve(hand);

      case 'potSlot': {
        const pot = s.potSlots[target.index];
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.potSlots[target.index] = null;
          };
        }
        // 戻せるのは洗い済みの鍋だけ
        if (hand?.kind === 'pot' && !hand.pot.dirty && !pot) {
          return () => {
            s.potSlots[target.index] = hand.pot;
            s.hand = null;
          };
        }
        return null;
      }

      case 'ihBurner': {
        const pot = s.ihBurners[target.index];
        // 麺を入れた鍋は、混ぜ終わるまで持ち上げられない。手が空のクリックで混ぜる（3回）
        if (!hand && pot && canMix(pot)) {
          return () => {
            mixPot(pot);
            this.say(pot.mixCount >= pot.mixNeed ? 'よく混ざった！' : `混ぜる ${pot.mixCount}/${pot.mixNeed}`, 'info');
          };
        }
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.ihBurners[target.index] = null;
          };
        }
        if (hand?.kind === 'pot' && !pot) {
          return () => {
            s.ihBurners[target.index] = hand.pot;
            s.hand = null;
            this.tryAutoHeat(hand.pot);
          };
        }
        // 載せた鍋に、ソース（加熱前）や麺（加熱完了後）を入れる
        if (hand?.kind === 'ingredient' && pot && canAddIngredient(pot, hand.id, this.cfg.maxPotContents)) {
          return () => {
            addIngredient(pot, hand.id);
            s.hand = null;
            this.tryAutoHeat(pot);
          };
        }
        // 熱湯で温まったパック（カルボナーラ）は、加熱前の鍋に入れられる
        if (hand?.kind === 'pack' && pot) {
          const i = hand.packs.findIndex((p) => p.warm && canAddIngredient(pot, p.id, this.cfg.maxPotContents));
          if (i >= 0) {
            return () => {
              addIngredient(pot, hand.packs[i].id);
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
              this.tryAutoHeat(pot);
            };
          }
        }
        return null;
      }

      case 'hotWaterSlot': {
        const cell = s.hotWater[target.index];
        // 手に持っているパックを、空いている場所に1つ浸ける
        if (hand?.kind === 'pack' && !cell) {
          return () => {
            s.hotWater[target.index] = hand.packs.pop()!;
            if (hand.packs.length === 0) s.hand = null;
          };
        }
        // 浸けているパックを取る。手が空いているか、同じ種類のパックを持っていて、まだ持てるときだけ
        if (cell && (!hand || canStackPack(hand, cell.id, this.cfg))) {
          return () => {
            if (hand) hand.packs.push(cell);
            else s.hand = { kind: 'pack', packs: [cell] };
            s.hotWater[target.index] = null;
          };
        }
        return null;
      }

      case 'washer': {
        const w = s.washer;
        if (hand?.kind === 'pot' && canInsert(w, hand.pot)) {
          return () => {
            insertPot(w, hand.pot, this.cfg);
            s.hand = null;
          };
        }
        if (!hand && w.pot && !isWashing(w)) {
          return () => {
            const pot = takeWashedPot(w);
            if (pot) s.hand = { kind: 'pot', pot };
          };
        }
        return null;
      }
    }
  }

  planDoubleClick(target: Target): Action | null {
    if (this.state.phase !== 'playing') return null;
    if (target.kind !== 'boilerBasket' && target.kind !== 'boilerButton') return null;
    const b = this.state.boilers[target.index];
    if (b.state !== 'overdue') return null;
    return () => startShortBoil(b, this.cfg);
  }

  // IHに載っている鍋の中身が既定のソース（recipe.ts の sauce）になったら、ボタンなしで加熱を始める
  private tryAutoHeat(pot: Pot): void {
    if (pot.heat !== 'cold') return;
    const recipe = findSauceRecipe(pot.contents);
    if (recipe && startHeating(pot, this.cfg)) this.say(`${recipe.name}のソース 加熱開始`, 'info');
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
      return item.id === 'penne' ? 'ペンネ' : '生麺';
    case 'ingredient':
      return INGREDIENTS[item.id].name;
    case 'pack': {
      const name = INGREDIENTS[item.packs[0].id].name;
      const warm = item.packs.filter((p) => p.warm).length;
      if (item.packs.length === 1) return `${name}パック（${warm ? '温まった' : '冷たい'}）`;
      return `${name}パック×${item.packs.length}（温まった ${warm}）`;
    }
    case 'tray':
      return TRAY_NAME[item.id];
    case 'bottle':
      return `${INGREDIENTS[item.id].name}（ボトル）`;
    case 'pot': {
      const { pot } = item;
      if (pot.contents.length === 0) return pot.dirty ? '鍋（使用済み）' : '鍋';
      const heat = { cold: '未加熱', heating: '加熱中', ready: '完成' }[pot.heat];
      return `鍋（${heat}：${pot.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
    case 'plate': {
      const kind = { plate: '皿', small: '小皿', bowl: 'スープ皿' }[item.style ?? 'plate'];
      return item.contents.length === 0
        ? `${kind}（空）`
        : `${kind}（${item.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
  }
}
