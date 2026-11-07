import type { GameConfig } from './config';

// 難易度。iPad の「ゲーム開始」で選ぶ。伝票の量（届く間隔・同時に並ぶ数）と、出てくる料理（品ごとの出やすさ）が変わる。
// 数値を調整するときは、この表だけ触ればよい。
export type Difficulty = 'trial' | 'leading' | 'associate';

type TicketTuning = Pick<
  GameConfig,
  'firstTicketAt' | 'ticketIntervalStart' | 'ticketIntervalEnd' | 'ticketIntervalJitter' | 'maxOpenTickets'
>;

export type DifficultyDef = {
  id: Difficulty;
  name: string; // 難易度の名前
  tagline: string; // 一言（どんな人向けか）
  summary: string; // 伝票と料理の特徴（iPad に出す）
  // config.ts の伝票の設定を、この難易度で上書きする分。書かない項目は config.ts のまま
  tickets: Partial<TicketTuning>;
  // 品ごとの出やすさ（recipe.ts の id）。0 = 出ない。書いていない品は 1。比率で決まる
  menuWeights: Record<string, number>;
};

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'trial',
    name: 'トライアルクルー',
    tagline: '入りたてのバイトクルー',
    summary: '伝票はゆっくり届き、並ぶのは最大3枚。手順の多いペペロンチーノ・カルボナーラ・ペンネ・きのこのクリームパスタ・小エビのカクテル・蒸し鶏の香味ソースは出ません。',
    tickets: { firstTicketAt: 5, ticketIntervalStart: 40, ticketIntervalEnd: 25, ticketIntervalJitter: 0.15, maxOpenTickets: 3 },
    menuWeights: { tarako: 3, meat: 2, parma: 2, spinach: 1, shrimpSalad: 2, chickenSalad: 2, cornSoup: 2, peperoncino: 0, carbonara: 0, penne: 0, squidInk: 1, mushroomCream: 0, wakameSalad: 2, shrimpCocktail: 0, steamedChicken: 0 },
  },
  {
    id: 'leading',
    name: 'リーディングクルー',
    tagline: '慣れてきたころ合い',
    summary: '伝票は25秒おきから10秒おきへ、最大10枚。全メニューが同じ確率で出ます。',
    tickets: {}, // config.ts の標準値のまま
    menuWeights: {},
  },
  {
    id: 'associate',
    name: 'アソシエイトクルー',
    tagline: 'キッチンのプロ。かなりの腕前',
    summary: '伝票は18秒おきから8秒おきへ、最大10枚。ペペロンチーノ・カルボナーラ・ペンネ・きのこのクリームパスタなど、手順の多いパスタや、小エビのカクテル・蒸し鶏の香味ソースが多めに届きます。',
    tickets: { firstTicketAt: 2, ticketIntervalStart: 18, ticketIntervalEnd: 8, ticketIntervalJitter: 0.3, maxOpenTickets: 10 },
    menuWeights: { tarako: 1, meat: 2, parma: 2, peperoncino: 3, carbonara: 3, penne: 3, squidInk: 2, mushroomCream: 3, wakameSalad: 1, shrimpCocktail: 2, steamedChicken: 2, spinach: 2, shrimpSalad: 1, chickenSalad: 1, cornSoup: 1 },
  },
];

export const DEFAULT_DIFFICULTY: Difficulty = 'leading';

export function getDifficulty(id: Difficulty): DifficultyDef {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(`unknown difficulty: ${id}`);
  return d;
}

// この難易度での設定。練習（difficulty なし）は config.ts のまま
export function configFor(cfg: GameConfig, difficulty: Difficulty | null): GameConfig {
  return difficulty ? { ...cfg, ...getDifficulty(difficulty).tickets } : cfg;
}

export function isDifficulty(x: string | undefined): x is Difficulty {
  return DIFFICULTIES.some((d) => d.id === x);
}
