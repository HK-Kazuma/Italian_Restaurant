import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { BAKE_DISH, LEFT_COUNTER, OVEN, OVEN_BELT, OVEN_COUNTER, OVEN_Z, SURFACES } from './layout';
import {
  OVEN_END_S,
  OVEN_ENTRY_S,
  OVEN_EXIT_S,
  beltSpeed,
  canPlaceDish,
  canTakeDish,
  createOven,
  emergedCount,
  isEmerged,
  placeDish,
  remainingTime,
  takeDish,
  updateOven,
} from './oven';
import type { Target } from './types';

// dt ずつ、合計 total 秒進める
function run(oven: ReturnType<typeof createOven>, total: number, dt = 0.05) {
  for (let t = 0; t < total - 1e-9; t += dt) updateOven(oven, Math.min(dt, total - t), cfg);
}

describe('ジェットオーブンの大きさ・並び', () => {
  it('入口・出口は、皿が縦向きで3つ（流れの向き）並ぶ長さ + 0.5個分、横に2つ並ぶ幅', () => {
    expect(OVEN_BELT.length).toBeCloseTo(3.5 * BAKE_DISH.w);
    expect(OVEN_BELT.lanes).toBe(2);
    expect(OVEN_BELT.laneW).toBeGreaterThanOrEqual(BAKE_DISH.d);
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
  it('上段は ovenUpperTime 秒、下段は ovenLowerTime 秒で、皿が出てくる（取れる）', () => {
    for (const [deck, time] of [['upper', cfg.ovenUpperTime], ['lower', cfg.ovenLowerTime]] as const) {
      const oven = createOven();
      expect(placeDish(oven, deck, 0)).toBe(true);
      run(oven, time - 0.5);
      expect(canTakeDish(oven, deck, 0)).toBe(false);
      run(oven, 1);
      expect(canTakeDish(oven, deck, 0)).toBe(true);
    }
  });

  it('テスト用の時間は 上段 30秒・下段 50秒（本番は 40秒・80秒）', () => {
    expect(cfg.ovenUpperTime).toBe(30);
    expect(cfg.ovenLowerTime).toBe(50);
    expect(beltSpeed('upper', cfg)).toBeGreaterThan(beltSpeed('lower', cfg));
  });

  it('出てきた皿は、出口の突き当たりまで進んで止まる', () => {
    const oven = createOven();
    placeDish(oven, 'upper', 1);
    run(oven, 200);
    expect(oven.decks.upper[0].s).toBeCloseTo(OVEN_END_S);
    expect(oven.decks.upper[0].s).toBeLessThanOrEqual(OVEN_BELT.length * 2 + OVEN_BELT.body);
  });

  it('入口の端は、前の皿が離れるまで置けない。レーンが違えば同時に置ける', () => {
    const oven = createOven();
    expect(placeDish(oven, 'upper', 0)).toBe(true);
    expect(canPlaceDish(oven, 'upper', 0)).toBe(false);
    expect(placeDish(oven, 'upper', 0)).toBe(false);
    expect(placeDish(oven, 'upper', 1)).toBe(true);
    expect(canPlaceDish(oven, 'lower', 0)).toBe(true); // 段が違えば別のベルト
    run(oven, 6);
    expect(canPlaceDish(oven, 'upper', 0)).toBe(true);
  });

  it('レーンの番号が範囲外なら置けない', () => {
    const oven = createOven();
    expect(canPlaceDish(oven, 'upper', -1)).toBe(false);
    expect(canPlaceDish(oven, 'upper', OVEN_BELT.lanes)).toBe(false);
  });

  it('出口では、1レーンに3枚まで並べる。4枚目は本体の中で待つ（取れない）', () => {
    const oven = createOven();
    for (let i = 0; i < 4; i++) {
      placeDish(oven, 'upper', 0);
      run(oven, 5); // 入口の端が空くまで
    }
    run(oven, 200);
    const s = oven.decks.upper.map((d) => d.s).sort((a, b) => b - a);
    expect(s.filter(isEmerged)).toHaveLength(3);
    expect(isEmerged(s[3])).toBe(false);
    expect(emergedCount(oven, 'upper')).toBe(3);
    // 重ならない
    for (let i = 1; i < s.length; i++) expect(s[i - 1] - s[i]).toBeGreaterThanOrEqual(BAKE_DISH.w);
    // 1枚取ると、待っていた皿が進んで出てくる
    expect(takeDish(oven, 'upper', 0)).toBe(true);
    run(oven, 60);
    expect(emergedCount(oven, 'upper')).toBe(3);
  });

  it('取る皿は、いちばん先のもの。出ていなければ取れない', () => {
    const oven = createOven();
    expect(takeDish(oven, 'upper', 0)).toBe(false);
    placeDish(oven, 'upper', 0);
    expect(takeDish(oven, 'upper', 0)).toBe(false);
    run(oven, cfg.ovenUpperTime + 1);
    placeDish(oven, 'upper', 0);
    run(oven, 5);
    const first = oven.decks.upper.find((d) => isEmerged(d.s))!;
    expect(takeDish(oven, 'upper', 1)).toBe(false); // 別のレーンの皿は取れない
    expect(takeDish(oven, 'upper', 0)).toBe(true);
    expect(oven.decks.upper.some((d) => d.id === first.id)).toBe(false);
    expect(oven.decks.upper).toHaveLength(1); // 出ていない皿は残る
  });

  it('残り時間は、いちばん出口に近い皿が出てくるまで', () => {
    const oven = createOven();
    expect(remainingTime(oven, 'upper', cfg)).toBeNull();
    placeDish(oven, 'upper', 0);
    expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime);
    run(oven, 10);
    expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime - 10);
    expect(remainingTime(oven, 'lower', cfg)).toBeNull();
  });

  it('置いた直後の皿は、入口の端にぴったりある', () => {
    const oven = createOven();
    placeDish(oven, 'lower', 0);
    expect(oven.decks.lower[0].s).toBeCloseTo(OVEN_ENTRY_S);
    expect(OVEN_EXIT_S - OVEN_ENTRY_S).toBeCloseTo(OVEN_BELT.length + OVEN_BELT.body);
  });
});

describe('ジェットオーブンの操作（Game）', () => {
  const stock: Target = { kind: 'ovenStock' };
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
    g.interact(stock);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', baked: false });
    g.interact(inlet('upper'));
    expect(g.state.hand).toBeNull();
    expect(g.state.oven.decks.upper).toHaveLength(1);

    expect(g.planInteract(outlet('upper'))).toBeNull(); // まだ出てきていない
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(outlet('upper'));
    expect(g.state.hand).toEqual({ kind: 'bakeDish', baked: true });
    expect(g.state.oven.decks.upper).toHaveLength(0);
  });

  it('下段に流すと、上段より遅く出てくる', () => {
    const g = newGame();
    g.interact(stock);
    g.interact(inlet('lower'));
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    expect(g.planInteract(outlet('lower'))).toBeNull();
    for (let t = 0; t < cfg.ovenLowerTime - cfg.ovenUpperTime; t++) g.update(1);
    expect(g.planInteract(outlet('lower'))).not.toBeNull();
  });

  it('手が空のときだけ焼き皿を取れる。焼き上がった皿は入口に流せない', () => {
    const g = newGame();
    g.interact(stock);
    expect(g.planInteract(stock)).toBeNull(); // 手がふさがっている
    g.state.hand = { kind: 'bakeDish', baked: true };
    expect(g.planInteract(inlet('upper'))).toBeNull();
    g.state.hand = null;
    expect(g.planInteract(inlet('upper'))).toBeNull(); // 手が空では流せない
  });

  it('入口の端がふさがっているレーンには流せない', () => {
    const g = newGame();
    g.interact(stock);
    g.interact(inlet('upper', 0));
    g.interact(stock);
    expect(g.planInteract(inlet('upper', 0))).toBeNull();
    expect(g.planInteract(inlet('upper', 1))).not.toBeNull();
  });

  it('手が空でないと、出口の皿は取れない', () => {
    const g = newGame();
    g.interact(stock);
    g.interact(inlet('upper'));
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.state.hand = { kind: 'bakeDish', baked: false };
    expect(g.planInteract(outlet('upper'))).toBeNull();
  });

  it('練習・ゲームを始め直すと、オーブンは空に戻る', () => {
    const g = newGame();
    g.interact(stock);
    g.interact(inlet('upper'));
    g.startPractice();
    expect(g.state.oven.decks.upper).toHaveLength(0);
    expect(g.state.oven.decks.lower).toHaveLength(0);
  });
});
