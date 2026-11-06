import type { Difficulty } from './difficulty';

export type IngredientId =
  | 'noodle' // 茹で上がった麺
  | 'penne'
  | 'tarakoSauce'
  | 'nori'
  | 'meatSauce'
  | 'cheese'
  | 'parsley'
  | 'tomatoSauce'
  | 'pancetta'
  | 'carbonaraSauce'
  | 'blackPepper'
  | 'garlic'
  | 'chili'
  | 'spinach'
  | 'sauteSauce'
  | 'saltOilSauce' // 塩オイルソース（ペペロンチーノ）
  | 'saladBase'
  | 'shrimp'
  | 'chicken'
  | 'dressing'
  | 'paprika'
  | 'cornSoup';

// 手に持って、皿にかける・振るボトル。決まった台の上に自由に置ける（置ける台は bottle.ts）
export type BottleId = Extract<IngredientId, 'dressing' | 'paprika' | 'parsley' | 'blackPepper'>;

// ボトルを置ける台。salad = 右のサラダ台、left = IHの左の台
export type SurfaceId = 'salad' | 'left';

// ボトルの置き場所。台の中心からの相対位置（x: 右、z: 手前）。null = 手に持っている
export type BottleSpot = { surface: SurfaceId; x: number; z: number } | null;

// 手に持ったボトルを、いま視点が合っている場所に置こうとしたときの様子（置く前の見せ方に使う）。
// valid = false のとき、reason は置けない理由（gap: ほかのボトルに近すぎる、surface: この台には置けない）
export type BottlePreview = {
  id: BottleId;
  surface: SurfaceId;
  x: number;
  z: number;
  valid: boolean;
  reason?: 'gap' | 'surface';
};

// 茹で麺器に入れる麺の種類（茹で上がると、同じ id の具材になる）
export type NoodleKind = Extract<IngredientId, 'noodle' | 'penne'>;

// 皿の種類。plate = パスタ・サラダの皿、small = ほうれん草のソテーの小皿、bowl = コーンスープのスープ皿。
// 見た目の違いと、スープ皿にだけパックを入れられる、という違いだけ。提供の判定は中身だけで決まる
export type PlateStyle = 'plate' | 'small' | 'bowl';

// 冷蔵庫から取ってサラダ台に置くトレー・ケース。spinach = ほうれん草のトレー、saltOil = 塩オイルソースのパックが入ったケース、
// shrimp / chicken / pancetta = 小エビ・サラダチキン・パンチェッタのトレー、sauteSauce = ソテーソースのパックが入ったケース。
// どれを置けるかは置き場の区画（TrayZone）で決まる（種類と区画の対応は tray.ts）
export type TrayId = 'spinach' | 'saltOil' | 'shrimp' | 'chicken' | 'pancetta' | 'sauteSauce';

// トレー置き場の区画。spinach・saltOil はその専用の置き場、topping = 小エビ・チキン・パンチェッタ・ソテーソースのどれでも置ける置き場
export type TrayZone = 'spinach' | 'saltOil' | 'topping';

// 冷蔵庫の中の物（右クリックで持ち上げて、棚の好きな場所に置き直せる）。名前・大きさ・最初の置き場所は fridge.ts
export type FridgeItemId =
  | 'saladBase'
  | 'spinachTray'
  | 'meatSauce'
  | 'tomatoSauce'
  | 'carbonaraSauce'
  | 'penne'
  | 'cornSoup'
  | 'saltOilCase'
  | 'shrimpTray'
  | 'chickenTray'
  | 'pancettaTray'
  | 'sauteSauceCase';

// 冷蔵庫の棚の番号。0 = 最下段、1 = 下段、2 = 中段、3 = 上段
export type FridgeShelf = 0 | 1 | 2 | 3;

// 冷蔵庫の中の置き場所。x, z は冷蔵庫の基準点（前面の中央）からの相対（x: 奥行き、z: 幅）
export type FridgeSpot = { shelf: FridgeShelf; x: number; z: number };

// 持ち上げた物を、いま視点が合っている棚に置くとしたときの様子（置く前の見せ方に使う）
export type FridgePreview = { item: FridgeItemId; shelf: FridgeShelf; x: number; z: number; valid: boolean };

export type BoilerState = 'empty' | 'set' | 'boiling' | 'lifted' | 'overdue' | 'shortBoil';

export type Boiler = {
  state: BoilerState;
  timer: number; // boiling/shortBoil: 残り茹で時間、lifted: 残り猶予
  noodle: NoodleKind; // かごに入れた麺の種類
};

// 熱湯に浸けて温めるパック（カルボナーラ・コーンスープ）。soak は浸けた累計秒数、一定時間を超えたら warm
export type Pack = {
  id: IngredientId;
  soak: number;
  warm: boolean;
};

export type PotHeat = 'cold' | 'heating' | 'ready'; // 未加熱 / 加熱中 / 加熱完了（焦げは未実装）

export type Pot = {
  contents: IngredientId[];
  heat: PotHeat;
  heatTimer: number; // heating: 残り加熱時間（秒）
  dirty: boolean; // 使用済み（具材を入れた）。洗浄機で洗うまで鍋置き場に戻せない
  mixCount: number; // 麺を入れたあと、混ぜたクリック数
  mixNeed: number; // 混ぜ終わるのに必要なクリック数（3回）
};

// 右クリックで投げた鍋。床や台に落ちて止まるまで動く。止まったら、左クリックで手に拾える。
// x, y, z は鍋の底の中心（y = 0 が床）。yaw は回転（rad）
export type ThrownPot = {
  id: number;
  pot: Pot;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  spin: number; // yaw の回転の速さ（rad/s）
  resting: boolean; // 止まっている
};

// 鍋洗浄機は1台・1個ずつ。dirty な鍋が入っている間が洗浄中、洗い終わると dirty が false になる
export type Washer = {
  pot: Pot | null;
  timer: number; // 洗浄の残り時間（秒）
};

export type Station = 'pasta' | 'salad';

export type Ticket = {
  id: number; // レール上の識別用
  menuId: string;
  arrivedAt: number; // ゲーム内時刻（秒）
  station: Station;
};

// 手に持てるのは1つだけ。中身リストを持つ器は皿（鍋・サラダ器は今後追加）
export type Item =
  | { kind: 'rawNoodle'; id: NoodleKind } // 生麺（スパゲッティ）か、ペンネ
  | { kind: 'ingredient'; id: IngredientId }
  | { kind: 'plate'; contents: IngredientId[]; style?: PlateStyle } // style 省略 = plate
  | { kind: 'pack'; packs: Pack[] } // 熱湯で温めてから使うパック。同じ種類を重ねて持てる（コーンスープは最大5つ）
  | { kind: 'tray'; id: TrayId } // 冷蔵庫から取ったトレー・ケース（ほうれん草・塩オイルソース・小エビ・チキン・パンチェッタ・ソテーソース）
  | { kind: 'bottle'; id: BottleId } // ドレッシング・パプリカパウダー・パセリ。右クリックで皿にかける・振る（なくならない）
  | { kind: 'pot'; pot: Pot }
  | { kind: 'ipad' }; // 練習キッチンの壁にかかっている iPad。右クリックで画面を開く（ゲーム開始・レシピ）

// 視点の先にあるクリック可能な設備
export type Target =
  | { kind: 'noodleRack' }
  | { kind: 'plateStack'; style?: PlateStyle } // 皿の山。style 省略 = plate（小皿・スープ皿の山もある）
  | { kind: 'stock'; id: IngredientId; inFridge?: boolean } // クリックで手に取れる取り出し元（缶・パック・トッピングなど）。inFridge は冷蔵庫の中（扉が開いている間だけ取れる）
  | { kind: 'fridgeDoor' } // 冷蔵庫（扉・本体）。右クリックで開閉
  | { kind: 'fridgeShelf'; shelf: FridgeShelf; x: number; z: number } // 冷蔵庫の棚板。x, z は視点が合っている点（基準点からの相対）。物を置き直す場所を選ぶ
  | { kind: 'fridgeTray'; id: TrayId } // 冷蔵庫の中のトレー・ケース（扉が開いている間だけ取れる）
  | { kind: 'traySlot'; id: TrayZone; spot?: number } // サラダ台の上のトレー・ケース置き場。置いたものから、中身を1回分ずつ取れる。同じ区画の置き場が複数ある（id = 区画、spot = その番号、省略 = 0）
  | { kind: 'boilerBasket'; index: number }
  | { kind: 'boilerButton'; index: number }
  | { kind: 'plateSlot'; index: number }
  | { kind: 'servePass' }
  | { kind: 'potSlot'; index: number } // 鍋置き場の1か所
  | { kind: 'thrownPot'; id: number } // 投げて床・台に落ちている鍋（左クリックで拾う）
  | { kind: 'ihBurner'; index: number }
  | { kind: 'hotWaterSlot'; index: number } // 熱湯に浸けるパックの置き場所
  | { kind: 'bottle'; id: BottleId } // 台の上のボトル
  | { kind: 'tableTop'; surface: SurfaceId; x: number; z: number } // 台の天板。x, z は視点が合っている点（台の中心からの相対）
  | { kind: 'washer' }
  | { kind: 'ipadWall' }; // 後ろの壁にかかっている iPad（練習中だけ。左クリックで手に取る・壁に戻す）

// ready = ゲーム開始前の操作説明（クリックで始まる。時間は進まない）
export type Phase = 'title' | 'ready' | 'playing' | 'paused' | 'result';

export type Toast = {
  text: string;
  kind: 'good' | 'bad' | 'info';
  expiresAt: number; // ゲーム内時刻
};

// practice = 練習キッチン（時間制限なし。操作を覚える・気軽に料理する）、game = 本番（5分間のタイムアタック）
export type Mode = 'practice' | 'game';

// チュートリアルの進み具合。step = いま取り組んでいる工程の番号（total になったら完了）。工程の中身は tutorial.ts
export type TutorialProgress = { menuId: string; step: number; total: number };

export type GameState = {
  phase: Phase;
  mode: Mode;
  difficulty: Difficulty | null; // ゲームの難易度（iPad で選ぶ）。練習キッチンは null
  ipadOpen: boolean; // iPad の画面を開いている間（マウスのカーソルが出て、視点は動かせない）
  tutorial: TutorialProgress | null; // チュートリアル中（練習キッチンで、選んだメニューを作り方の案内つきで作る）。なければ null
  time: number; // 経過時間（秒）
  hand: Item | null;
  boilers: Boiler[];
  plateSlots: (IngredientId[] | null)[]; // 皿の置き場。左の台（plateSlotCount 個）→ サラダ台（saladSlotCount 個）の順。null = 皿なし
  plateStyles: PlateStyle[]; // plateSlots と同じ並び。置いてある皿の種類
  trays: Record<TrayId, 'fridge' | 'hand' | 'table'>; // トレー・ケースの場所（冷蔵庫 / 手 / サラダ台）
  traySpot: Record<TrayId, number>; // サラダ台に置いてあるとき、その区画の何番目の置き場か（同じ区画の置き場が複数ある）
  fridgeOpen: boolean; // 冷蔵庫の扉（最初は閉まっている）
  fridgeItems: Record<FridgeItemId, FridgeSpot>; // 冷蔵庫の中の物の置き場所（トレー・ケースは、取ったあとは使わない）
  moving: FridgeItemId | null; // 右クリックで持ち上げている最中の物（手とは別。棚に右クリックで置く）
  bottles: Record<BottleId, BottleSpot>; // 台の上のボトル
  bottleShakeAt: number | null; // 手に持ったボトルを最後に振った（かけた）ゲーム内時刻。振る動きの表示に使う
  hotWater: (Pack | null)[]; // 熱湯に浸けているパック（3×3の9か所、左上から横に数える）。null = 空き
  potSlots: (Pot | null)[]; // 鍋置き場。null = 空き
  ihBurners: (Pot | null)[];
  thrownPots: ThrownPot[]; // 投げた鍋（飛んでいる最中、または床・台に落ちている）
  washer: Washer;
  tickets: Ticket[];
  nextTicketAt: number;
  nextTicketId: number;
  score: number;
  combo: number;
  maxCombo: number;
  served: number;
  mistakes: number;
  toast: Toast | null;
};
