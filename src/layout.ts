import type { BottleId, FreeTrayId, SurfaceId } from './types';

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
//      │                   [冷蔵庫2]│
//      │         ● プレイヤー (0, 0)   │
//      └───────────────────────┘
//            手前（+z）
//
// 動かせるのは「冷蔵庫」「2台目の冷蔵庫」「サラダ台」「熱湯」の4つ。位置関係・向きは変えず、基準点だけを動かす。
// 部屋の壁は、これらがはみ出さないよう自動で広がる。

export type Spot = { x: number; z: number };

export type Layout = {
  // 冷蔵庫。基準点は「前面（扉のある面）の中央」。
  //   奥行き 0.8m（+x 方向に伸びる）、幅 2.0m（z 方向）、4段。扉は左右の観音開きで、プレイヤー側（-x）へ開く。
  //   x の範囲 = x 〜 x+0.8、z の範囲 = z-1.0 〜 z+1.0
  fridge: Spot;

  // 2台目の冷蔵庫（最初は空）。大きさ・向き・棚の段数は冷蔵庫と同じで、基準点だけが違う。
  //   冷蔵庫（幅 2.0m）のすぐ手前（+z）側の横に並べる。重ならないよう、z を冷蔵庫より 2.0 以上大きくする
  fridge2: Spot;

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
  fridge: { x: 2.25, z: 3.0 },
  fridge2: { x: 2.25, z: 5.0 },
  saladTable: { x: 2.20, z: 0.3
   },
  hotWater: { x: 1.95, z: -1.8},
};

// ボトルを置ける台（天板）。salad = 右のサラダ台、left = IHの左の台（皿・トッピング・提供台）。
// 大きさは x 方向 × z 方向（m）。見た目・当たり判定・ボトルを置ける範囲が使う
export const SURFACES = {
  salad: { width: 1.5, depth: 3.0 },
  left: { width: 1.4, depth: 3.6 },
  hotWater: { width: 1.6, depth: 1.7 }, // 湯煎器の奥と右に回り込むL字の台の、外側の大きさ
};

// 湯煎器（layout.hotWater）の奥と右の台。湯煎器の中心からの相対位置（x: 右、z: 手前）。天板の高さは 0.9。
// 台の中心 = 外側の矩形の中心（置き場所の x, z はここからの相対）。手前と左は空けてあり、湯煎器の中が見える
export const HOT_WATER_COUNTER = {
  center: { x: 0.35, z: -0.35 },
  // 奥の帯と右の帯（湯煎器の中心からの相対の矩形）
  back: { minX: -0.45, maxX: 1.15, minZ: -1.2, maxZ: -0.5 },
  right: { minX: 0.45, maxX: 1.15, minZ: -0.5, maxZ: 0.5 },
};

// IHの左の台の中心（この台は layout の対象ではなく、位置は固定）
export const LEFT_COUNTER = { x: -2.6, z: -0.2 };

// ボトルの最初の置き場所。台の中心からの相対位置（x: 右、z: 手前）。
// パセリは、もとのトッピングの位置（左の台の奥の列）
export const BOTTLE_HOME: Record<BottleId, { surface: SurfaceId; x: number; z: number }> = {
  dressing: { surface: 'salad', x: -0.45, z: -0.9 },
  paprika: { surface: 'salad', x: -0.45, z: -1.25 },
  parsley: { surface: 'left', x: -0.4, z: 0.95 },
  blackPepper: { surface: 'left', x: -0.4, z: 1.45 }, // もとのトッピングの位置
};

// ガーリック・唐辛子の容器の、台の上の標準の置き場所（チュートリアルの矢印が指す。台の中心からの相対位置）。
// 置く場所は自由に選べる。ここはもとの具材コーナーの位置
export const FREE_TRAY_HOME: Record<FreeTrayId, { surface: SurfaceId; x: number; z: number }> = {
  garlic: { surface: 'salad', x: 0.1, z: -0.15 },
  chili: { surface: 'salad', x: 0.1, z: -0.6 },
};
