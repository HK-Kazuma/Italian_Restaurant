// 時間・個数・スコアなどの設定値。リアルモードはこのオブジェクトを差し替えるだけで作る。
export type GameConfig = {
  gameDuration: number; // 制限時間（秒）

  // 茹で麺器
  boilerCount: number; // 口数
  boilTime: number; // 麺の茹で時間（秒）
  graceTime: number; // 麺が上がってからの猶予（秒）
  shortBoilTime: number; // ショート茹で（秒）

  // 左の台
  plateSlotCount: number; // 皿を置いて盛り付ける場所の数
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
  moveRadius: number; // 中央から動ける半径（m）
  moveSpeed: number; // 移動速度（m/s）
  reach: number; // 手が届く距離（m）
  mouseSensitivity: number; // ラジアン/ピクセル
};

export const DEFAULT_CONFIG: GameConfig = {
  gameDuration: 300,

  boilerCount: 4,
  boilTime: 60,
  graceTime: 30,
  shortBoilTime: 3,

  plateSlotCount: 3,
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

  moveRadius: 0.8,
  moveSpeed: 2,
  reach: 5,
  mouseSensitivity: 0.0022,
};
