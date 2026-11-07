import type { BakeStyle, BottleId, FreeTrayId, SurfaceId } from './types';

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
// 動かせるのは「冷蔵庫」「2台目の冷蔵庫」「3台目の冷蔵庫」「サラダ台」「熱湯」の5つ。位置関係・向きは変えず、基準点だけを動かす。
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

  // 3台目の冷蔵庫（最初は空）。大きさ・向き・棚の段数は冷蔵庫と同じ。
  //   2台目の冷蔵庫のさらに手前（+z）側の横に並べる。重ならないよう、z を2台目より 2.0 以上大きくする
  fridge3: Spot;

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
  fridge3: { x: 2.25, z: 7.0 },
  saladTable: { x: 2.20, z: 0.3
   },
  hotWater: { x: 1.95, z: -1.8},
};

// 左の台を手前（+z、ジェットオーブン側）へ広げた長さ。提供台とジェットオーブンのあいだの作業スペース。
// 台の奥の端（z = -2.0）は動かさず、手前だけが伸びる（中心はこの半分だけ手前へずれる）
const LEFT_COUNTER_EXTEND = 1.5;

// ボトルを置ける台（天板）。salad = 右のサラダ台、left = IHの左の台（皿・トッピング・提供台）。
// 大きさは x 方向 × z 方向（m）。見た目・当たり判定・ボトルを置ける範囲が使う
export const SURFACES = {
  salad: { width: 1.5, depth: 3.0 },
  left: { width: 1.4, depth: 3.6 + LEFT_COUNTER_EXTEND },
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

// IHの左の台の中心（この台は layout の対象ではなく、位置は固定）。もとの中心 z = -0.2 から、広げた分の半分だけ手前へ
export const LEFT_COUNTER = { x: -2.6, z: -0.2 + LEFT_COUNTER_EXTEND / 2 };

// ボトルの最初の置き場所。台の中心からの相対位置（x: 右、z: 手前）。
// パセリは、もとのトッピングの位置（左の台の奥の列）
export const BOTTLE_HOME: Record<BottleId, { surface: SurfaceId; x: number; z: number }> = {
  dressing: { surface: 'salad', x: -0.45, z: -0.9 },
  paprika: { surface: 'salad', x: -0.45, z: -1.25 },
  garum: { surface: 'salad', x: -0.45, z: -1.4 },
  // 台の中心が手前へずれたぶん、相対位置を引いて、台の上の見た目の位置は変えない
  parsley: { surface: 'left', x: -0.4, z: 0.95 - LEFT_COUNTER_EXTEND / 2 },
  blackPepper: { surface: 'left', x: -0.4, z: 1.45 - LEFT_COUNTER_EXTEND / 2 }, // もとのトッピングの位置
};

// ガーリック・唐辛子の容器の、台の上の標準の置き場所（チュートリアルの矢印が指す。台の中心からの相対位置）。
// 置く場所は自由に選べる。サラダ台の具材コーナーはトレー置き場が並ぶので、標準の置き場は湯煎器の奥の台にした
export const FREE_TRAY_HOME: Record<FreeTrayId, { surface: SurfaceId; x: number; z: number }> = {
  garlic: { surface: 'hotWater', x: -0.3, z: -0.5 },
  chili: { surface: 'hotWater', x: 0.3, z: -0.5 },
};

// --- ジェットオーブン（ベルトコンベア式。ドリア・鉄板焼きを焼く） ---
// 左の台（LEFT_COUNTER）の提供台の側から見て、左側に置く。IHコンロを前方に見たときは、提供台の後ろ側（+z 方向、手前の壁寄り）。
// 料理は壁側（+z）から提供台側（-z）へ、z 軸に沿って流れる。
//   壁 | [具材台] → [入口] [オーブン本体] [出口] → [左の台（皿・提供台）]      （左から右へ、+z → -z）
// 上段と下段の2段。段ごとに、入口から出口まで出てくる時間が違う（config.ts の ovenUpperTime / ovenLowerTime）。

// 焼き皿の大きさ（w = 流れの向き、d = 流れと直角、h = 高さ。m）。
//   doria（ドリア・鉄板系）：長方形で、長い辺を流れの向きにして横向きに置く。入口・出口には 流れの向きに2つ × 横に3つ並ぶ
//   pizza（ピザ系）：丸い（直径 0.5）。入口・出口には 流れの向きに2つ × 横に2つ並ぶ
export const BAKE_DISHES: Record<BakeStyle, { name: string; w: number; d: number; h: number }> = {
  doria: { name: 'ドリア系', w: 0.42, d: 0.3, h: 0.05 },
  pizza: { name: 'ピザ系', w: 0.5, d: 0.5, h: 0.03 },
};
// ベルトや入口・出口の大きさの基準にする皿（ドリア系）
export const BAKE_DISH = BAKE_DISHES.doria;

export const OVEN_BELT = {
  lanes: 3, // 流れと直角（x 方向）に並べられる数。ベルトは3レーン
  laneW: BAKE_DISH.d + 0.04, // 1レーンの幅（皿の幅に少し余裕）
  laneGap: 0.02, // レーンの間のすき間
  // 入口・出口の長さ（流れの向き z）。皿が流れの向きに2つ並ぶ長さ + 皿 0.5個分（余白は、入口も出口も、外側の端）
  length: (2 + 0.5) * BAKE_DISH.w,
  margin: 0.5 * BAKE_DISH.w, // 外側の端の余白（皿 0.5個分）
  body: 1.1, // オーブン本体の長さ（z）
  bodyDepth: 1.3, // オーブン本体の幅（x）
};

export const OVEN = {
  x: LEFT_COUNTER.x, // ベルトの中心の x（左の台と同じ列）
  // ベルトの上面の高さ。下段は左の台（0.9）の少し下、上段はその上
  beltY: { upper: 1.28, lower: 0.78 },
};

// オーブンの z 方向の並び（手前の壁側から 入口 → 本体 → 出口）。出口の端は、左の台の手前（+z）の端にほぼ接する
const OVEN_FRONT = LEFT_COUNTER.z + SURFACES.left.depth / 2 + 0.02;
export const OVEN_Z = {
  outlet: { minZ: OVEN_FRONT, maxZ: OVEN_FRONT + OVEN_BELT.length },
  body: { minZ: OVEN_FRONT + OVEN_BELT.length, maxZ: OVEN_FRONT + OVEN_BELT.length + OVEN_BELT.body },
  inlet: {
    minZ: OVEN_FRONT + OVEN_BELT.length + OVEN_BELT.body,
    maxZ: OVEN_FRONT + OVEN_BELT.length * 2 + OVEN_BELT.body,
  },
};

// オーブンの入口の先（壁側）の台。ドリア・鉄板焼きの具材を置く具材コーナー（いまは、テスト用の焼き皿だけ）
const OVEN_COUNTER_D = 1.2;
export const OVEN_COUNTER = {
  width: SURFACES.left.width, // x 方向（左の台と同じ幅）
  depth: OVEN_COUNTER_D, // z 方向
  x: OVEN.x,
  z: OVEN_Z.inlet.maxZ + 0.02 + OVEN_COUNTER_D / 2,
};
