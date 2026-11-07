import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { BAKE_DISH, BAKE_DISHES, LEFT_COUNTER, OVEN, OVEN_BELT, OVEN_COUNTER, OVEN_Z, SURFACES } from './layout';
import {
  beltSpeed,
  canPlaceDish,
  canTakeDish,
  createOven,
  emergedCount,
  endS,
  entryS,
  exitS,
  isEmerged,
  laneOfOffset,
  placeDish,
  remainingTime,
  takeDish,
  updateOven,
} from './oven';
import type { BakeStyle, Target } from './types';

// dt ずつ、合計 total 秒進める
function run(oven: ReturnType<typeof createOven>, total: number, dt = 0.05) {
  for (let t = 0; t < total - 1e-9; t += dt) updateOven(oven, Math.min(dt, total - t), cfg);
}

const STYLES: BakeStyle[] = ['doria', 'pizza'];
const TOTAL = OVEN_BELT.length * 2 + OVEN_BELT.body;

describe('ジェットオーブンの大きさ・並び', () => {
  it('入口・出口は、ドリア系（長い辺が流れの向き）が流れの向きに2つ並ぶ長さ + 0.5個分、横に3つ並ぶ幅', () => {
    expect(BAKE_DISH.w).toBeGreaterThan(BAKE_DISH.d); // 横向き（長い辺が流れの向き）
    expect(OVEN_BELT.length).toBeCloseTo(2.5 * BAKE_DISH.w);
    expect(OVEN_BELT.margin).toBeCloseTo(0.5 * BAKE_DISH.w);
    expect(OVEN_BELT.lanes).toBe(3);
    expect(OVEN_BELT.laneW).toBeGreaterThanOrEqual(BAKE_DISH.d);
  });

  it('ピザ系は丸く、入口・出口には 流れの向きに2つ × 横に2つ収まる（3つは横に入らない）', () => {
    const pizza = BAKE_DISHES.pizza;
    expect(pizza.w).toBe(pizza.d); // 丸（外接する正方形）
    const beltWidth = OVEN_BELT.laneW * OVEN_BELT.lanes + OVEN_BELT.laneGap * (OVEN_BELT.lanes - 1);
    expect(2 * pizza.d).toBeLessThanOrEqual(beltWidth);
    expect(3 * pizza.d).toBeGreaterThan(beltWidth);
    expect(2 * pizza.w).toBeLessThanOrEqual(OVEN_BELT.length); // 流れの向きに2つ
    expect(3 * pizza.w).toBeGreaterThan(OVEN_BELT.length);
  });

  it('壁側（+z）から 具材台 → 入口 → 本体 → 出口 → 左の台 の順に、すき間なく並ぶ（提供台の後ろ側から提供台へ流れる）', () => {
    const counterFront = OVEN_COUNTER.z - OVEN_COUNTER.depth / 2;
    const leftCounterBack = LEFT_COUNTER.z + SURFACES.left.depth / 2; // 左の台の手前（+z）の端
    expect(counterFront).toBeGreaterThanOrEqual(OVEN_Z.inlet.maxZ);
    expect(OVEN_Z.inlet.minZ).toBeCloseTo(OVEN_Z.body.maxZ);
    expect(OVEN_Z.body.minZ).toBeCloseTo(OVEN_Z.outlet.maxZ);
    expect(OVEN_Z.outlet.minZ).toBeGreaterThanOrEqual(leftCounterBack);
    expect(OVEN_Z.outlet.minZ - leftCounterBack).toBeLessThan(0.1);
  });

  it('オーブンは左の台と同じ列（x）にあり、IHコンロより手前（+z）側にある', () => {
    expect(OVEN.x).toBe(LEFT_COUNTER.x);
    expect(OVEN_Z.outlet.minZ).toBeGreaterThan(-1.3); // IHコンロ（z: -2.3〜-1.3）より手前
  });
});

describe('ジェットオーブンのベルト', () => {
  it.each(STYLES)('%s：上段は ovenUpperTime 秒、下段は ovenLowerTime 秒で、皿が出てくる（取れる）', (style) => {
    for (const [deck, time] of [['upper', cfg.ovenUpperTime], ['lower', cfg.ovenLowerTime]] as const) {
      const oven = createOven();
      expect(placeDish(oven, deck, style, 1)).toBe(true);
      run(oven, time - 0.5);
      expect(canTakeDish(oven, deck, oven.decks[deck][0] ? laneOfOffset(oven.decks[deck][0].x) : 0)).toBe(false);
      run(oven, 1);
      expect(emergedCount(oven, deck)).toBe(1);
    }
  });

  it('テスト用の時間は 上段 30秒・下段 50秒（本番は 40秒・80秒）', () => {
    expect(cfg.ovenUpperTime).toBe(30);
    expect(cfg.ovenLowerTime).toBe(50);
    expect(beltSpeed('upper', 'doria', cfg)).toBeGreaterThan(beltSpeed('lower', 'doria', cfg));
  });

  it.each(STYLES)('%s：出てきた皿は、出口の端（余白のコンベアの先）まで流れて止まる', (style) => {
    const oven = createOven();
    placeDish(oven, 'upper', style, 1);
    run(oven, 200);
    const d = oven.decks.upper[0];
    expect(d.s).toBeCloseTo(endS(style));
    expect(d.s + BAKE_DISHES[style].w / 2).toBeCloseTo(TOTAL);
    expect(d.s).toBeGreaterThan(exitS(style) - 1e-6);
  });

  it('入口の最初の置き場は、前の皿が離れるまで置けない。ドリア系は3レーン同時に置ける', () => {
    const oven = createOven();
    expect(placeDish(oven, 'upper', 'doria', 0)).toBe(true);
    expect(canPlaceDish(oven, 'upper', 'doria', 0)).toBe(false);
    expect(placeDish(oven, 'upper', 'doria', 0)).toBe(false);
    expect(placeDish(oven, 'upper', 'doria', 1)).toBe(true);
    expect(placeDish(oven, 'upper', 'doria', 2)).toBe(true);
    expect(canPlaceDish(oven, 'lower', 'doria', 0)).toBe(true); // 段が違えば別のベルト
    run(oven, 8);
    expect(canPlaceDish(oven, 'upper', 'doria', 0)).toBe(true);
  });

  it('ピザ系は、入口の最初の置き場に横に2枚まで。3枚目は、前の皿が離れるまで置けない', () => {
    const oven = createOven();
    expect(placeDish(oven, 'upper', 'pizza', 1)).toBe(true); // 真ん中を狙うと、空いている置き場に置く
    expect(placeDish(oven, 'upper', 'pizza', 1)).toBe(true);
    expect(canPlaceDish(oven, 'upper', 'pizza', 1)).toBe(false);
    expect(oven.decks.upper.map((d) => d.x).sort((a, b) => a - b)).toEqual([-0.25, 0.25]);
    run(oven, 12);
    expect(canPlaceDish(oven, 'upper', 'pizza', 1)).toBe(true);
  });

  it('ピザ系は、狙ったレーンに近い置き場に置く（奥のレーン → 奥側、手前のレーン → 手前側）', () => {
    const oven = createOven();
    placeDish(oven, 'upper', 'pizza', 0);
    placeDish(oven, 'upper', 'pizza', 2);
    expect(oven.decks.upper.map((d) => Math.sign(d.x))).toEqual([-1, 1]);
  });

  it('ドリア系とピザ系は、重なる場所には置けない', () => {
    const oven = createOven();
    placeDish(oven, 'upper', 'pizza', 1);
    placeDish(oven, 'upper', 'pizza', 1); // 横いっぱい
    expect(canPlaceDish(oven, 'upper', 'doria', 0)).toBe(false);
    expect(canPlaceDish(oven, 'upper', 'doria', 2)).toBe(false);
    expect(canPlaceDish(oven, 'lower', 'doria', 0)).toBe(true);
  });

  it('レーンの番号が範囲外なら置けない', () => {
    const oven = createOven();
    for (const style of STYLES) {
      expect(canPlaceDish(oven, 'upper', style, -1)).toBe(false);
      expect(canPlaceDish(oven, 'upper', style, OVEN_BELT.lanes)).toBe(false);
    }
  });

  it('出口では、ドリア系は1レーンに2枚まで並ぶ（余白のコンベアまで流れる）。3枚目は本体の中で待つ（取れない）', () => {
    const oven = createOven();
    for (let i = 0; i < 3; i++) {
      placeDish(oven, 'upper', 'doria', 0);
      run(oven, 8); // 入口の最初の置き場が空くまで
    }
    run(oven, 200);
    const s = oven.decks.upper.map((d) => d.s).sort((a, b) => b - a);
    expect(s[0]).toBeCloseTo(endS('doria'));
    expect(s[0] + BAKE_DISH.w / 2).toBeCloseTo(TOTAL); // ベルトの端まで流れる
    expect(emergedCount(oven, 'upper')).toBe(2);
    expect(isEmerged({ style: 'doria', s: s[2] })).toBe(false);
    for (let i = 1; i < s.length; i++) expect(s[i - 1] - s[i]).toBeGreaterThanOrEqual(BAKE_DISH.w - 1e-6); // 重ならない
    // 1枚取ると、待っていた皿が進んで出てくる
    expect(takeDish(oven, 'upper', 0)).not.toBeNull();
    run(oven, 60);
    expect(emergedCount(oven, 'upper')).toBe(2);
  });

  it('出口では、ピザ系は 流れの向きに2枚 × 横に2枚（計4枚）まで並ぶ。残りは本体の中で待つ', () => {
    const oven = createOven();
    for (let round = 0; round < 3; round++) {
      placeDish(oven, 'upper', 'pizza', 1);
      placeDish(oven, 'upper', 'pizza', 1); // 横に2枚
      run(oven, 12); // 入口の最初の置き場が空くまで
    }
    run(oven, 300);
    expect(oven.decks.upper).toHaveLength(6);
    expect(emergedCount(oven, 'upper')).toBe(4); // 3組目の2枚は本体の中で待つ
    const front = oven.decks.upper.filter((d) => isEmerged(d));
    expect(front.filter((d) => d.x < 0)).toHaveLength(2);
    expect(front.filter((d) => d.x > 0)).toHaveLength(2);
  });

  it('取る皿は、そのレーンの、いちばん先のもの。出ていなければ取れない。取った皿の種類が分かる', () => {
    const oven = createOven();
    expect(takeDish(oven, 'upper', 0)).toBeNull();
    placeDish(oven, 'upper', 'doria', 0);
    expect(takeDish(oven, 'upper', 0)).toBeNull();
    run(oven, cfg.ovenUpperTime + 1);
    placeDish(oven, 'upper', 'doria', 0);
    run(oven, 5);
    const first = oven.decks.upper.find((d) => isEmerged(d))!;
    expect(takeDish(oven, 'upper', 1)).toBeNull(); // 別のレーンの皿は取れない
    const taken = takeDish(oven, 'upper', 0);
    expect(taken?.id).toBe(first.id);
    expect(taken?.style).toBe('doria');
    expect(oven.decks.upper).toHaveLength(1); // 出ていない皿は残る
  });

  it('ピザ系は、横にかかる2つのレーンのどちらからでも取れる', () => {
    const oven = createOven();
    placeDish(oven, 'upper', 'pizza', 2); // 手前側
    run(oven, cfg.ovenUpperTime + 1);
    expect(canTakeDish(oven, 'upper', 0)).toBe(false); // 奥のレーンにはかからない
    expect(canTakeDish(oven, 'upper', 1)).toBe(true);
    expect(canTakeDish(oven, 'upper', 2)).toBe(true);
    expect(takeDish(oven, 'upper', 1)?.style).toBe('pizza');
  });

  it('残り時間は、いちばん出口に近い皿が出てくるまで（皿の種類によらず、置いてから ovenUpperTime 秒）', () => {
    for (const style of STYLES) {
      const oven = createOven();
      expect(remainingTime(oven, 'upper', cfg)).toBeNull();
      placeDish(oven, 'upper', style, 1);
      expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime);
      run(oven, 10);
      expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime - 10);
      expect(remainingTime(oven, 'lower', cfg)).toBeNull();
    }
  });

  it('置いた直後の皿は、入口の最初の置き場にある（ドリア系は外側の余白のすぐ内側）', () => {
    const oven = createOven();
    placeDish(oven, 'lower', 'doria', 0);
    const d = oven.decks.lower[0];
    expect(d.s).toBeCloseTo(entryS('doria'));
    expect(d.s - BAKE_DISH.w / 2).toBeCloseTo(OVEN_BELT.margin);
    expect(exitS('doria') - entryS('doria')).toBeCloseTo(OVEN_BELT.length + OVEN_BELT.body - OVEN_BELT.margin);
  });

  it('速い皿が前の遅い皿に追いついても、重ならない（横がかかるときだけ止まる）', () => {
    const oven = createOven();
    oven.decks.upper.push({ id: 1, style: 'pizza', x: -0.25, s: endS('pizza') }); // 出口の端で止まっている
    oven.decks.upper.push({ id: 2, style: 'doria', x: -0.36, s: exitS('doria') }); // 横がかかる（-0.36 の皿は -0.25 の丸にかかる）
    oven.decks.upper.push({ id: 3, style: 'doria', x: 0.36, s: exitS('doria') }); // 横はかからない
    run(oven, 100);
    const [pizza, blocked, free] = oven.decks.upper;
    expect(blocked.s).toBeLessThanOrEqual(pizza.s - (BAKE_DISHES.pizza.w + BAKE_DISH.w) / 2 + 1e-6);
    expect(free.s).toBeCloseTo(endS('doria')); // 邪魔されずに端まで進む
  });
});

describe('ジェットオーブンの操作（Game）', () => {
  const stock = (style: BakeStyle = 'doria'): Target => ({ kind: 'ovenStock', style });
  const inlet = (deck: 'upper' | 'lower', lane = 0): Target => ({ kind: 'ovenInlet', deck, lane });
  const outlet = (deck: 'upper' | 'lower', lane = 0): Target => ({ kind: 'ovenOutlet', deck, lane });
  const newGame = () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.state.nextTicketAt = Infinity;
    return g;
  };

  it('具材台で焼き皿を取り、入口に流して、時間がたつと出口で取れる（焼き上がり）', () => {
    const g = newGame();
    g.interact(stock());
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', baked: false });
    g.interact(inlet('upper'));
    expect(g.state.hand).toBeNull();
    expect(g.state.oven.decks.upper).toHaveLength(1);

    expect(g.planInteract(outlet('upper'))).toBeNull(); // まだ出てきていない
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(outlet('upper'));
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', baked: true });
    expect(g.state.oven.decks.upper).toHaveLength(0);
  });

  it('ピザ系の皿も、同じように流せて、焼き上がった皿はピザ系のまま取れる', () => {
    const g = newGame();
    g.interact(stock('pizza'));
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'pizza', baked: false });
    g.interact(inlet('lower', 1));
    expect(g.state.oven.decks.lower[0].style).toBe('pizza');
    for (let t = 0; t < cfg.ovenLowerTime + 1; t++) g.update(1);
    g.interact(outlet('lower', 1));
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'pizza', baked: true });
  });

  it('下段に流すと、上段より遅く出てくる', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('lower'));
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    expect(g.planInteract(outlet('lower'))).toBeNull();
    for (let t = 0; t < cfg.ovenLowerTime - cfg.ovenUpperTime; t++) g.update(1);
    expect(g.planInteract(outlet('lower'))).not.toBeNull();
  });

  it('手が空のときだけ焼き皿を取れる。焼き上がった皿は入口に流せない', () => {
    const g = newGame();
    g.interact(stock());
    expect(g.planInteract(stock())).toBeNull(); // 手がふさがっている
    g.state.hand = { kind: 'bakeDish', style: 'doria', baked: true };
    expect(g.planInteract(inlet('upper'))).toBeNull();
    g.state.hand = null;
    expect(g.planInteract(inlet('upper'))).toBeNull(); // 手が空では流せない
  });

  it('入口の最初の置き場がふさがっているレーンには流せない', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('upper', 0));
    g.interact(stock());
    expect(g.planInteract(inlet('upper', 0))).toBeNull();
    expect(g.planInteract(inlet('upper', 1))).not.toBeNull();
  });

  it('手が空でないと、出口の皿は取れない', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('upper'));
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.state.hand = { kind: 'bakeDish', style: 'doria', baked: false };
    expect(g.planInteract(outlet('upper'))).toBeNull();
  });

  it('練習・ゲームを始め直すと、オーブンは空に戻る', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('upper'));
    g.startPractice();
    expect(g.state.oven.decks.upper).toHaveLength(0);
    expect(g.state.oven.decks.lower).toHaveLength(0);
  });
});
