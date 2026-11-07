import type { GameConfig } from './config';
import { BAKE_DISHES, OVEN_BELT } from './layout';
import type { BakeStyle, Oven, OvenDeck, OvenDish } from './types';

// ジェットオーブン（ベルトコンベア式）。上段・下段の2段があり、段ごとにベルトの速さが違う。
//
// ベルトは入口（壁側）から出口（提供台側）へ流れる。
//   入口の端 s=0 ──[入口 1.05m]──[オーブン本体 1.1m]──[出口 1.05m]── 出口の端
// 入口も出口も、ドリア系の皿（長い辺が流れの向き）が 流れの向きに2つ × 横に3レーン並ぶ広さに、皿 0.5個分の余白のコンベアがついている。
// ピザ系の丸い皿（直径 0.5m）は、同じベルトに 流れの向きに2つ × 横に2つ並ぶ（横は3レーンではなく、2つの置き場）。
//
// 皿は入口の最初の置き場に置く（ドリア系は外側の余白のすぐ内側、ピザ系はそれより少し外側）。置いてから出口に出きる（取れる）までの秒数が、
// 段ごとの時間（config.ts の ovenUpperTime / ovenLowerTime）。皿の種類が違っても、この時間は同じになるよう、種類ごとにベルトの速さを合わせている。
// 出口に出てきた皿は、余白のコンベアの上も通って、出口の突き当たり（端）まで流れて止まる。前の皿が残っていれば、その手前で止まって順に並ぶ。
// 出口がいっぱいのときは、後ろの皿は本体の中で待つ（時間は延びる）。皿は取るまでベルトの上にある。

type OvenTimes = Pick<GameConfig, 'ovenUpperTime' | 'ovenLowerTime'>;

export const OVEN_DECKS: readonly OvenDeck[] = ['upper', 'lower'];
export const OVEN_DECK_NAME: Record<OvenDeck, string> = { upper: '上段', lower: '下段' };
export const BAKE_STYLES: readonly BakeStyle[] = ['doria', 'pizza'];

const EPS = 1e-6;
const TOTAL = OVEN_BELT.length * 2 + OVEN_BELT.body; // ベルト全体の長さ

// 皿の大きさ（流れの向き / 流れと直角）
const lenOf = (style: BakeStyle) => BAKE_DISHES[style].w;
const widOf = (style: BakeStyle) => BAKE_DISHES[style].d;

// 置いた直後の皿の中心の位置。入口の長さに、その皿が流れの向きに2つ並ぶ位置のうち、外側のもの
// （ドリア系は、外側に皿 0.5個分の余白が残る位置）
export function entryS(style: BakeStyle): number {
  return OVEN_BELT.length - 1.5 * lenOf(style);
}
// 皿の中心がここに来ると、皿が本体から完全に出る（出てきた = 取れる）
export function exitS(style: BakeStyle): number {
  return OVEN_BELT.length + OVEN_BELT.body + lenOf(style) / 2;
}
// 出口の突き当たり（余白のコンベアの端）に止まった皿の中心の位置。出てきた皿は余白の部分まで流れる
export function endS(style: BakeStyle): number {
  return TOTAL - lenOf(style) / 2;
}

// 置ける横の位置（ベルトの中心からのずれ）。ドリア系は3レーン、ピザ系は2つ（ベルトの幅に2つ並ぶ）
const LANE_PITCH = OVEN_BELT.laneW + OVEN_BELT.laneGap;
export const LANE_OFFSETS = Array.from({ length: OVEN_BELT.lanes }, (_, i) => (i - (OVEN_BELT.lanes - 1) / 2) * LANE_PITCH);
export const SLOT_OFFSETS: Record<BakeStyle, number[]> = {
  doria: LANE_OFFSETS,
  pizza: [-0.5, 0.5].map((k) => k * widOf('pizza')),
};

// 横の位置から、いちばん近いレーンの番号（クリックの対象は、3レーンのどれか）
export function laneOfOffset(x: number): number {
  let best = 0;
  LANE_OFFSETS.forEach((o, i) => {
    if (Math.abs(o - x) < Math.abs(LANE_OFFSETS[best] - x)) best = i;
  });
  return best;
}

// レーンを狙って置くときの、その皿を置ける横の位置（優先する順）。
// ドリア系は、そのレーンの位置。ピザ系は、狙ったレーンに近い置き場（真ん中のレーンなら、どちらでも）
function offsetsForLane(style: BakeStyle, lane: number): number[] {
  const lx = LANE_OFFSETS[lane];
  if (lx === undefined) return [];
  if (style === 'doria') return [lx];
  return SLOT_OFFSETS.pizza.filter((o) => Math.abs(o - lx) <= LANE_PITCH * 0.75);
}

export function createOven(): Oven {
  return { decks: { upper: [], lower: [] }, nextId: 1 };
}

// 皿を置いてから出てくるまでの秒数
export function bakeTime(deck: OvenDeck, cfg: OvenTimes): number {
  return deck === 'upper' ? cfg.ovenUpperTime : cfg.ovenLowerTime;
}

// ベルトの速さ（m/s）。その種類の皿を置いた位置から exitS まで、ちょうど bakeTime 秒で進む速さ
export function beltSpeed(deck: OvenDeck, style: BakeStyle, cfg: OvenTimes): number {
  return (exitS(style) - entryS(style)) / bakeTime(deck, cfg);
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

// 入口の最初の置き場に皿を置ける横の位置（なければ null）
function freeOffset(oven: Oven, deck: OvenDeck, style: BakeStyle, lane: number): number | null {
  for (const x of offsetsForLane(style, lane)) {
    const probe = { style, x, s: entryS(style) };
    if (oven.decks[deck].every((d) => !overlaps(probe, d))) return x;
  }
  return null;
}

// 入口の最初の置き場に皿を置けるか（狙ったレーンの置き場が空いているとき）
export function canPlaceDish(oven: Oven, deck: OvenDeck, style: BakeStyle, lane: number): boolean {
  return freeOffset(oven, deck, style, lane) !== null;
}

// 入口の最初の置き場に皿を置く。置けたら true
export function placeDish(oven: Oven, deck: OvenDeck, style: BakeStyle, lane: number): boolean {
  const x = freeOffset(oven, deck, style, lane);
  if (x === null) return false;
  oven.decks[deck].push({ id: oven.nextId++, style, x, s: entryS(style) });
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
    const left = (exitS(d.style) - d.s) / beltSpeed(deck, d.style, cfg);
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
