import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import type { Target } from './types';

const rack: Target = { kind: 'noodleRack' };
const basket = (index: number): Target => ({ kind: 'boilerBasket', index });
const button = (index: number): Target => ({ kind: 'boilerButton', index });
const slot = (index: number): Target => ({ kind: 'plateSlot', index });
const tarakoSauce: Target = { kind: 'topping', id: 'tarakoSauce' };
const nori: Target = { kind: 'topping', id: 'nori' };
const plateStack: Target = { kind: 'plateStack' };
const pass: Target = { kind: 'servePass' };

function newGame() {
  const g = new Game(cfg, () => 0.5);
  g.start();
  return g;
}

// 麺をセットして茹で上がりまで進める
function boilNoodle(g: Game, i = 0) {
  g.interact(rack);
  g.interact(basket(i));
  g.interact(button(i));
  g.update(cfg.boilTime + 1);
}

// 皿を台に置き、麺・たらこソース・のりを載せる
function plateTarako(g: Game) {
  g.interact(plateStack);
  g.interact(slot(0));
  g.interact(basket(0));
  g.interact(slot(0));
  g.interact(tarakoSauce);
  g.interact(slot(0));
  g.interact(nori);
  g.interact(slot(0));
}

describe('Game: たらこのパスタを1皿出す', () => {
  it('茹でて盛って提供するとスコアが入り、伝票が消える', () => {
    const g = newGame();
    g.update(0.1);
    boilNoodle(g);
    expect(g.state.boilers[0].state).toBe('lifted');
    const before = g.state.tickets.length;
    expect(before).toBeGreaterThan(0);

    plateTarako(g);
    expect(g.state.plateSlots[0]).toEqual(['noodle', 'tarakoSauce', 'nori']);

    g.interact(slot(0)); // 皿を手に取る
    g.interact(pass);
    expect(g.state.score).toBeGreaterThan(0);
    expect(g.state.served).toBe(1);
    expect(g.state.combo).toBe(1);
    expect(g.state.tickets.length).toBe(before - 1);
    expect(g.state.hand).toBeNull();
  });

  it('中身が違う皿は注文ミスで減点・コンボ切れ', () => {
    const g = newGame();
    g.state.score = 100;
    g.state.combo = 4;
    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(tarakoSauce);
    g.interact(slot(0));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.score).toBe(100 - cfg.orderMissPenalty);
    expect(g.state.combo).toBe(0);
    expect(g.state.mistakes).toBe(1);
  });
});

describe('Game: 手持ちのルール', () => {
  it('手に持てるのは1つだけ', () => {
    const g = newGame();
    g.interact(rack);
    expect(g.planInteract(plateStack)).toBeNull();
    expect(g.state.hand).toEqual({ kind: 'rawNoodle' });
  });
  it('右クリックで捨てられる', () => {
    const g = newGame();
    g.interact(rack);
    g.discard();
    expect(g.state.hand).toBeNull();
  });
  it('麺は上がっている間しか取れない', () => {
    const g = newGame();
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(10);
    expect(g.planInteract(basket(0))).toBeNull(); // 茹で中
  });
});

describe('Game: のびかけとショート茹で', () => {
  it('猶予を過ぎたら麺を取れず、ダブルクリックで復活する', () => {
    const g = newGame();
    boilNoodle(g);
    g.update(cfg.graceTime + 1);
    expect(g.state.boilers[0].state).toBe('overdue');

    g.interact(basket(0));
    expect(g.state.hand).toBeNull();

    g.doubleClick(basket(0));
    expect(g.state.boilers[0].state).toBe('shortBoil');
    g.update(cfg.shortBoilTime + 0.1);
    g.interact(basket(0));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'noodle' });
  });
});

describe('Game: 進行', () => {
  it('伝票が届き、制限時間でリザルトになる', () => {
    const g = newGame();
    g.update(cfg.firstTicketAt + 0.1);
    expect(g.state.tickets.length).toBe(1);
    g.update(cfg.gameDuration);
    expect(g.state.phase).toBe('result');
  });
  it('一時停止中は進まない', () => {
    const g = newGame();
    g.pause();
    g.update(10);
    expect(g.state.time).toBe(0);
    g.resume();
    g.update(10);
    expect(g.state.time).toBe(10);
  });
  it('伝票は上限を超えて並ばない', () => {
    const g = newGame();
    for (let i = 0; i < 200; i++) g.update(1);
    expect(g.state.tickets.length).toBeLessThanOrEqual(cfg.maxOpenTickets);
  });
});
