import type { BakeStyle, BottleId, FreeTrayId, SurfaceId, TableSpot } from './types';

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

// 提供台（左の台の上の緑の台）。ワールド座標の中心と、一辺の長さ
export const SERVE_PASS = { x: -2.4, z: 1.0, size: 0.7 };

// 下駄（ドリアの下にひく木の台）。w = 長い辺、d = 短い辺、h = 厚み。ドリアの皿（BAKE_DISHES.doria）より、ひと回り大きい。
// 下駄の山は、長い辺を z 方向にそろえて積む（stackHeight 枚）。山の置き場は、左の台の、提供台の左（手前の壁側 = +z）のあき地
export const GETA = { w: 0.52, d: 0.36, h: 0.022, stackHeight: 8 };
const GETA_EDGE = 0.03; // 台の縁から、山までの最小のすき間
const GETA_PASS_GAP = 0.05; // 提供台から、山までの最小のすき間
// 山の中心を置ける範囲（左の台の中心からの相対。x: 右、z: 手前）。左の台の上で、提供台より壁側（+z）のあき地に限る。
// 皿・トッピングの置き場は台の奥（-z）側なので、提供台より手前なら、それらに重ならない
export const GETA_RANGE = {
  minX: -SURFACES.left.width / 2 + GETA.d / 2 + GETA_EDGE,
  maxX: SURFACES.left.width / 2 - GETA.d / 2 - GETA_EDGE,
  minZ: SERVE_PASS.z + SERVE_PASS.size / 2 + GETA_PASS_GAP + GETA.w / 2 - LEFT_COUNTER.z,
  maxZ: SURFACES.left.depth / 2 - GETA_EDGE - GETA.w / 2,
};
// 下駄の山の最初の置き場所（提供台のすぐ左）。台の中心からの相対位置
export const GETA_HOME: TableSpot = {
  surface: 'left',
  x: SERVE_PASS.x - LEFT_COUNTER.x,
  z: GETA_RANGE.minZ + 0.1,
};

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

// 部屋の左の壁（中心線）の x。壁の厚みは 0.1 なので、部屋の内側の面はここから 0.05 だけ右
export const ROOM_MIN_X = -3.6;
export const WALL_HALF = 0.05;

// オーブンの入口の先（壁側）の台。ドリア・鉄板焼きの具材を置く具材コーナー（いまは、テスト用の焼き皿だけ）
// 右の端（部屋の中央側）は左の台・オーブンと同じ列の端（OVEN.x + 左の台の幅/2）のまま、左へ伸ばして左の壁の内側の面に接する
const OVEN_COUNTER_D = 1.2;
const OVEN_COUNTER_MAX_X = OVEN.x + SURFACES.left.width / 2; // 右の端（動かさない）
const OVEN_COUNTER_MIN_X = ROOM_MIN_X + WALL_HALF; // 左の端 = 左の壁の内側の面
export const OVEN_COUNTER = {
  width: OVEN_COUNTER_MAX_X - OVEN_COUNTER_MIN_X, // x 方向
  depth: OVEN_COUNTER_D, // z 方向
  x: (OVEN_COUNTER_MAX_X + OVEN_COUNTER_MIN_X) / 2,
  z: OVEN_Z.inlet.maxZ + 0.02 + OVEN_COUNTER_D / 2,
};

// 具材台は全部で3台。OVEN_COUNTER（オーブンの入口の先）を1台目にして、同じ大きさのものを、壁側（+z）へすき間なく横に並べる。
// 3台とも部屋の中央側（+x）が開いた2段の棚で、ドリア系の皿の山が入っている。部屋の手前（+z）の壁は、いちばん奥の台に合わせて広がる
export const OVEN_COUNTER_COUNT = 3;
export const OVEN_COUNTER_ZS: readonly number[] = Array.from({ length: OVEN_COUNTER_COUNT }, (_, i) => OVEN_COUNTER.z + i * OVEN_COUNTER.depth);
// 3台をまとめた広さ（z 方向）と中心
export const OVEN_COUNTER_ROW = {
  depth: OVEN_COUNTER.depth * OVEN_COUNTER_COUNT,
  z: OVEN_COUNTER.z + (OVEN_COUNTER.depth * (OVEN_COUNTER_COUNT - 1)) / 2,
  maxZ: OVEN_COUNTER.z + OVEN_COUNTER.depth * (OVEN_COUNTER_COUNT - 0.5),
};

// 具材台の下の棚。天板（高さ 0.9）の下が、上下2段の棚になっている。広さは具材台と同じ（x: 壁 〜 部屋の中央側、z: 具材台の奥行き）。
// 部屋の中央側（+x）が開いていて、そこから皿を取る。段ごとに、ドリア系の皿の山を並べる
//   shelfTopY … 各段の棚板の上面の高さ（下段・上段）。天板の下面は 0.9 - topThickness
export const OVEN_COUNTER_SHELF = {
  topThickness: 0.05, // 天板の厚み
  boardThickness: 0.03, // 棚板の厚み
  shelfTopY: [0.1, 0.5] as const, // 下段・上段の棚板の上面の高さ
  stacksPerTier: 2, // 1段に並べる山の数（開いている面の端に、z 方向に並べる。奥は視点の線が天板に遮られて狙えないので、手前の端に寄せる）
  stackHeight: 5, // 1つの山の皿の枚数
};
