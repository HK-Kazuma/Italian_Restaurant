import type { FridgeItemId, FridgeSpot, Target } from './types';

// 冷蔵庫の中の物。右クリックで持ち上げて、棚の好きな場所に置き直せる（置き場所は state.fridgeItems）。
// 座標は冷蔵庫の基準点（前面の中央）からの相対：x は奥行き（0 = 扉側、0.8 = 奥）、z は幅。

export const FRIDGE_ITEM_IDS: FridgeItemId[] = [
  'saladBase',
  'spinachTray',
  'meatSauce',
  'tomatoSauce',
  'carbonaraSauce',
  'penne',
  'cornSoup',
  'saltOilCase',
];

export const FRIDGE_ITEM_NAME: Record<FridgeItemId, string> = {
  saladBase: 'サラダベース',
  spinachTray: 'ほうれん草',
  meatSauce: 'ミートソース缶',
  tomatoSauce: 'トマトソース',
  carbonaraSauce: 'カルボナーラ',
  penne: 'ペンネ',
  cornSoup: 'コーンスープ',
  saltOilCase: '塩オイルソース',
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
  tomatoSauce: { hx: 0.15, hz: 0.17 },
  carbonaraSauce: { hx: 0.08, hz: 0.1 },
  penne: { hx: 0.1, hz: 0.07 },
  cornSoup: { hx: 0.08, hz: 0.1 },
  saltOilCase: { hx: 0.15, hz: 0.15 },
};

// 最初の置き場所
export const FRIDGE_HOME: Record<FridgeItemId, FridgeSpot> = {
  saladBase: { shelf: 3, x: 0.37, z: 0.22 },
  spinachTray: { shelf: 3, x: 0.37, z: -0.22 },
  meatSauce: { shelf: 2, x: 0.37, z: 0.25 },
  tomatoSauce: { shelf: 2, x: 0.37, z: -0.2 },
  carbonaraSauce: { shelf: 1, x: 0.37, z: 0.33 },
  penne: { shelf: 1, x: 0.37, z: 0.1 },
  cornSoup: { shelf: 1, x: 0.37, z: -0.12 },
  saltOilCase: { shelf: 1, x: 0.62, z: -0.3 },
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
    if (o.id === id || o.spot.shelf !== spot.shelf) return true;
    const b = FRIDGE_ITEM_SIZE[o.id];
    const overlapX = Math.abs(o.spot.x - spot.x) < a.hx + b.hx - 1e-9;
    const overlapZ = Math.abs(o.spot.z - spot.z) < a.hz + b.hz - 1e-9;
    return !(overlapX && overlapZ);
  });
}

// 視点が合っている物（冷蔵庫の中の物）が、どの物か。冷蔵庫の中の物でなければ null
export function fridgeItemOf(target: Target | null): FridgeItemId | null {
  if (!target) return null;
  if (target.kind === 'fridgeTray') return target.id === 'spinach' ? 'spinachTray' : 'saltOilCase';
  if (target.kind === 'stock' && target.inFridge) {
    return (FRIDGE_ITEM_IDS as string[]).includes(target.id) ? (target.id as FridgeItemId) : null;
  }
  return null;
}
