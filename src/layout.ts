import type { BottleId, SurfaceId } from './types';

// 設備の置き場所。ここの数値を直すと、その設備が動く（保存すると開発サーバーが自動で読み込み直す）。
//
// 座標は上から見たときの位置（単位 m）。プレイヤーが最初に立つ場所が (x=0, z=0)。
//   +x … 右        -x … 左
//   -z … 前（奥）  +z … 手前（プレイヤー側）
//
//            奥（-z）
//      ┌───────────────────────┐
//      │       [ 茹で麺器 ]        │
//      │ [左の台]  [ IH ] [熱湯] [サラダ台] │
//      │                    [冷蔵庫]│
//      │         ● プレイヤー (0, 0)   │
//      └───────────────────────┘
//            手前（+z）
//
// 動かせるのは「冷蔵庫」「サラダ台」「熱湯」の3つ。位置関係・向きは変えず、基準点だけを動かす。
// 部屋の壁は、これらがはみ出さないよう自動で広がる。

export type Spot = { x: number; z: number };

export type Layout = {
  // 冷蔵庫。基準点は「前面（扉のある面）の中央」。
  //   奥行き 0.8m（+x 方向に伸びる）、幅 1.0m（z 方向）。扉はプレイヤー側（-x）へ開く。
  //   x の範囲 = x 〜 x+0.8、z の範囲 = z-0.5 〜 z+0.5
  fridge: Spot;

  // サラダ台。基準点は「天板の中心」。
  //   x 方向 1.5m × z 方向 3.0m。左の列（x-0.45）がサラダを作る台・トレー置き場・ボトル、中・右の列（x+0.1 / x+0.55）が具材コーナー。
  //   x の範囲 = x-0.75 〜 x+0.75、z の範囲 = z-1.5 〜 z+1.5
  saladTable: Spot;

  // 熱湯。基準点は「中心」。
  //   x 方向 0.9m × z 方向 1.0m。
  //   x の範囲 = x-0.45 〜 x+0.45、z の範囲 = z-0.5 〜 z+0.5
  hotWater: Spot;
};

export const LAYOUT: Layout = {
  fridge: { x: 2.25, z: 2.5 },
  saladTable: { x: 2.00, z: 0.3
   },
  hotWater: { x: 1.95, z: -1.8},
};

// ボトルを置ける台（天板）。salad = 右のサラダ台、left = IHの左の台（皿・トッピング・提供台）。
// 大きさは x 方向 × z 方向（m）。見た目・当たり判定・ボトルを置ける範囲が使う
export const SURFACES = {
  salad: { width: 1.5, depth: 3.0 },
  left: { width: 1.4, depth: 3.6 },
};

// IHの左の台の中心（この台は layout の対象ではなく、位置は固定）
export const LEFT_COUNTER = { x: -2.6, z: -0.2 };

// ボトルの最初の置き場所。台の中心からの相対位置（x: 右、z: 手前）。
// パセリは、もとのトッピングの位置（左の台の奥の列）
export const BOTTLE_HOME: Record<BottleId, { surface: SurfaceId; x: number; z: number }> = {
  dressing: { surface: 'salad', x: -0.45, z: -0.9 },
  paprika: { surface: 'salad', x: -0.45, z: -1.25 },
  parsley: { surface: 'left', x: -0.4, z: 0.95 },
};
