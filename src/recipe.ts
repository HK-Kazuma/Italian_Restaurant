import type { IngredientId, Station, Ticket } from './types';

export type MenuItem = {
  id: string;
  name: string;
  station: Station;
  ingredients: IngredientId[]; // 完成品の中身（順序なし。同じ物は個数分並べる）
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
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'parma',
    name: 'パルマ風パスタ',
    station: 'pasta',
    ingredients: ['noodle', 'tomatoSauce', 'pancetta', 'cheese'],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'carbonara',
    name: 'カルボナーラ',
    station: 'pasta',
    ingredients: ['noodle', 'carbonaraSauce', 'cheese', 'blackPepper'],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'penne',
    name: 'ペンネアラビアータ',
    station: 'pasta',
    ingredients: ['penne', 'tomatoSauce', 'garlic', 'chili', 'parsley'],
    basePoints: 50,
    enabled: false,
  },
  {
    id: 'spinach',
    name: 'ほうれん草のソテー',
    station: 'pasta',
    ingredients: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    basePoints: 30,
    enabled: false,
  },
  {
    id: 'shrimpSalad',
    name: '小エビのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'shrimp', 'dressing', 'paprika'],
    basePoints: 10,
    enabled: false,
  },
  {
    id: 'chickenSalad',
    name: 'チキンのサラダ',
    station: 'salad',
    ingredients: ['saladBase', 'chicken', 'dressing', 'paprika'],
    basePoints: 10,
    enabled: false,
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
