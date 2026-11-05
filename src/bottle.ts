import type { BottleId, SurfaceId } from './types';

// ボトル（手に持って、右クリックで皿にかける・振る物）ごとの決まり。

export const BOTTLE_IDS: BottleId[] = ['dressing', 'paprika', 'parsley'];

// 置ける台。ドレッシングとパプリカパウダーはサラダ台だけ、パセリは左の台にもサラダ台にも置ける
export const BOTTLE_SURFACES: Record<BottleId, SurfaceId[]> = {
  dressing: ['salad'],
  paprika: ['salad'],
  parsley: ['salad', 'left'],
};

// かけられる皿。サラダの皿（サラダ台）か、パスタの皿（左の台）か
export const BOTTLE_PLATE: Record<BottleId, 'salad' | 'pasta'> = {
  dressing: 'salad',
  paprika: 'salad',
  parsley: 'pasta',
};

// 右クリックしたときの、画面に出す言い方
export const BOTTLE_VERB: Record<BottleId, string> = {
  dressing: 'かけた',
  paprika: '振った',
  parsley: '振った',
};

export const BOTTLE_ACTION: Record<BottleId, string> = {
  dressing: 'ドレッシングをかける',
  paprika: 'パプリカパウダーを振る',
  parsley: 'パセリを振る',
};
