import type { BottleId, FridgeBottleId, FridgeItemId, SurfaceId } from './types';

// ボトル（手に持って、右クリックで皿にかける・振る物）ごとの決まり。

export const BOTTLE_IDS: BottleId[] = ['dressing', 'paprika', 'parsley', 'blackPepper'];

// 最初は冷蔵庫にしまってあるボトル（冷蔵庫の中の物としての id）。取り出すと、ほかのボトルと同じように台の上に置ける
export const BOTTLE_FRIDGE_ITEM: Record<FridgeBottleId, FridgeItemId> = {
  dressing: 'dressingBottle',
  paprika: 'paprikaBottle',
};
export const isFridgeBottle = (id: string): id is FridgeBottleId => id in BOTTLE_FRIDGE_ITEM;

// 冷蔵庫の中の物が、ボトルならその種類（そうでなければ null）
export function bottleOfFridgeItem(item: FridgeItemId): FridgeBottleId | null {
  return (Object.keys(BOTTLE_FRIDGE_ITEM) as FridgeBottleId[]).find((id) => BOTTLE_FRIDGE_ITEM[id] === item) ?? null;
}

// 置ける台。ドレッシングとパプリカパウダーはサラダ台だけ、パセリとブラックペッパーはどの台にも置ける
export const BOTTLE_SURFACES: Record<BottleId, SurfaceId[]> = {
  dressing: ['salad'],
  paprika: ['salad'],
  parsley: ['salad', 'left', 'hotWater'],
  blackPepper: ['salad', 'left', 'hotWater'],
};

// かけられる皿。サラダの皿（サラダ台）か、パスタの皿（左の台）か
export const BOTTLE_PLATE: Record<BottleId, 'salad' | 'pasta'> = {
  dressing: 'salad',
  paprika: 'salad',
  parsley: 'pasta',
  blackPepper: 'pasta',
};

// 右クリックしたときの、画面に出す言い方
export const BOTTLE_VERB: Record<BottleId, string> = {
  dressing: 'かけた',
  paprika: '振った',
  parsley: '振った',
  blackPepper: '振った',
};

export const BOTTLE_ACTION: Record<BottleId, string> = {
  dressing: 'ドレッシングをかける',
  paprika: 'パプリカパウダーを振る',
  parsley: 'パセリを振る',
  blackPepper: 'ブラックペッパーを振る',
};
