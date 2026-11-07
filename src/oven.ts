import type { GameConfig } from './config';
import { BAKE_DISH, OVEN_BELT } from './layout';
import type { Oven, OvenDeck } from './types';

// ジェットオーブン（ベルトコンベア式）。上段・下段の2段があり、段ごとにベルトの速さが違う。
//
// ベルトは入口（壁側）から出口（提供台側）へ、まっすぐ一定の速さで流れる。
//   入口の端 s=0 ──[入口 1.05m]──[オーブン本体 1.1m]──[出口 1.05m]── 出口の端
// 皿は入口の端に置く。置いてから出口に出きる（取れる）までの秒数が、段ごとの時間（config.ts の ovenUpperTime / ovenLowerTime）。
// 出口に出てきた皿は、出口の端（突き当たり）まで進んで止まる。前の皿が残っていれば、その手前で止まって順に並ぶ（1レーンに3枚まで）。
// 出口がいっぱいのときは、後ろの皿は本体の中で待つ（時間は延びる）。皿は取るまでベルトの上にある。

type OvenTimes = Pick<GameConfig, 'ovenUpperTime' | 'ovenLowerTime'>;

export const OVEN_DECKS: readonly OvenDeck[] = ['upper', 'lower'];
export const OVEN_DECK_NAME: Record<OvenDeck, string> = { upper: '上段', lower: '下段' };

const HALF = BAKE_DISH.w / 2;
const GAP = 0.03; // 皿どうしのすき間（ベルトの上で詰まったとき）
const SPACING = BAKE_DISH.w + GAP; // 同じレーンの皿の中心どうしの最小の間隔

// 置いた直後の皿の中心の位置（入口の端にぴったり）
export const OVEN_ENTRY_S = HALF;
// 皿の中心がここに来ると、皿が本体から完全に出る（出てきた = 取れる）
export const OVEN_EXIT_S = OVEN_BELT.length + OVEN_BELT.body + HALF;
// 出口の突き当たりに止まった皿の中心の位置
export const OVEN_END_S = OVEN_BELT.length * 2 + OVEN_BELT.body - HALF;

const EPS = 1e-9;

export function createOven(): Oven {
  return { decks: { upper: [], lower: [] }, nextId: 1 };
}

// 皿を置いてから出てくるまでの秒数
export function bakeTime(deck: OvenDeck, cfg: OvenTimes): number {
  return deck === 'upper' ? cfg.ovenUpperTime : cfg.ovenLowerTime;
}

// ベルトの速さ（m/s）。置いた位置から OVEN_EXIT_S まで、ちょうど bakeTime 秒で進む速さ
export function beltSpeed(deck: OvenDeck, cfg: OvenTimes): number {
  return (OVEN_EXIT_S - OVEN_ENTRY_S) / bakeTime(deck, cfg);
}

// 本体から出きって、取れる状態か
export function isEmerged(s: number): boolean {
  return s >= OVEN_EXIT_S - EPS;
}

// 入口の端に皿を置けるか（そのレーンの入口の端が空いているとき）
export function canPlaceDish(oven: Oven, deck: OvenDeck, lane: number): boolean {
  if (!Number.isInteger(lane) || lane < 0 || lane >= OVEN_BELT.lanes) return false;
  return oven.decks[deck].every((d) => d.lane !== lane || d.s - OVEN_ENTRY_S >= SPACING - EPS);
}

// 入口の端に皿を置く。置けたら true
export function placeDish(oven: Oven, deck: OvenDeck, lane: number): boolean {
  if (!canPlaceDish(oven, deck, lane)) return false;
  oven.decks[deck].push({ id: oven.nextId++, lane, s: OVEN_ENTRY_S });
  return true;
}

// そのレーンで、出てきている皿のうち、いちばん先（出口の端に近い）のもの
function frontEmerged(oven: Oven, deck: OvenDeck, lane: number) {
  let front: Oven['decks'][OvenDeck][number] | null = null;
  for (const d of oven.decks[deck]) {
    if (d.lane === lane && isEmerged(d.s) && (!front || d.s > front.s)) front = d;
  }
  return front;
}

// 出口に出てきた皿があるか（取れるか）
export function canTakeDish(oven: Oven, deck: OvenDeck, lane: number): boolean {
  return frontEmerged(oven, deck, lane) !== null;
}

// 出口に出てきた皿を、いちばん先のものから1枚取る。取れたら true
export function takeDish(oven: Oven, deck: OvenDeck, lane: number): boolean {
  const dish = frontEmerged(oven, deck, lane);
  if (!dish) return false;
  oven.decks[deck] = oven.decks[deck].filter((d) => d !== dish);
  return true;
}

// 本体の中（またはこれから入る）の皿が、出てくるまでの残り秒数の最小値（なければ null。表示に使う）
export function remainingTime(oven: Oven, deck: OvenDeck, cfg: OvenTimes): number | null {
  const left = oven.decks[deck].filter((d) => !isEmerged(d.s));
  if (left.length === 0) return null;
  return (OVEN_EXIT_S - Math.max(...left.map((d) => d.s))) / beltSpeed(deck, cfg);
}

// 出口に出てきている皿の数
export function emergedCount(oven: Oven, deck: OvenDeck): number {
  return oven.decks[deck].filter((d) => isEmerged(d.s)).length;
}

export function updateOven(oven: Oven, dt: number, cfg: OvenTimes): void {
  for (const deck of OVEN_DECKS) {
    const step = beltSpeed(deck, cfg) * dt;
    for (let lane = 0; lane < OVEN_BELT.lanes; lane++) {
      // 先頭（出口に近い皿）から順に進める。前の皿に詰まったら、その手前で止まる
      const dishes = oven.decks[deck].filter((d) => d.lane === lane).sort((a, b) => b.s - a.s);
      let limit = OVEN_END_S;
      for (const d of dishes) {
        d.s = Math.min(d.s + step, limit);
        limit = d.s - SPACING;
      }
    }
  }
}
