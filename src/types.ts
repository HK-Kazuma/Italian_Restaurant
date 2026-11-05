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
  | 'saladBase'
  | 'shrimp'
  | 'chicken'
  | 'dressing'
  | 'paprika'
  | 'cornSoup';

// 手に持って、皿にかける・振るボトル。決まった台の上に自由に置ける（置ける台は bottle.ts）
export type BottleId = Extract<IngredientId, 'dressing' | 'paprika' | 'parsley'>;

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
  | { kind: 'tray' } // ほうれん草のトレー
  | { kind: 'bottle'; id: BottleId } // ドレッシング・パプリカパウダー・パセリ。右クリックで皿にかける・振る（なくならない）
  | { kind: 'pot'; pot: Pot };

// 視点の先にあるクリック可能な設備
export type Target =
  | { kind: 'noodleRack' }
  | { kind: 'plateStack'; style?: PlateStyle } // 皿の山。style 省略 = plate（小皿・スープ皿の山もある）
  | { kind: 'stock'; id: IngredientId; inFridge?: boolean } // クリックで手に取れる取り出し元（缶・パック・トッピングなど）。inFridge は冷蔵庫の中（扉が開いている間だけ取れる）
  | { kind: 'fridgeDoor' } // 冷蔵庫（扉・本体）。右クリックで開閉
  | { kind: 'spinachTray' } // 冷蔵庫の中のほうれん草のトレー（扉が開いている間だけ取れる）
  | { kind: 'traySlot' } // サラダ台の上のトレー置き場。置いたトレーから、トングでほうれん草を取れる
  | { kind: 'boilerBasket'; index: number }
  | { kind: 'boilerButton'; index: number }
  | { kind: 'plateSlot'; index: number }
  | { kind: 'servePass' }
  | { kind: 'potSlot'; index: number } // 鍋置き場の1か所
  | { kind: 'ihBurner'; index: number }
  | { kind: 'hotWaterSlot'; index: number } // 熱湯に浸けるパックの置き場所
  | { kind: 'bottle'; id: BottleId } // 台の上のボトル
  | { kind: 'tableTop'; surface: SurfaceId; x: number; z: number } // 台の天板。x, z は視点が合っている点（台の中心からの相対）
  | { kind: 'washer' };

export type Phase = 'title' | 'playing' | 'paused' | 'result';

export type Toast = {
  text: string;
  kind: 'good' | 'bad' | 'info';
  expiresAt: number; // ゲーム内時刻
};

export type GameState = {
  phase: Phase;
  time: number; // 経過時間（秒）
  hand: Item | null;
  boilers: Boiler[];
  plateSlots: (IngredientId[] | null)[]; // 皿の置き場。左の台（plateSlotCount 個）→ サラダ台（saladSlotCount 個）の順。null = 皿なし
  plateStyles: PlateStyle[]; // plateSlots と同じ並び。置いてある皿の種類
  tray: 'fridge' | 'hand' | 'table'; // ほうれん草のトレーの場所（冷蔵庫 / 手 / サラダ台）
  fridgeOpen: boolean; // 冷蔵庫の扉（最初は閉まっている）
  bottles: Record<BottleId, BottleSpot>; // 台の上のボトル
  hotWater: (Pack | null)[]; // 熱湯に浸けているパック（3×3の9か所、左上から横に数える）。null = 空き
  potSlots: (Pot | null)[]; // 鍋置き場。null = 空き
  ihBurners: (Pot | null)[];
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
