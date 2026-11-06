import { INGREDIENTS } from './ingredients';
import { isMixed, isNoodle, needsMix } from './pot';
import { MENU, findSauceRecipe, isSaucePartial, judge } from './recipe';
import type { IngredientId, Pot } from './types';

// 鍋・皿の上に浮かべる名前の出し方。
//  - 鍋：中身の名前は、視点を合わせたときだけ鍋の上に浮かべる（potPopup）。モニターには加熱の状態だけ（potMonitor）
//  - 皿：盛り付けている間は、視点を合わせたときだけ中身の名前。料理が出来上がったら、常に料理名だけ

export type LabelSpec = { text: string; color: string };

const WHITE = '#ffffff';
const YELLOW = '#ffe08a';
const GREEN = '#8be28b';
const RED = '#ff8a80';

// 同じ物はまとめる（ミートソース×2）
export function groupNames(ids: readonly IngredientId[]): string {
  const counts = new Map<IngredientId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => (n > 1 ? `${INGREDIENTS[id].name}×${n}` : INGREDIENTS[id].name)).join('、');
}

// 皿の中身が、メニューの料理と一致していれば、その料理名
export function dishName(contents: readonly IngredientId[]): string | null {
  if (contents.length === 0) return null;
  return MENU.find((m) => m.enabled && judge(contents, m))?.name ?? null;
}

// 皿の名前。null = 何も出さない
export function plateLabel(contents: readonly IngredientId[], hovered: boolean): LabelSpec | null {
  if (contents.length === 0) return null;
  const dish = dishName(contents);
  if (dish) return { text: dish, color: GREEN };
  return hovered ? { text: groupNames(contents), color: WHITE } : null;
}

// IHに載っている鍋の、モニター（コンロの手前）に映す文字。加熱の状態だけで、中身の名前は出さない。null = 消す
export function potMonitor(pot: Pot): LabelSpec | null {
  if (pot.contents.length === 0) return null;
  if (pot.heat === 'heating') return { text: `加熱中 ${Math.ceil(pot.heatTimer)}`, color: WHITE };
  if (pot.heat === 'cold') return null;

  // 加熱完了：麺を入れたあとは、混ぜる進み具合
  if (needsMix(pot)) {
    return isMixed(pot)
      ? { text: '混ざった！', color: GREEN }
      : { text: `混ぜる ${pot.mixCount}/${pot.mixNeed}`, color: YELLOW };
  }
  return { text: '完成！', color: GREEN };
}

// IHに載っている鍋の中身の名前（鍋の上に浮かべる）。視点を合わせたときだけ。null = 何も出さない
export function potPopup(pot: Pot, hovered: boolean): LabelSpec | null {
  if (!hovered || pot.contents.length === 0) return null;
  if (pot.heat === 'cold') {
    // 作れない組み合わせは赤で知らせる
    return { text: groupNames(pot.contents), color: isSaucePartial(pot.contents) ? WHITE : RED };
  }
  if (pot.heat === 'heating') return { text: groupNames(pot.contents), color: WHITE };

  // 加熱完了：ソースの名前（麺が入っていれば、そのぶんを除いて数える）
  const recipe = findSauceRecipe(pot.contents.filter((id) => !isNoodle(id)));
  return { text: recipe ? `${recipe.name}のソース` : groupNames(pot.contents), color: WHITE };
}
