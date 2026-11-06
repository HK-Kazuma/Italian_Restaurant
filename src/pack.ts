import type { GameConfig } from './config';
import type { IngredientId, Item, Pack } from './types';

// 熱湯で温めてから使うパック（カルボナーラ・コーンスープ）。熱湯に浸けた累計秒数が規定を超えると温まる（余温め）。
// 熱湯に浸けるパックの種類を増やすときは warmTime に足す。

type PackConfig = Pick<GameConfig, 'carbonaraWarmTime' | 'cornSoupWarmTime' | 'cornSoupStackMax' | 'carbonaraStackMax'>;

// 温めが必要なパックなら必要秒数、そうでなければ null（普通の具材）
export function warmTime(id: IngredientId, cfg: PackConfig): number | null {
  if (id === 'carbonaraSauce') return cfg.carbonaraWarmTime;
  if (id === 'cornSoup') return cfg.cornSoupWarmTime;
  return null;
}

// 一度に手に持てる数。コーンスープは最大5つ、カルボナーラは最大3つ。ほかのパックは1つ
export function stackLimit(id: IngredientId, cfg: PackConfig): number {
  if (id === 'cornSoup') return cfg.cornSoupStackMax;
  if (id === 'carbonaraSauce') return cfg.carbonaraStackMax;
  return 1;
}

export function createPack(id: IngredientId): Pack {
  return { id, soak: 0, warm: false };
}

// 冷蔵庫や台の「取り出し元」をクリックしたときに手に持つ物
export function stockItem(id: IngredientId, cfg: PackConfig): Item {
  if (id === 'saladBase') return { kind: 'plate', contents: ['saladBase'] }; // お皿にサラダが入ったもの
  if (id === 'penne') return { kind: 'rawNoodle', id: 'penne' };
  return warmTime(id, cfg) === null ? { kind: 'ingredient', id } : { kind: 'pack', packs: [createPack(id)] };
}

// いま手に持っているパックの山に、同じ種類のパックをもう1つ重ねられるか
export function canStackPack(hand: Item | null, id: IngredientId, cfg: PackConfig): hand is Extract<Item, { kind: 'pack' }> {
  return (
    hand?.kind === 'pack' &&
    stackLimit(id, cfg) > 1 &&
    hand.packs.every((p) => p.id === id) &&
    hand.packs.length < stackLimit(id, cfg)
  );
}

// 温まったパックのうち、最初の1つの位置（なければ -1）。id を指定すると、その種類だけ探す
export function findWarmPack(packs: readonly Pack[], id?: IngredientId): number {
  return packs.findIndex((p) => p.warm && (id === undefined || p.id === id));
}

// 熱湯に浸かっている間だけ呼ぶ
export function soakPack(pack: Pack, dt: number, cfg: PackConfig): void {
  pack.soak += dt;
  const need = warmTime(pack.id, cfg);
  if (need !== null && pack.soak >= need) pack.warm = true;
}
