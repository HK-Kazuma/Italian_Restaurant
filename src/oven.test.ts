import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { BAKE_DISH, BAKE_DISHES, LEFT_COUNTER, OVEN, OVEN_BELT, OVEN_COUNTER, OVEN_COUNTER_SHELF, OVEN_Z, ROOM_MIN_X, SURFACES, WALL_HALF } from './layout';
import {
  beltSpeed,
  canPlaceDish,
  canTakeDish,
  clampPlacement,
  createOven,
  emergedCount,
  endS,
  exitS,
  frontS,
  isEmerged,
  laneOfOffset,
  placeDish,
  remainingTime,
  resolvePlacement,
  takeDish,
  timeToEmerge,
  updateOven,
} from './oven';
import type { BakeStyle, Target } from './types';

// dt ずつ、合計 total 秒進める
function run(oven: ReturnType<typeof createOven>, total: number, dt = 0.05) {
  for (let t = 0; t < total - 1e-9; t += dt) updateOven(oven, Math.min(dt, total - t), cfg);
}

const STYLES: BakeStyle[] = ['doria', 'pizza'];
const TOTAL = OVEN_BELT.length * 2 + OVEN_BELT.body;
const LANE_X = [-0.36, 0, 0.36]; // ドリア系を置く、3レーンの目安の横の位置

// ジェットに入る手前（frontS）に置く。x は横の位置
const put = (oven: ReturnType<typeof createOven>, deck: 'upper' | 'lower', style: BakeStyle, x = 0, s = frontS(style)) =>
  placeDish(oven, deck, style, { x, s });

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

  it('具材台は左の壁の内側の面まで伸びていて、右の端は左の台・オーブンの列の端のまま', () => {
    expect(OVEN_COUNTER.x - OVEN_COUNTER.width / 2).toBeCloseTo(ROOM_MIN_X + WALL_HALF);
    expect(OVEN_COUNTER.x + OVEN_COUNTER.width / 2).toBeCloseTo(LEFT_COUNTER.x + SURFACES.left.width / 2);
    expect(OVEN_COUNTER.width).toBeGreaterThan(SURFACES.left.width); // 伸びた
  });

  it('具材台の下は2段の棚で、棚板の上に、ドリア系の皿の山が収まる（広さは具材台と同じ）', () => {
    const { shelfTopY, topThickness, boardThickness, stacksPerTier, stackHeight } = OVEN_COUNTER_SHELF;
    expect(shelfTopY).toHaveLength(2);
    const stackTop = stackHeight * BAKE_DISH.h; // 山の高さ
    const ceiling = [shelfTopY[1] - boardThickness, 0.9 - topThickness]; // 各段の上にある棚板・天板の下面
    shelfTopY.forEach((y, tier) => expect(y + stackTop).toBeLessThanOrEqual(ceiling[tier]));
    expect(stacksPerTier * BAKE_DISH.w).toBeLessThanOrEqual(OVEN_COUNTER.depth); // 山が奥行きに収まる
  });

  it('オーブンは左の台と同じ列（x）にあり、IHコンロより手前（+z）側にある', () => {
    expect(OVEN.x).toBe(LEFT_COUNTER.x);
    expect(OVEN_Z.outlet.minZ).toBeGreaterThan(-1.3); // IHコンロ（z: -2.3〜-1.3）より手前
  });
});

describe('皿を置く場所（入口の手前から自由に）', () => {
  it.each(STYLES)('%s：入口のベルトの上の好きな場所に置ける（どこでも、ジェットに入る手前まで）', (style) => {
    const oven = createOven();
    const len = BAKE_DISHES[style].w;
    // 入口の端の近く、真ん中、ジェットに入る手前。どれも、置いた場所のまま
    for (const s of [len / 2, OVEN_BELT.length / 2, frontS(style)]) {
      const o = createOven();
      expect(put(o, 'upper', style, 0, s)).toBe(true);
      expect(o.decks.upper[0].s).toBeCloseTo(s);
    }
    expect(oven.decks.upper).toHaveLength(0);
  });

  it.each(STYLES)('%s：ジェットに入る先（本体の中）や、ベルトの外には置けず、手前の端に収まる', (style) => {
    expect(clampPlacement(style, 0, 99).s).toBeCloseTo(frontS(style)); // ジェットに入る手前まで
    expect(clampPlacement(style, 0, -99).s).toBeCloseTo(BAKE_DISHES[style].w / 2); // 入口の端まで
  });

  it('縦（流れの向き）は好きな位置のまま、横は決まった置き場にそろう（ドリア系は3レーン、ピザ系は2つ）', () => {
    // 縦は、どの位置でもそのまま
    for (const s of [0.3, 0.45, 0.6]) expect(clampPlacement('doria', 0, s).s).toBeCloseTo(s);
    // 横：ドリア系は3レーンのどれか
    expect(clampPlacement('doria', 0.05, 0.5).x).toBeCloseTo(0);
    expect(clampPlacement('doria', 0.3, 0.5).x).toBeCloseTo(0.36);
    expect(clampPlacement('doria', -0.2, 0.5).x).toBeCloseTo(-0.36);
    expect(clampPlacement('doria', 99, 0.5).x).toBeCloseTo(0.36); // 横の外へは出ない
    // 横：ピザ系は2つの置き場のどちらか
    expect(clampPlacement('pizza', 0.1, 0.5).x).toBeCloseTo(0.25);
    expect(clampPlacement('pizza', -0.4, 0.5).x).toBeCloseTo(-0.25);
  });

  it('横を自由にずらして狙っても、置かれる横の位置は置き場の位置になる', () => {
    const oven = createOven();
    expect(put(oven, 'upper', 'doria', 0.13, 0.5)).toBe(true);
    expect(oven.decks.upper[0].x).toBeCloseTo(0); // 真ん中のレーン
    expect(oven.decks.upper[0].s).toBeCloseTo(0.5); // 縦は狙ったまま
  });

  it('狙った置き場が埋まっていて、すぐ隣（ちょうど間を狙った）が空いていれば、空いている方に置く', () => {
    const oven = createOven();
    put(oven, 'upper', 'pizza', -0.25); // 奥側の置き場が埋まる
    // 真ん中を狙う（どちらの置き場にも同じ近さ）：空いている手前側に置かれる
    const p = resolvePlacement(oven, 'upper', 'pizza', { x: 0, s: frontS('pizza') });
    expect(p.valid).toBe(true);
    expect(p.x).toBeCloseTo(0.25);
    // 奥側をはっきり狙って、そこが埋まっているときは置けない（遠い置き場へは勝手に移さない）
    expect(resolvePlacement(oven, 'upper', 'pizza', { x: -0.4, s: frontS('pizza') }).valid).toBe(false);
  });

  it('ほかの皿に重なる場所には置けない。接するだけならよい', () => {
    const oven = createOven();
    const s0 = BAKE_DISH.w / 2 + BAKE_DISH.w; // 入口の端から、皿1枚ぶん空けた位置（後ろに、ちょうど皿1枚入る）
    expect(put(oven, 'upper', 'doria', 0, s0)).toBe(true);
    expect(canPlaceDish(oven, 'upper', 'doria', { x: 0.1, s: s0 + 0.1 })).toBe(false); // 重なる
    expect(canPlaceDish(oven, 'upper', 'doria', { x: 0, s: s0 - BAKE_DISH.w })).toBe(true); // 後ろに接する
    expect(canPlaceDish(oven, 'upper', 'doria', { x: 0.36, s: s0 })).toBe(true); // 横の隣のレーン（接する）
    expect(canPlaceDish(oven, 'lower', 'doria', { x: 0, s: s0 })).toBe(true); // 段が違えば別のベルト
  });

  it('ドリア系は、入口に 流れの向きに2つ × 横に3つ、すき間なく置ける', () => {
    const oven = createOven();
    const s2 = frontS('doria'); // ジェットに入る手前
    const s1 = s2 - BAKE_DISH.w; // その1つ後ろ（さらに後ろには、0.5個分の余白が残る）
    for (const s of [s1, s2]) for (const x of LANE_X) expect(put(oven, 'upper', 'doria', x, s)).toBe(true);
    expect(oven.decks.upper).toHaveLength(6);
    expect(s1 - BAKE_DISH.w / 2).toBeCloseTo(OVEN_BELT.margin); // 外側の端に 0.5個分の余白
  });

  it('ピザ系は、入口に 流れの向きに2つ × 横に2つ置ける。横に3つ目は置けない', () => {
    const oven = createOven();
    const w = BAKE_DISHES.pizza.w;
    const s2 = frontS('pizza');
    const s1 = s2 - w;
    for (const s of [s1, s2]) for (const x of [-0.25, 0.25]) expect(put(oven, 'upper', 'pizza', x, s)).toBe(true);
    expect(oven.decks.upper).toHaveLength(4);
    expect(canPlaceDish(oven, 'upper', 'pizza', { x: 0, s: s2 })).toBe(false); // 真ん中は、両側に重なる
  });

  it('ドリア系とピザ系が重なる場所には置けない', () => {
    const oven = createOven();
    put(oven, 'upper', 'pizza', -0.25);
    put(oven, 'upper', 'pizza', 0.25);
    expect(canPlaceDish(oven, 'upper', 'doria', { x: -0.36, s: frontS('doria') })).toBe(false);
    expect(canPlaceDish(oven, 'upper', 'doria', { x: 0.36, s: frontS('doria') })).toBe(false);
  });
});

describe('ジェットオーブンのベルト（流れる秒数）', () => {
  it.each(STYLES)('%s：ジェットに入る手前に置くと、上段は ovenUpperTime 秒、下段は ovenLowerTime 秒で出てくる', (style) => {
    for (const [deck, time] of [['upper', cfg.ovenUpperTime], ['lower', cfg.ovenLowerTime]] as const) {
      const oven = createOven();
      expect(put(oven, deck, style)).toBe(true);
      expect(timeToEmerge(deck, style, frontS(style), cfg)).toBeCloseTo(time);
      run(oven, time - 0.5);
      expect(emergedCount(oven, deck)).toBe(0);
      run(oven, 1);
      expect(emergedCount(oven, deck)).toBe(1);
    }
  });

  it.each(STYLES)('%s：ジェットに入る手前より手前に置くと、その分だけ長くかかる（時間はジェットの手前から数える）', (style) => {
    const oven = createOven();
    const s = BAKE_DISHES[style].w / 2; // 入口の端
    expect(put(oven, 'upper', style, 0, s)).toBe(true);
    const expected = cfg.ovenUpperTime + (frontS(style) - s) / beltSpeed('upper', style, cfg);
    expect(timeToEmerge('upper', style, s, cfg)).toBeCloseTo(expected);
    expect(expected).toBeGreaterThan(cfg.ovenUpperTime);
    run(oven, expected - 0.5);
    expect(emergedCount(oven, 'upper')).toBe(0);
    run(oven, 1);
    expect(emergedCount(oven, 'upper')).toBe(1);
  });

  it('テスト用の時間は 上段 30秒・下段 50秒（本番は 40秒・80秒）', () => {
    expect(cfg.ovenUpperTime).toBe(30);
    expect(cfg.ovenLowerTime).toBe(50);
    expect(beltSpeed('upper', 'doria', cfg)).toBeGreaterThan(beltSpeed('lower', 'doria', cfg));
  });

  it.each(STYLES)('%s：出てきた皿は、出口の端（余白のコンベアの先）まで流れて止まる', (style) => {
    const oven = createOven();
    put(oven, 'upper', style);
    run(oven, 200);
    const d = oven.decks.upper[0];
    expect(d.s).toBeCloseTo(endS(style));
    expect(d.s + BAKE_DISHES[style].w / 2).toBeCloseTo(TOTAL);
    expect(d.s).toBeGreaterThan(exitS(style) - 1e-6);
  });

  it('出口では、ドリア系は1レーンに2枚まで並ぶ（余白のコンベアまで流れる）。3枚目は本体の中で待つ（取れない）', () => {
    const oven = createOven();
    for (let i = 0; i < 3; i++) {
      expect(put(oven, 'upper', 'doria', 0)).toBe(true);
      run(oven, 9); // ジェットに入る手前の置き場が空くまで（皿1枚ぶん進む）
    }
    run(oven, 200);
    const s = oven.decks.upper.map((d) => d.s).sort((a, b) => b - a);
    expect(s[0]).toBeCloseTo(endS('doria'));
    expect(s[0] + BAKE_DISH.w / 2).toBeCloseTo(TOTAL); // ベルトの端まで流れる
    expect(emergedCount(oven, 'upper')).toBe(2);
    expect(isEmerged({ style: 'doria', s: s[2] })).toBe(false);
    for (let i = 1; i < s.length; i++) expect(s[i - 1] - s[i]).toBeGreaterThanOrEqual(BAKE_DISH.w - 1e-6); // 重ならない
    // 1枚取ると、待っていた皿が進んで出てくる
    expect(takeDish(oven, 'upper', 1)).not.toBeNull();
    run(oven, 60);
    expect(emergedCount(oven, 'upper')).toBe(2);
  });

  it('出口では、ピザ系は 流れの向きに2枚 × 横に2枚（計4枚）まで並ぶ。残りは本体の中で待つ', () => {
    const oven = createOven();
    for (let round = 0; round < 3; round++) {
      put(oven, 'upper', 'pizza', -0.25);
      put(oven, 'upper', 'pizza', 0.25); // 横に2枚
      run(oven, 12); // ジェットに入る手前の置き場が空くまで
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
    expect(takeDish(oven, 'upper', 1)).toBeNull();
    put(oven, 'upper', 'doria', 0);
    expect(takeDish(oven, 'upper', 1)).toBeNull();
    run(oven, cfg.ovenUpperTime + 1);
    put(oven, 'upper', 'doria', 0);
    run(oven, 5);
    const first = oven.decks.upper.find((d) => isEmerged(d))!;
    expect(takeDish(oven, 'upper', 0)).toBeNull(); // 別のレーンの皿は取れない
    const taken = takeDish(oven, 'upper', 1);
    expect(taken?.id).toBe(first.id);
    expect(taken?.style).toBe('doria');
    expect(oven.decks.upper).toHaveLength(1); // 出ていない皿は残る
  });

  it('ピザ系は、横にかかる2つのレーンのどちらからでも取れる', () => {
    const oven = createOven();
    put(oven, 'upper', 'pizza', 0.25); // 手前側
    run(oven, cfg.ovenUpperTime + 1);
    expect(canTakeDish(oven, 'upper', 0)).toBe(false); // 奥のレーンにはかからない
    expect(canTakeDish(oven, 'upper', 1)).toBe(true);
    expect(canTakeDish(oven, 'upper', 2)).toBe(true);
    expect(takeDish(oven, 'upper', 1)?.style).toBe('pizza');
  });

  it('横の位置から、いちばん近いレーンが決まる', () => {
    expect(laneOfOffset(-0.4)).toBe(0);
    expect(laneOfOffset(0.05)).toBe(1);
    expect(laneOfOffset(0.5)).toBe(2);
  });

  it('残り時間は、いちばん出口に近い皿が出てくるまで（皿の種類によらず、ジェットに入る手前から ovenUpperTime 秒）', () => {
    for (const style of STYLES) {
      const oven = createOven();
      expect(remainingTime(oven, 'upper', cfg)).toBeNull();
      put(oven, 'upper', style);
      expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime);
      run(oven, 10);
      expect(remainingTime(oven, 'upper', cfg)).toBeCloseTo(cfg.ovenUpperTime - 10);
      expect(remainingTime(oven, 'lower', cfg)).toBeNull();
    }
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
  // 入口のベルトの、視点が合っている点（x: 横のずれ、s: 入口の端からの距離）。省略すると、ジェットに入る手前の真ん中
  const inlet = (deck: 'upper' | 'lower', x = 0, s = frontS('doria')): Target => ({ kind: 'ovenInlet', deck, x, s });
  const outlet = (deck: 'upper' | 'lower', lane = 1): Target => ({ kind: 'ovenOutlet', deck, lane });
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
    g.interact(inlet('lower', 0, frontS('pizza')));
    expect(g.state.oven.decks.lower[0].style).toBe('pizza');
    for (let t = 0; t < cfg.ovenLowerTime + 1; t++) g.update(1);
    g.interact(outlet('lower'));
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'pizza', baked: true });
  });

  it('入口のベルトの、視点が合っている場所に皿が置かれる（ジェットに入る手前より手前でも）', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('upper', 0.3, 0.5));
    expect(g.state.oven.decks.upper[0].x).toBeCloseTo(0.36); // 横は近いレーンにそろう
    expect(g.state.oven.decks.upper[0].s).toBeCloseTo(0.5); // 縦は視点が合った位置のまま
    // 手前に置いたぶん、出てくるのが遅い
    for (let t = 0; t < cfg.ovenUpperTime; t++) g.update(1);
    expect(g.planInteract(outlet('upper', 2))).toBeNull();
  });

  it('置く前の見せ方：置かれる位置（ベルトの内側に収めたもの）と、重なるかどうかが分かる', () => {
    const g = newGame();
    expect(g.previewOven(inlet('upper'))).toBeNull(); // 手が空
    g.interact(stock());
    const p = g.previewOven(inlet('upper', 9, 9))!;
    expect(p.valid).toBe(true);
    expect(p.s).toBeCloseTo(frontS('doria')); // ベルトの内側（ジェットに入る手前まで）に収まる
    expect(p.x).toBeCloseTo(0.36); // 横は、いちばん近い（端の）レーン
    expect(g.previewOven(inlet('upper', 0.13, 0.5))?.x).toBeCloseTo(0); // 狙いが少しずれても、真ん中のレーンにそろう
    g.interact(inlet('upper', 0, 0.6));
    g.interact(stock());
    expect(g.previewOven(inlet('upper', 0.05, 0.7))?.valid).toBe(false); // 置いた皿に重なる
    expect(g.planInteract(inlet('upper', 0.05, 0.7))).toBeNull();
    expect(g.previewOven(outlet('upper') as Target)).toBeNull(); // 入口のベルト以外では出さない
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

  it('同じ場所には2枚目を置けない。ほかの場所なら置ける', () => {
    const g = newGame();
    g.interact(stock());
    g.interact(inlet('upper', 0, 0.6));
    g.interact(stock());
    expect(g.planInteract(inlet('upper', 0, 0.6))).toBeNull();
    expect(g.planInteract(inlet('upper', 0.36, 0.6))).not.toBeNull();
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
