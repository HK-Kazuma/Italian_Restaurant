import { BOTTLE_FRIDGE_ITEM } from './bottle';
import { TRAY_FRIDGE_ITEM } from './tray';
import type { FridgeItemId, FridgeSpot, FridgeUnit, Target } from './types';

// 冷蔵庫の中の物。右クリックで持ち上げて、棚の好きな場所に置き直せる（置き場所は state.fridgeItems）。
// 座標は、物が入っている冷蔵庫（FridgeSpot.unit。冷蔵庫は2台ある）の基準点（前面の中央）からの相対：x は奥行き（0 = 扉側、0.8 = 奥）、z は幅。

export const FRIDGE_ITEM_IDS: FridgeItemId[] = [
  'saladBase',
  'spinachTray',
  'meatSauce',
  'tomatoSauceCase',
  'carbonaraSauce',
  'penne',
  'cornSoup',
  'saltOilCase',
  'shrimpTray',
  'chickenTray',
  'pancettaTray',
  'squidTray',
  'mushroomTray',
  'whiteSauce',
  'squidInkSauce',
  'sauteSauceCase',
  'garlicBin',
  'chiliBin',
  'dressingBottle',
  'paprikaBottle',
];

export const FRIDGE_ITEM_NAME: Record<FridgeItemId, string> = {
  saladBase: 'サラダベース',
  spinachTray: 'ほうれん草',
  meatSauce: 'ミートソース缶',
  tomatoSauceCase: 'トマトソース',
  carbonaraSauce: 'カルボナーラ',
  penne: 'ペンネ',
  cornSoup: 'コーンスープ',
  saltOilCase: '塩オイルソース',
  shrimpTray: '小エビ',
  chickenTray: 'サラダチキン',
  pancettaTray: 'パンチェッタ',
  squidTray: 'イカ',
  mushroomTray: 'きのこ',
  whiteSauce: 'ホワイトソース缶',
  squidInkSauce: 'イカ墨ソース',
  sauteSauceCase: 'ソテーソース',
  garlicBin: 'ガーリック',
  chiliBin: '唐辛子',
  dressingBottle: 'ドレッシング',
  paprikaBottle: 'パプリカパウダー',
};

// 棚（最下段・下段・中段・上段）の天板の高さ。添字 0 = 最下段（庫内の底）
export const FRIDGE_SHELF_Y = [0.07, 0.5, 0.95, 1.4] as const;

// 棚板の範囲（x: 奥行き、z: 幅）。物はこの内側に収まるように置く
const SHELF_X = { min: 0.02, max: 0.78 };
const SHELF_Z = { min: -0.96, max: 0.96 };

// 物が棚の上で占める大きさ（半分の大きさ。x 方向 hx、z 方向 hz）。重なって置けない判定に使う
export const FRIDGE_ITEM_SIZE: Record<FridgeItemId, { hx: number; hz: number }> = {
  saladBase: { hx: 0.17, hz: 0.17 },
  spinachTray: { hx: 0.15, hz: 0.18 },
  meatSauce: { hx: 0.1, hz: 0.1 },
  tomatoSauceCase: { hx: 0.15, hz: 0.17 },
  carbonaraSauce: { hx: 0.08, hz: 0.1 },
  penne: { hx: 0.1, hz: 0.07 },
  cornSoup: { hx: 0.08, hz: 0.1 },
  saltOilCase: { hx: 0.15, hz: 0.15 },
  shrimpTray: { hx: 0.2, hz: 0.2 },
  chickenTray: { hx: 0.2, hz: 0.2 },
  pancettaTray: { hx: 0.2, hz: 0.2 },
  squidTray: { hx: 0.2, hz: 0.2 },
  mushroomTray: { hx: 0.2, hz: 0.2 },
  whiteSauce: { hx: 0.1, hz: 0.1 },
  squidInkSauce: { hx: 0.08, hz: 0.1 },
  sauteSauceCase: { hx: 0.15, hz: 0.17 },
  garlicBin: { hx: 0.18, hz: 0.18 }, // ステンレスの丸い容器（半径 0.17）
  chiliBin: { hx: 0.18, hz: 0.18 },
  dressingBottle: { hx: 0.07, hz: 0.07 }, // ボトル（台の上と同じ 1.4 倍の大きさ）
  paprikaBottle: { hx: 0.07, hz: 0.07 },
};

// 最初の置き場所
export const FRIDGE_HOME: Record<FridgeItemId, FridgeSpot> = {
  saladBase: { unit: 0, shelf: 3, x: 0.37, z: 0.22 },
  spinachTray: { unit: 0, shelf: 3, x: 0.37, z: -0.22 },
  meatSauce: { unit: 0, shelf: 2, x: 0.37, z: 0.25 },
  tomatoSauceCase: { unit: 0, shelf: 2, x: 0.37, z: -0.2 },
  // 上から3段目（shelf 1）：奥行きをそろえ、物どうし・棚の左右の端との隙間がすべて 0.216 になるよう等間隔に並べる
  carbonaraSauce: { unit: 0, shelf: 1, x: 0.37, z: 0.644 },
  penne: { unit: 0, shelf: 1, x: 0.37, z: 0.258 },
  cornSoup: { unit: 0, shelf: 1, x: 0.37, z: -0.128 },
  saltOilCase: { unit: 0, shelf: 1, x: 0.37, z: -0.594 },
  // 上段・中段の空いている両端に、小エビ・チキン（上段）とパンチェッタ・ソテーソース（中段）
  shrimpTray: { unit: 0, shelf: 3, x: 0.37, z: 0.7 },
  chickenTray: { unit: 0, shelf: 3, x: 0.37, z: -0.7 },
  pancettaTray: { unit: 0, shelf: 2, x: 0.37, z: 0.7 },
  sauteSauceCase: { unit: 0, shelf: 2, x: 0.37, z: -0.7 },
  // 2台目の冷蔵庫（右側の空いていた冷蔵庫）：上段にイカ・きのこのトレー、中段にホワイトソース缶とイカ墨ソース
  squidTray: { unit: 1, shelf: 3, x: 0.37, z: 0.5 },
  mushroomTray: { unit: 1, shelf: 3, x: 0.37, z: -0.5 },
  whiteSauce: { unit: 1, shelf: 2, x: 0.37, z: 0.5 },
  squidInkSauce: { unit: 1, shelf: 2, x: 0.37, z: -0.5 },
  // 最下段：ガーリックと唐辛子の容器（取り出して、台の上の好きな場所に置く）
  garlicBin: { unit: 0, shelf: 0, x: 0.37, z: 0.25 },
  chiliBin: { unit: 0, shelf: 0, x: 0.37, z: -0.25 },
  // 最下段の両はし：ドレッシングとパプリカパウダーのボトル（取り出して、サラダ台の上に置く）
  dressingBottle: { unit: 0, shelf: 0, x: 0.37, z: 0.65 },
  paprikaBottle: { unit: 0, shelf: 0, x: 0.37, z: -0.65 },
};

// 視点が合っている点を、物の大きさぶん棚板の内側に収める
export function clampOnShelf(id: FridgeItemId, x: number, z: number): { x: number; z: number } {
  const { hx, hz } = FRIDGE_ITEM_SIZE[id];
  return {
    x: Math.min(SHELF_X.max - hx, Math.max(SHELF_X.min + hx, x)),
    z: Math.min(SHELF_Z.max - hz, Math.max(SHELF_Z.min + hz, z)),
  };
}

// 同じ棚の上のほかの物と、重ならずに置けるか（接するだけならよい）
export function fitsOnShelf(
  id: FridgeItemId,
  spot: FridgeSpot,
  others: readonly { id: FridgeItemId; spot: FridgeSpot }[],
): boolean {
  const a = FRIDGE_ITEM_SIZE[id];
  return others.every((o) => {
    if (o.id === id || o.spot.unit !== spot.unit || o.spot.shelf !== spot.shelf) return true;
    const b = FRIDGE_ITEM_SIZE[o.id];
    const overlapX = Math.abs(o.spot.x - spot.x) < a.hx + b.hx - 1e-9;
    const overlapZ = Math.abs(o.spot.z - spot.z) < a.hz + b.hz - 1e-9;
    return !(overlapX && overlapZ);
  });
}

// 冷蔵庫に戻す物（トレー・ケース）の置き場所を決める。もとの場所が空いていればそこへ、
// ほかの物が置かれて重なるなら、冷蔵庫の中の空いている場所（できるだけ近く）へ。
// items: 全部の物の置き場所。returning: 外に出ていて、これから冷蔵庫に戻る物（それ以外は冷蔵庫の中にある）
export function returnToFridge(
  items: Record<FridgeItemId, FridgeSpot>,
  returning: readonly FridgeItemId[],
): Record<FridgeItemId, FridgeSpot> {
  const result = Object.fromEntries(FRIDGE_ITEM_IDS.map((id) => [id, { ...items[id] }])) as Record<FridgeItemId, FridgeSpot>;
  const placed = FRIDGE_ITEM_IDS.filter((id) => !returning.includes(id));
  for (const id of returning) {
    const others = placed.map((o) => ({ id: o, spot: result[o] }));
    if (!fitsOnShelf(id, result[id], others)) result[id] = findFreeSpot(id, result[id], others);
    placed.push(id);
  }
  return result;
}

// from の近くで、ほかの物に重ならない場所を探す（同じ冷蔵庫の同じ棚を先に、なければ同じ冷蔵庫の近い棚、それでもなければもう1台の冷蔵庫）。
// どこにも空きがなければ from のまま
function findFreeSpot(
  id: FridgeItemId,
  from: FridgeSpot,
  others: readonly { id: FridgeItemId; spot: FridgeSpot }[],
): FridgeSpot {
  const STEP = 0.04;
  const shelves = FRIDGE_SHELF_Y.map((_, i) => i as FridgeSpot['shelf']).sort(
    (a, b) => Math.abs(a - from.shelf) - Math.abs(b - from.shelf),
  );
  const units: FridgeUnit[] = from.unit === 0 ? [0, 1] : [1, 0];
  for (const unit of units) {
    for (const shelf of shelves) {
      let best: FridgeSpot | null = null;
      let bestDist = Infinity;
      for (let x = SHELF_X.min; x <= SHELF_X.max; x += STEP) {
        for (let z = SHELF_Z.min; z <= SHELF_Z.max; z += STEP) {
          const c = clampOnShelf(id, x, z);
          const spot: FridgeSpot = { unit, shelf, x: c.x, z: c.z };
          const dist = Math.hypot(spot.x - from.x, spot.z - from.z);
          if (dist < bestDist && fitsOnShelf(id, spot, others)) {
            best = spot;
            bestDist = dist;
          }
        }
      }
      if (best) return best;
    }
  }
  return { ...from };
}

// 視点が合っている物（冷蔵庫の中の物）が、どの物か。冷蔵庫の中の物でなければ null
export function fridgeItemOf(target: Target | null): FridgeItemId | null {
  if (!target) return null;
  if (target.kind === 'fridgeTray') return TRAY_FRIDGE_ITEM[target.id];
  if (target.kind === 'fridgeBottle') return BOTTLE_FRIDGE_ITEM[target.id];
  if (target.kind === 'stock' && target.inFridge) {
    return (FRIDGE_ITEM_IDS as string[]).includes(target.id) ? (target.id as FridgeItemId) : null;
  }
  return null;
}
