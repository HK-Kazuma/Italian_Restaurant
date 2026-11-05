// 時間・個数・スコアなどの設定値。リアルモードはこのオブジェクトを差し替えるだけで作る。
export type GameConfig = {
  gameDuration: number; // 制限時間（秒）

  // 茹で麺器
  boilerCount: number; // 口数
  boilTime: number; // 麺の茹で時間（秒）
  penneBoilTime: number; // ペンネの茹で時間（秒）。未決事項（スパゲッティと同じか）
  graceTime: number; // 麺が上がってからの猶予（秒）
  shortBoilTime: number; // ショート茹で（秒）

  // 熱湯（サラダ台とIHの間）
  hotWaterColumns: number; // パックを浸けられる場所の列数（3×3 = 9か所なら 3）
  hotWaterSlotCount: number; // パックを浸けられる数
  carbonaraWarmTime: number; // カルボナーラのパックを余温めする秒数（3秒以上）
  cornSoupWarmTime: number; // コーンスープのパックを温める秒数（5秒以上）
  cornSoupStackMax: number; // コーンスープのパックを一度に手に持てる数（ほかのパックは1つ）

  // 鍋とIH
  ihBurnerCount: number; // IHコンロの口数
  potCount: number; // 鍋の総数（未決。6で余裕、4で標準、3以下で洗浄が勝負）
  potWashTime: number; // 鍋の洗浄時間（秒、1個ずつ）
  maxPotContents: number; // 鍋に入れられる中身の上限
  mixClicks: number; // 麺を入れた鍋を混ぜ終わるまでのクリック数（Aパターンのパスタだけ）
  sauceHeatTime: number; // ソースの加熱時間（秒、仮）。麺より短くして、仕掛ける順番に意味を持たせる

  // 左の台
  plateSlotCount: number; // 左の台：パスタの皿を置いて盛り付ける場所の数
  saladSlotCount: number; // サラダ台：サラダを作る場所の数
  maxPlateContents: number; // 皿に載せられる中身の上限

  // 伝票
  firstTicketAt: number; // 最初の伝票が届く時刻（秒）
  ticketIntervalStart: number; // 開始時の届く間隔（秒）
  ticketIntervalEnd: number; // 終了時の届く間隔（秒）。後半ほど短くする
  ticketIntervalJitter: number; // 間隔のばらつき（0.25 なら ±25%）
  maxOpenTickets: number; // 同時に並ぶ伝票の上限

  // スコア
  speedBonusMax: number; // 速度ボーナスの最大値
  speedBonusWindow: number; // 速度ボーナスがゼロになるまでの秒数
  comboStep: number; // 連続提供1回ごとの倍率の増分
  comboMax: number; // 倍率の上限
  orderMissPenalty: number; // 注文ミスの減点

  // プレイヤー
  playerRadius: number; // 体の半径（m）。壁や設備にこれ以上は近づけない
  moveSpeed: number; // 移動速度（m/s）
  reach: number; // 手が届く距離（m）
  mouseSensitivity: number; // ラジアン/ピクセル
};

export const DEFAULT_CONFIG: GameConfig = {
  gameDuration: 300,

  boilerCount: 4,
  boilTime: 50,
  penneBoilTime: 50,
  graceTime: 30,
  shortBoilTime: 3,

  hotWaterColumns: 3,
  hotWaterSlotCount: 9,
  carbonaraWarmTime: 3,
  cornSoupWarmTime: 5,
  cornSoupStackMax: 5,

  ihBurnerCount: 4,
  potCount: 5,
  potWashTime: 5,
  maxPotContents: 8,
  mixClicks: 3,
  sauceHeatTime: 30,

  plateSlotCount: 3,
  saladSlotCount: 2,
  maxPlateContents: 8,

  firstTicketAt: 3,
  ticketIntervalStart: 25,
  ticketIntervalEnd: 10,
  ticketIntervalJitter: 0.25,
  maxOpenTickets: 8,

  speedBonusMax: 20,
  speedBonusWindow: 90,
  comboStep: 0.1,
  comboMax: 2,
  orderMissPenalty: 30,

  playerRadius: 0.3,
  moveSpeed: 2,
  reach: 5,
  mouseSensitivity: 0.0022,
};
