import type { GameConfig } from './config';
import { BAKE_DISHES, OVEN_BELT } from './layout';
import type { BakeStyle, Oven, OvenDeck, OvenDish } from './types';

// ジェットオーブン（ベルトコンベア式）。上段・下段の2段があり、段ごとにベルトの速さが違う。
//
// ベルトは入口（壁側）から出口（提供台側）へ流れる。
//   入口の端 s=0 ──[入口 1.05m]──[オーブン本体 1.1m]──[出口 1.05m]── 出口の端
// 入口も出口も、ドリア系の皿（長い辺が流れの向き）が 流れの向きに2つ × 横に3つ並ぶ広さに、皿 0.5個分の余白のコンベアがついている。
// ピザ系の丸い皿（直径 0.5m）は、同じ広さに 流れの向きに2つ × 横に2つ並ぶ。
//
// 皿は、入口のベルトの上の、流れの向き（縦）は好きな場所に置ける（ジェットに入る手前まで）。横は決まった置き場にそろう
// （ドリア系は3レーン、ピザ系は2つの置き場。狙った位置にいちばん近い置き場に置く）。ほかの皿に重なる場所には置けない。
// 流れる秒数（config.ts の ovenUpperTime / ovenLowerTime）は、「ジェットに入る手前（皿の先がジェットの入口に着く位置）に置いてから、
// 出口に出きる（取れる）まで」。それより手前に置くと、ジェットに着くまでの分だけ長くかかる。
// 皿の種類が違っても、この秒数は同じになるよう、種類ごとにベルトの速さを合わせている。
// 出口に出てきた皿は、余白のコンベアの上も通って、出口の突き当たり（端）まで流れて止まる。前の皿が残っていれば、その手前で止まって順に並ぶ。
// 出口がいっぱいのときは、後ろの皿は本体の中で待つ（時間は延びる）。皿は取るまでベルトの上にある。

type OvenTimes = Pick<GameConfig, 'ovenUpperTime' | 'ovenLowerTime'>;

export const OVEN_DECKS: readonly OvenDeck[] = ['upper', 'lower'];
export const OVEN_DECK_NAME: Record<OvenDeck, string> = { upper: '上段', lower: '下段' };
export const BAKE_STYLES: readonly BakeStyle[] = ['doria', 'pizza'];

const EPS = 1e-6;
const TOTAL = OVEN_BELT.length * 2 + OVEN_BELT.body; // ベルト全体の長さ
const LANE_PITCH = OVEN_BELT.laneW + OVEN_BELT.laneGap;

// 皿の大きさ（流れの向き / 流れと直角）
const lenOf = (style: BakeStyle) => BAKE_DISHES[style].w;
const widOf = (style: BakeStyle) => BAKE_DISHES[style].d;

// ジェットに入る手前に置いた皿の中心の位置（皿の先がジェットの入口にちょうど着く）。流れる秒数は、ここから数える
export function frontS(style: BakeStyle): number {
  return OVEN_BELT.length - lenOf(style) / 2;
}
// 皿の中心がここに来ると、皿が本体から完全に出る（出てきた = 取れる）
export function exitS(style: BakeStyle): number {
  return OVEN_BELT.length + OVEN_BELT.body + lenOf(style) / 2;
}
// 出口の突き当たり（余白のコンベアの端）に止まった皿の中心の位置。出てきた皿は余白の部分まで流れる
export function endS(style: BakeStyle): number {
  return TOTAL - lenOf(style) / 2;
}

// ベルトの上の皿の位置。x = ベルトの中心からの横のずれ（m）、s = 入口の端からの距離（m。皿の中心）
export type DishPos = { x: number; s: number };

// 横の置き場（ベルトの中心からのずれ）。ドリア系は3レーン、ピザ系は2つ（ベルトの幅に2つ並ぶ）。
// 3レーンは、出口で、どのレーンから取るかの区切りにも使う
export const LANE_OFFSETS = Array.from({ length: OVEN_BELT.lanes }, (_, i) => (i - (OVEN_BELT.lanes - 1) / 2) * LANE_PITCH);
export const SLOT_OFFSETS: Record<BakeStyle, number[]> = {
  doria: LANE_OFFSETS,
  pizza: [-0.5, 0.5].map((k) => k * widOf('pizza')),
};

// 横の位置から、いちばん近いレーンの番号（出口で取るときの対象は、3レーンのどれか）
export function laneOfOffset(x: number): number {
  let best = 0;
  LANE_OFFSETS.forEach((o, i) => {
    if (Math.abs(o - x) < Math.abs(LANE_OFFSETS[best] - x)) best = i;
  });
  return best;
}

// 流れの向きの位置 s を、入口のベルトの内側（入口の端から、ジェットに入る手前まで）に収める
function clampS(style: BakeStyle, s: number): number {
  return Math.min(frontS(style), Math.max(lenOf(style) / 2, s));
}

// 置こうとした位置を、入口のベルトの内側に収める。縦（s）は好きな位置のまま、横（x）はいちばん近い置き場にそろえる
export function clampPlacement(style: BakeStyle, x: number, s: number): DishPos {
  const slots = SLOT_OFFSETS[style];
  const nearest = slots.reduce((best, o) => (Math.abs(o - x) < Math.abs(best - x) ? o : best), slots[0]);
  return { x: nearest, s: clampS(style, s) };
}

export function createOven(): Oven {
  return { decks: { upper: [], lower: [] }, nextId: 1 };
}

// 皿をジェットに入る手前に置いてから出てくるまでの秒数
export function bakeTime(deck: OvenDeck, cfg: OvenTimes): number {
  return deck === 'upper' ? cfg.ovenUpperTime : cfg.ovenLowerTime;
}

// ベルトの速さ（m/s）。その種類の皿が、ジェットに入る手前（frontS）から exitS まで、ちょうど bakeTime 秒で進む速さ
export function beltSpeed(deck: OvenDeck, style: BakeStyle, cfg: OvenTimes): number {
  return (exitS(style) - frontS(style)) / bakeTime(deck, cfg);
}

// 入口のベルトの s の位置に置いた皿が、出てくるまでの秒数（ほかの皿に止められない場合）
export function timeToEmerge(deck: OvenDeck, style: BakeStyle, s: number, cfg: OvenTimes): number {
  return Math.max(0, exitS(style) - s) / beltSpeed(deck, style, cfg);
}

// 本体から出きって、取れる状態か
export function isEmerged(d: Pick<OvenDish, 'style' | 's'>): boolean {
  return d.s >= exitS(d.style) - EPS;
}

// 2枚の皿（外接する長方形）が重なるか。接するだけなら重ならない
function overlaps(a: { style: BakeStyle; x: number; s: number }, b: { style: BakeStyle; x: number; s: number }): boolean {
  return (
    Math.abs(a.x - b.x) < (widOf(a.style) + widOf(b.style)) / 2 - EPS &&
    Math.abs(a.s - b.s) < (lenOf(a.style) + lenOf(b.style)) / 2 - EPS
  );
}

// 入口のベルトの、狙った位置（pos）に皿を置くとしたら、実際に置かれる位置と、置けるか（ほかの皿に重ならないか）。
// 縦（s）はベルトの内側で好きな位置。横（x）は、狙った位置に近い置き場（ちょうど間にあれば両方）のうち、空いているもの。
// 近い置き場がすべて埋まっていれば、いちばん近い置き場を返す（valid = false）
export function resolvePlacement(oven: Oven, deck: OvenDeck, style: BakeStyle, pos: DishPos): DishPos & { valid: boolean } {
  const s = clampS(style, pos.s);
  const near = [...SLOT_OFFSETS[style]].sort((a, b) => Math.abs(a - pos.x) - Math.abs(b - pos.x));
  const closeEnough = near.filter((o) => Math.abs(o - pos.x) <= Math.abs(near[0] - pos.x) + LANE_PITCH * 0.25);
  for (const x of closeEnough) {
    const probe = { style, x, s };
    if (oven.decks[deck].every((d) => !overlaps(probe, d))) return { x, s, valid: true };
  }
  return { x: near[0], s, valid: false };
}

// 狙った位置に皿を置けるか
export function canPlaceDish(oven: Oven, deck: OvenDeck, style: BakeStyle, pos: DishPos): boolean {
  return resolvePlacement(oven, deck, style, pos).valid;
}

// 入口のベルトに皿を置く。置けたら true
export function placeDish(oven: Oven, deck: OvenDeck, style: BakeStyle, pos: DishPos): boolean {
  const p = resolvePlacement(oven, deck, style, pos);
  if (!p.valid) return false;
  oven.decks[deck].push({ id: oven.nextId++, style, x: p.x, s: p.s });
  return true;
}

// そのレーンにかかっている、出てきている皿のうち、いちばん先（出口の端に近い）のもの
function frontEmerged(oven: Oven, deck: OvenDeck, lane: number): OvenDish | null {
  const lx = LANE_OFFSETS[lane];
  if (lx === undefined) return null;
  let front: OvenDish | null = null;
  for (const d of oven.decks[deck]) {
    const onLane = Math.abs(d.x - lx) < (widOf(d.style) + OVEN_BELT.laneW) / 2 - EPS;
    if (onLane && isEmerged(d) && (!front || d.s > front.s)) front = d;
  }
  return front;
}

// 出口の、そのレーンでいちばん先に取れる皿（取らずに見るだけ。なければ null）
export function peekDish(oven: Oven, deck: OvenDeck, lane: number): OvenDish | null {
  return frontEmerged(oven, deck, lane);
}

// 出口に出てきた皿があるか（取れるか）
export function canTakeDish(oven: Oven, deck: OvenDeck, lane: number): boolean {
  return frontEmerged(oven, deck, lane) !== null;
}

// 出口に出てきた皿を、いちばん先のものから1枚取る。取れた皿を返す（取れなければ null）
export function takeDish(oven: Oven, deck: OvenDeck, lane: number): OvenDish | null {
  const dish = frontEmerged(oven, deck, lane);
  if (!dish) return null;
  oven.decks[deck] = oven.decks[deck].filter((d) => d !== dish);
  return dish;
}

// 本体の中（またはこれから入る）の皿が、出てくるまでの残り秒数の最小値（なければ null。表示に使う）
export function remainingTime(oven: Oven, deck: OvenDeck, cfg: OvenTimes): number | null {
  let min: number | null = null;
  for (const d of oven.decks[deck]) {
    if (isEmerged(d)) continue;
    const left = timeToEmerge(deck, d.style, d.s, cfg);
    if (min === null || left < min) min = left;
  }
  return min;
}

// 出口に出てきている皿の数
export function emergedCount(oven: Oven, deck: OvenDeck): number {
  return oven.decks[deck].filter(isEmerged).length;
}

export function updateOven(oven: Oven, dt: number, cfg: OvenTimes): void {
  for (const deck of OVEN_DECKS) {
    // 先頭（出口に近い皿）から順に進める。前にいる皿（横にかかっているもの）にぶつかったら、その手前で止まる
    const dishes = [...oven.decks[deck]].sort((a, b) => b.s - a.s);
    const settled: OvenDish[] = [];
    for (const d of dishes) {
      let next = Math.min(d.s + beltSpeed(deck, d.style, cfg) * dt, endS(d.style));
      for (const e of settled) {
        if (Math.abs(d.x - e.x) < (widOf(d.style) + widOf(e.style)) / 2 - EPS) {
          next = Math.min(next, e.s - (lenOf(d.style) + lenOf(e.style)) / 2);
        }
      }
      d.s = Math.max(d.s, next); // 後ろへは戻らない
      settled.push(d);
    }
  }
}
