import { INGREDIENTS } from './ingredients';
import { isMixed, isNoodle, needsMix } from './pot';
import { MENU, findSauceRecipe, isSaucePartial, judge } from './recipe';
import type { IngredientId, Pot } from './types';

// 鍋・皿の上に浮かべる名前の出し方。
//  - 鍋：材料を入れている間は、視点を合わせたときだけ中身の名前。加熱中は「加熱中」だけ。完成したらソースの名前
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

// IHに載っている鍋の名前。null = 何も出さない
export function potLabel(pot: Pot, hovered: boolean): LabelSpec | null {
  if (pot.contents.length === 0) return null;
  if (pot.heat === 'heating') return { text: `加熱中 ${Math.ceil(pot.heatTimer)}`, color: WHITE };
  if (pot.heat === 'cold') {
    if (!hovered) return null;
    // 作れない組み合わせは赤で知らせる
    return { text: groupNames(pot.contents), color: isSaucePartial(pot.contents) ? WHITE : RED };
  }

  // 加熱完了：ソースの名前（麺が入っていれば、そのぶんを除いて数える）
  const recipe = findSauceRecipe(pot.contents.filter((id) => !isNoodle(id)));
  const name = recipe ? `${recipe.name}のソース` : groupNames(pot.contents);
  if (needsMix(pot)) {
    return isMixed(pot)
      ? { text: `${name} 混ざった！`, color: GREEN }
      : { text: `${name} 混ぜる ${pot.mixCount}/${pot.mixNeed}`, color: YELLOW };
  }
  return { text: `${name} 完成！`, color: GREEN };
}
