import type { IngredientId, Station, Ticket } from './types';

export type MenuItem = {
  id: string;
  name: string;
  station: Station;
  ingredients: IngredientId[]; // 完成品の中身（順序なし。同じ物は個数分並べる）
  sauce?: IngredientId[]; // このうち、鍋に入れて加熱する分（既定のソース）。鍋がこの中身になったら、IHで加熱が始まる
  steps: string[]; // 作り方（iPad のレシピに出す）
  basePoints: number;
  enabled: boolean; // false の間は伝票に出ない（必要な設備が未実装）
};

// 要件定義書「メニューとレシピ」の品（enabled: false にすると、その品は伝票に出ない）
export const MENU: MenuItem[] = [
  {
    id: 'tarako',
    name: 'たらこのパスタ',
    station: 'pasta',
    ingredients: ['noodle', 'tarakoSauce', 'nori'],
    steps: [
      "皿に、茹で上がった麺を盛る",
      "たらこソースのパックを麺にかける",
      "刻みのりをかける",
      "提供台へ（鍋・IHは使いません）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'meat',
    name: 'ミートパスタ',
    station: 'pasta',
    ingredients: ['noodle', 'meatSauce', 'meatSauce', 'cheese', 'parsley'],
    sauce: ['meatSauce', 'meatSauce'],
    steps: [
      "冷蔵庫のミートソース缶から、お玉2杯を鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、加熱した鍋に麺を入れて混ぜる",
      "皿に盛り、粉チーズ1杯とパセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'parma',
    name: 'パルマ風パスタ',
    station: 'pasta',
    ingredients: ['noodle', 'tomatoSauce', 'pancetta', 'cheese'],
    sauce: ['tomatoSauce', 'pancetta'],
    steps: [
      "具材コーナーのトマトソース1杯と、パンチェッタ1掴みを鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、加熱した鍋に麺を入れて混ぜる",
      "皿に盛り、粉チーズ1杯を振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'peperoncino',
    name: 'ペペロンチーノ',
    station: 'pasta',
    ingredients: ['noodle', 'saltOilSauce', 'garlic', 'chili', 'parsley'],
    sauce: ['saltOilSauce', 'garlic', 'chili'],
    steps: [
      "冷蔵庫から塩オイルソースのケースを出して、サラダ台に置く",
      "塩オイルソース1杯、ガーリック1杯、唐辛子1杯を鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、皿に麺を盛る",
      "鍋のソースをかけ、パセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'carbonara',
    name: 'カルボナーラ',
    station: 'pasta',
    ingredients: ['noodle', 'carbonaraSauce', 'cheese', 'blackPepper'],
    sauce: ['carbonaraSauce'],
    steps: [
      "冷蔵庫からカルボナーラのパックを取る",
      "茹で麺器の左の熱湯に3秒以上つけて、余温めする",
      "余温めしたパックを鍋に入れて、IHで加熱",
      "麺が上がったら、皿に麺を盛る",
      "鍋のソースをかけ、粉チーズ1杯とブラックペッパーを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'penne',
    name: 'ペンネアラビアータ',
    station: 'pasta',
    ingredients: ['penne', 'tomatoSauce', 'garlic', 'chili', 'parsley'],
    sauce: ['tomatoSauce', 'garlic', 'chili'],
    steps: [
      "冷蔵庫からペンネを取り、茹で麺器に麺と同じようにセットして茹でる",
      "鍋にトマトソース1杯、ガーリック1杯、唐辛子1杯を入れる",
      "鍋をIHにセットして加熱",
      "ペンネが上がったら、加熱した鍋に入れて混ぜる",
      "皿に盛り、パセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'spinach',
    name: 'ほうれん草のソテー',
    station: 'pasta',
    ingredients: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    sauce: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    steps: [
      "冷蔵庫からほうれん草のトレーを取り、サラダ台に置く",
      "トングでほうれん草を2掴み、鍋に入れる",
      "パンチェッタ1掴みと、ソテーソースのパックを鍋に入れる",
      "鍋をIHにセットして加熱",
      "加熱が終わったら混ぜる",
      "パスタ皿の横にある小さめの皿に盛る",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'shrimpSalad',
    name: '小エビのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'shrimp', 'dressing', 'paprika'],
    steps: [
      "冷蔵庫からサラダベースを取り、サラダ台に置く",
      "具材コーナーの小エビを1杯、サラダに盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'chickenSalad',
    name: 'チキンのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'chicken', 'dressing', 'paprika'],
    steps: [
      "冷蔵庫からサラダベースを取り、サラダ台に置く",
      "具材コーナーのサラダチキンをトング1掴み、サラダに盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'cornSoup',
    name: 'コーンスープ',
    station: 'salad',
    ingredients: ['cornSoup'],
    steps: [
      "冷蔵庫からコーンスープのパックを取る（クリックした回数だけ、最大5つ持てる）",
      "茹で麺器の左の熱湯に5秒以上つけて温める",
      "サラダ台の上のスープ皿を取り、サラダ台に置く",
      "温めたパックをスープ皿に入れて完成",
    ],
    basePoints: 10,
    enabled: true,
  },
];

export function getMenu(id: string): MenuItem {
  const menu = MENU.find((m) => m.id === id);
  if (!menu) throw new Error(`unknown menu: ${id}`);
  return menu;
}

// --- 鍋で作るソース（既定の組み合わせ）---

function sameItems(a: readonly IngredientId[], b: readonly IngredientId[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((id, i) => id === y[i]);
}

// 鍋の中身が、既定のソースと一致していれば、そのメニューを返す（入れた順序は問わない）。
// 一致したらIHで加熱が始まる。あるソースの材料が、別のソースの材料の一部になる組み合わせは作らないこと
// （作ると、入れている途中で先に一致して、加熱が始まってしまう）
export function findSauceRecipe(contents: readonly IngredientId[], menus: readonly MenuItem[] = MENU): MenuItem | null {
  return menus.find((m) => m.enabled && m.sauce && sameItems(contents, m.sauce)) ?? null;
}

// 入れている途中（既定のソースの材料の一部）かどうか。false なら、どのソースにもならない組み合わせ
export function isSaucePartial(contents: readonly IngredientId[], menus: readonly MenuItem[] = MENU): boolean {
  return menus.some((m) => {
    if (!m.enabled || !m.sauce) return false;
    const rest = [...m.sauce];
    for (const id of contents) {
      const i = rest.indexOf(id);
      if (i < 0) return false;
      rest.splice(i, 1);
    }
    return true;
  });
}

// 皿の中身とレシピが一致するか（順序は問わず、個数まで一致）
export function judge(contents: readonly IngredientId[], menu: MenuItem): boolean {
  if (contents.length !== menu.ingredients.length) return false;
  const a = [...contents].sort();
  const b = [...menu.ingredients].sort();
  return a.every((id, i) => id === b[i]);
}

// 提供した皿に合う伝票のうち、最も古いものを返す
export function findMatchingTicket(
  contents: readonly IngredientId[],
  tickets: readonly Ticket[],
): Ticket | null {
  const matches = tickets.filter((t) => judge(contents, getMenu(t.menuId)));
  if (matches.length === 0) return null;
  return matches.reduce((oldest, t) => (t.arrivedAt < oldest.arrivedAt ? t : oldest));
}
