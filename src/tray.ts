import { INGREDIENTS } from './ingredients';
import type { FridgeItemId, GameState, IngredientId, TrayId, TrayZone } from './types';

// トレー・ケース：冷蔵庫から取って、サラダ台の置き場に置くと、中身を1回分ずつ取れる。
// 置き場は区画（TrayZone）ごとにあり、その区画に置ける種類だけが置ける：
//   spinach … ほうれん草のトレー専用 / saltOil … 塩オイルソースのケース専用（置き場が3か所）
//   topping … 小エビ・サラダチキン・パンチェッタのトレーと、ソテーソース・トマトソースのケース。どれをどの置き場に置いてもよい（置き場が5か所）
// 置き場の位置は scene.ts。ここは種類と区画の対応、名前、置き場の空きなど、位置に関係ない決まりだけ。

export const TRAY_IDS: TrayId[] = ['spinach', 'saltOil', 'shrimp', 'chicken', 'pancetta', 'sauteSauce', 'tomatoSauce'];

// その区画の置き場の数（scene.ts の置き場の定義と合わせる）
export const TRAY_SPOT_COUNT: Record<TrayZone, number> = { spinach: 1, saltOil: 3, topping: 5 };

export const TRAY_ZONE: Record<TrayId, TrayZone> = {
  spinach: 'spinach',
  saltOil: 'saltOil',
  shrimp: 'topping',
  chicken: 'topping',
  pancetta: 'topping',
  sauteSauce: 'topping',
  tomatoSauce: 'topping',
};

// 置き場から取れる中身
export const TRAY_CONTENT: Record<TrayId, IngredientId> = {
  spinach: 'spinach',
  saltOil: 'saltOilSauce',
  shrimp: 'shrimp',
  chicken: 'chicken',
  pancetta: 'pancetta',
  sauteSauce: 'sauteSauce',
  tomatoSauce: 'tomatoSauce',
};

// 手に持ったときの名前
export const TRAY_NAME: Record<TrayId, string> = {
  spinach: 'ほうれん草のトレー',
  saltOil: '塩オイルソースのケース',
  shrimp: '小エビのトレー',
  chicken: 'サラダチキンのトレー',
  pancetta: 'パンチェッタのトレー',
  sauteSauce: 'ソテーソースのケース',
  tomatoSauce: 'トマトソースのケース',
};

// 置いたあとに置き場に出す名前（中身の名前）
export const trayContentName = (id: TrayId): string => INGREDIENTS[TRAY_CONTENT[id]].name;

// 何も置いていない置き場の名前
export const TRAY_ZONE_NAME: Record<TrayZone, string> = { spinach: 'トレー置き場', saltOil: 'ケース置き場', topping: 'トレー置き場' };

// 冷蔵庫の中の物としての id
export const TRAY_FRIDGE_ITEM: Record<TrayId, FridgeItemId> = {
  spinach: 'spinachTray',
  saltOil: 'saltOilCase',
  shrimp: 'shrimpTray',
  chicken: 'chickenTray',
  pancetta: 'pancettaTray',
  sauteSauce: 'sauteSauceCase',
  tomatoSauce: 'tomatoSauceCase',
};

// 冷蔵庫の中の物が、トレー・ケースならその種類（そうでなければ null）
export function trayOfFridgeItem(item: FridgeItemId): TrayId | null {
  return TRAY_IDS.find((id) => TRAY_FRIDGE_ITEM[id] === item) ?? null;
}

type TrayPlacement = Pick<GameState, 'trays' | 'traySpot'>;

// その区画の spot 番目の置き場に置いてあるトレー・ケース（なければ null）
export function trayAt(s: TrayPlacement, zone: TrayZone, spot: number): TrayId | null {
  return TRAY_IDS.find((id) => TRAY_ZONE[id] === zone && s.trays[id] === 'table' && s.traySpot[id] === spot) ?? null;
}

// その区画の、何も置いていない置き場の番号（若い順）
export function freeTraySpots(s: TrayPlacement, zone: TrayZone): number[] {
  return Array.from({ length: TRAY_SPOT_COUNT[zone] }, (_, spot) => spot).filter((spot) => trayAt(s, zone, spot) === null);
}
