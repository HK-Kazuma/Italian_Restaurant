import type { GameConfig } from './config';
import type { IngredientId, Pot, Washer } from './types';

// 鍋の循環：鍋置き場 → IH（具材を入れて加熱）→ 皿にかける → 洗浄機（5秒）→ 鍋置き場
// 洗浄機は1台・1個ずつなので、使用済みの鍋が重なると渋滞する。
// 鍋の状態：具材を入れる前（cold）→ ボタンで加熱（heating）→ 時間が来たら自動で完了（ready）

const NOODLES: ReadonlySet<IngredientId> = new Set(['noodle', 'penne']);

export function isNoodle(id: IngredientId): boolean {
  return NOODLES.has(id);
}

export function createPot(): Pot {
  return { contents: [], heat: 'cold', heatTimer: 0, dirty: false };
}

// --- 具材を入れる・加熱する ---

// 加熱前はソースなどの具材、加熱完了後は麺だけ入れられる。
// 中身が空の使用済みの鍋（皿にかけ終えた鍋）には入れられず、洗浄機へ回す。
export function canAddIngredient(pot: Pot, id: IngredientId, max: number): boolean {
  if (pot.contents.length >= max) return false;
  if (pot.dirty && pot.contents.length === 0) return false;
  return isNoodle(id) ? pot.heat === 'ready' : pot.heat === 'cold';
}

export function addIngredient(pot: Pot, id: IngredientId): void {
  pot.contents.push(id);
  pot.dirty = true; // 具材を入れた時点で使用済み
}

export function canStartHeating(pot: Pot): boolean {
  return pot.heat === 'cold' && pot.contents.length > 0;
}

export function startHeating(pot: Pot, cfg: Pick<GameConfig, 'sauceHeatTime'>): boolean {
  if (!canStartHeating(pot)) return false;
  pot.heat = 'heating';
  pot.heatTimer = cfg.sauceHeatTime;
  return true;
}

// IHに載っている間だけ呼ぶ。時間が来たら自動で完了になる
export function updateHeat(pot: Pot, dt: number): void {
  if (pot.heat !== 'heating') return;
  pot.heatTimer -= dt;
  if (pot.heatTimer <= 0) {
    pot.heatTimer = 0;
    pot.heat = 'ready';
  }
}

// --- 皿にかける ---

export function canPour(pot: Pot, plate: readonly IngredientId[], max: number): boolean {
  return pot.heat === 'ready' && pot.contents.length > 0 && plate.length + pot.contents.length <= max;
}

// 鍋の中身を皿に移す。鍋は空になるが使用済みのまま（洗浄機へ）
export function pourOnto(pot: Pot, plate: IngredientId[]): void {
  plate.push(...pot.contents);
  pot.contents = [];
  pot.heat = 'cold';
  pot.heatTimer = 0;
}

// --- 洗浄機 ---

export function createWasher(): Washer {
  return { pot: null, timer: 0 };
}

export function isWashing(w: Washer): boolean {
  return w.pot !== null && w.pot.dirty;
}

export function canInsert(w: Washer, pot: Pot): boolean {
  return w.pot === null && pot.dirty;
}

export function insertPot(w: Washer, pot: Pot, cfg: Pick<GameConfig, 'potWashTime'>): boolean {
  if (!canInsert(w, pot)) return false;
  w.pot = pot;
  w.timer = cfg.potWashTime;
  return true;
}

// 洗い終わった鍋だけ取り出せる
export function takeWashedPot(w: Washer): Pot | null {
  if (!w.pot || w.pot.dirty) return null;
  const pot = w.pot;
  w.pot = null;
  w.timer = 0;
  return pot;
}

export function updateWasher(w: Washer, dt: number): void {
  if (!isWashing(w)) return;
  w.timer -= dt;
  if (w.timer <= 0) {
    const pot = w.pot!;
    w.timer = 0;
    pot.dirty = false;
    pot.contents = [];
    pot.heat = 'cold';
    pot.heatTimer = 0;
  }
}

// --- 見た目の量 ---

// ソース1つ分（お玉1杯・パック1つ）が、鍋の中をどれだけ満たすか（満杯 = 1）。
// ミートソースはお玉2杯で満杯なので、1杯で半分。見た目（scene.ts）はこの値で液面の高さを決める。
export const SAUCE_FILL_PER_UNIT: Partial<Record<IngredientId, number>> = {
  meatSauce: 0.5,
  tomatoSauce: 0.5,
  carbonaraSauce: 0.5,
  sauteSauce: 0.5,
};

// 鍋に入っているソースの量（0〜1）。入れた順序には依存しない
export function sauceFill(contents: readonly IngredientId[]): number {
  const total = contents.reduce((sum, id) => sum + (SAUCE_FILL_PER_UNIT[id] ?? 0), 0);
  return Math.min(1, total);
}
