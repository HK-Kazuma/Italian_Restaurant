import type { IngredientId, Station, Ticket } from './types';

export type MenuItem = {
  id: string;
  name: string;
  station: Station;
  ingredients: IngredientId[]; // 完成品の中身（順序なし。同じ物は個数分並べる）
  sauce?: IngredientId[]; // このうち、鍋に入れて加熱する分（既定のソース）。鍋がこの中身になったら、IHで加熱が始まる
  basePoints: number;
  enabled: boolean; // false の間は伝票に出ない（必要な設備が未実装）
};

// 要件定義書「メニューとレシピ」の9品。鍋・IH・サラダ台が揃うまでは enabled: false
export const MENU: MenuItem[] = [
  {
    id: 'tarako',
    name: 'たらこのパスタ',
    station: 'pasta',
    ingredients: ['noodle', 'tarakoSauce', 'nori'],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'meat',
    name: 'ミートパスタ',
    station: 'pasta',
    ingredients: ['noodle', 'meatSauce', 'meatSauce', 'cheese', 'parsley'],
    sauce: ['meatSauce', 'meatSauce'],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'parma',
    name: 'パルマ風パスタ',
    station: 'pasta',
    ingredients: ['noodle', 'tomatoSauce', 'pancetta', 'cheese'],
    sauce: ['tomatoSauce', 'pancetta'],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'carbonara',
    name: 'カルボナーラ',
    station: 'pasta',
    ingredients: ['noodle', 'carbonaraSauce', 'cheese', 'blackPepper'],
    sauce: ['carbonaraSauce'],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'penne',
    name: 'ペンネアラビアータ',
    station: 'pasta',
    ingredients: ['penne', 'tomatoSauce', 'garlic', 'chili', 'parsley'],
    sauce: ['tomatoSauce', 'garlic', 'chili'],
    basePoints: 50,
    enabled: false,
  },
  {
    id: 'spinach',
    name: 'ほうれん草のソテー',
    station: 'pasta',
    ingredients: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    sauce: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    basePoints: 30,
    enabled: false,
  },
  {
    id: 'shrimpSalad',
    name: '小エビのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'shrimp', 'dressing', 'paprika'],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'chickenSalad',
    name: 'チキンのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'chicken', 'dressing', 'paprika'],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'cornSoup',
    name: 'コーンスープ',
    station: 'salad',
    ingredients: ['cornSoup'],
    basePoints: 10,
    enabled: false,
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
