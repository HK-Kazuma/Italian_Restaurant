import type { GameConfig } from './config';
import type { IngredientId, Item, Pack } from './types';

// 熱湯で温めてから使うパック。熱湯に浸けた累計秒数が規定を超えると温まる（余温め）。
// 熱湯に浸けるパックの種類を増やすときは warmTime に足す（コーンスープは5秒以上）。

type PackConfig = Pick<GameConfig, 'carbonaraWarmTime'>;

// 温めが必要なパックなら必要秒数、そうでなければ null（普通の具材）
export function warmTime(id: IngredientId, cfg: PackConfig): number | null {
  return id === 'carbonaraSauce' ? cfg.carbonaraWarmTime : null;
}

export function createPack(id: IngredientId): Pack {
  return { id, soak: 0, warm: false };
}

// 冷蔵庫や台の「取り出し元」をクリックしたときに手に持つ物
export function stockItem(id: IngredientId, cfg: PackConfig): Item {
  return warmTime(id, cfg) === null ? { kind: 'ingredient', id } : { kind: 'pack', pack: createPack(id) };
}

// 熱湯に浸かっている間だけ呼ぶ
export function soakPack(pack: Pack, dt: number, cfg: PackConfig): void {
  pack.soak += dt;
  const need = warmTime(pack.id, cfg);
  if (need !== null && pack.soak >= need) pack.warm = true;
}
