import { describe, expect, it } from 'vitest';
import { MENU, findMatchingTicket, findSauceRecipe, getMenu, isSaucePartial, judge } from './recipe';

describe('judge', () => {
  const tarako = getMenu('tarako');

  it('順序が違っても中身が一致すれば true', () => {
    expect(judge(['nori', 'noodle', 'tarakoSauce'], tarako)).toBe(true);
  });
  it('足りない・余る・違うと false', () => {
    expect(judge(['noodle', 'tarakoSauce'], tarako)).toBe(false);
    expect(judge(['noodle', 'tarakoSauce', 'nori', 'nori'], tarako)).toBe(false);
    expect(judge(['noodle', 'tarakoSauce', 'cheese'], tarako)).toBe(false);
  });
  it('同じ物の個数まで見る（ミートソース2杯）', () => {
    const meat = getMenu('meat');
    expect(judge(['noodle', 'meatSauce', 'cheese', 'parsley'], meat)).toBe(false);
    expect(judge(['noodle', 'meatSauce', 'meatSauce', 'cheese', 'parsley'], meat)).toBe(true);
  });
  it('メニューIDが重複しない', () => {
    expect(new Set(MENU.map((m) => m.id)).size).toBe(MENU.length);
  });
});

describe('findMatchingTicket', () => {
  const t = (id: number, arrivedAt: number) => ({ id, menuId: 'tarako', arrivedAt, station: 'pasta' as const });

  it('一致する伝票のうち最も古いものを返す', () => {
    const found = findMatchingTicket(['noodle', 'tarakoSauce', 'nori'], [t(2, 30), t(1, 10), t(3, 50)]);
    expect(found?.id).toBe(1);
  });
  it('一致なしは null', () => {
    expect(findMatchingTicket(['noodle'], [t(1, 0)])).toBeNull();
  });
});

describe('既定のソース（鍋で加熱する分）', () => {
  it('ミートソース：お玉2杯でそろう。1杯では途中', () => {
    expect(findSauceRecipe(['meatSauce'])).toBeNull();
    expect(findSauceRecipe(['meatSauce', 'meatSauce'])?.id).toBe('meat');
    expect(isSaucePartial(['meatSauce'])).toBe(true);
  });
  it('パルマ風：トマトソースとパンチェッタが、順不同でそろう', () => {
    expect(findSauceRecipe(['tomatoSauce', 'pancetta'])?.id).toBe('parma');
    expect(findSauceRecipe(['pancetta', 'tomatoSauce'])?.id).toBe('parma');
  });
  it('カルボナーラ：パック1つでそろう', () => {
    expect(findSauceRecipe(['carbonaraSauce'])?.id).toBe('carbonara');
  });
  it('どのソースにもならない組み合わせは、途中でもない', () => {
    expect(findSauceRecipe(['meatSauce', 'tomatoSauce'])).toBeNull();
    expect(isSaucePartial(['meatSauce', 'tomatoSauce'])).toBe(false);
  });
  it('ペンネアラビアータ：トマトソース・ガーリック・唐辛子が、順不同でそろう', () => {
    expect(findSauceRecipe(['tomatoSauce', 'garlic', 'chili'])?.id).toBe('penne');
    expect(findSauceRecipe(['chili', 'tomatoSauce', 'garlic'])?.id).toBe('penne');
    expect(findSauceRecipe(['tomatoSauce', 'garlic'])).toBeNull();
    expect(isSaucePartial(['tomatoSauce', 'garlic'])).toBe(true);
  });
  it('ほうれん草のソテー：ほうれん草2掴み・パンチェッタ・ソテーソースがそろう', () => {
    expect(findSauceRecipe(['spinach', 'spinach', 'pancetta', 'sauteSauce'])?.id).toBe('spinach');
    expect(findSauceRecipe(['spinach', 'pancetta', 'sauteSauce'])).toBeNull();
  });
  it('ペペロンチーノ：塩オイルソース・ガーリック・唐辛子が、順不同でそろう', () => {
    expect(findSauceRecipe(['saltOilSauce', 'garlic', 'chili'])?.id).toBe('peperoncino');
    expect(findSauceRecipe(['chili', 'saltOilSauce', 'garlic'])?.id).toBe('peperoncino');
    expect(findSauceRecipe(['saltOilSauce', 'garlic'])).toBeNull();
    expect(isSaucePartial(['saltOilSauce', 'garlic'])).toBe(true);
    // ペンネ（トマトソース・ガーリック・唐辛子）とは別のソース
    expect(findSauceRecipe(['tomatoSauce', 'garlic', 'chili'])?.id).toBe('penne');
  });
  it('イカスミのパスタ：イカ墨ソースとイカがそろう', () => {
    expect(findSauceRecipe(['squid', 'squidInkSauce'])?.id).toBe('squidInk');
    expect(findSauceRecipe(['squidInkSauce'])).toBeNull();
    expect(isSaucePartial(['squidInkSauce'])).toBe(true);
  });
  it('きのこのクリームパスタ：ホワイトソース・ほうれん草・パンチェッタ・きのこ・塩オイルソースが、順不同でそろう', () => {
    const mushroomCream = ['saltOilSauce', 'mushroom', 'whiteSauce', 'pancetta', 'spinach'] as const;
    expect(findSauceRecipe(mushroomCream)?.id).toBe('mushroomCream');
    expect(findSauceRecipe(mushroomCream.slice(1))).toBeNull();
    expect(isSaucePartial(mushroomCream.slice(1))).toBe(true);
    // ほうれん草のソテー（ほうれん草2掴み）とは別のソース
    expect(findSauceRecipe(['spinach', 'spinach', 'pancetta', 'sauteSauce'])?.id).toBe('spinach');
  });
  it('2つの新しいパスタの完成品の中身', () => {
    expect([...getMenu('squidInk').ingredients].sort()).toEqual(['noodle', 'parsley', 'squid', 'squidInkSauce']);
    expect([...getMenu('mushroomCream').ingredients].sort()).toEqual(
      ['blackPepper', 'cheese', 'mushroom', 'noodle', 'pancetta', 'saltOilSauce', 'spinach', 'whiteSauce'],
    );
  });
  it('サラダ系の3品の完成品の中身（レタスのサラダベースを使うのはわかめのサラダだけ）', () => {
    expect([...getMenu('wakameSalad').ingredients].sort()).toEqual(['dressing', 'paprika', 'saladBase', 'wakame', 'wakame']);
    expect([...getMenu('shrimpCocktail').ingredients].sort()).toEqual(['dressing', 'paprika', 'shrimp', 'shrimp', 'wakame']);
    expect([...getMenu('steamedChicken').ingredients].sort()).toEqual(['chicken', 'chicken', 'garum', 'vegetablePaste', 'wakame']);
    for (const id of ['wakameSalad', 'shrimpCocktail', 'steamedChicken']) {
      expect(getMenu(id).station).toBe('salad');
      expect(getMenu(id).sauce).toBeUndefined(); // 鍋は使わない
    }
  });
  it('無効にしたメニューのソースは対象外', () => {
    const off = MENU.map((m) => (m.id === 'penne' ? { ...m, enabled: false } : m));
    expect(findSauceRecipe(['tomatoSauce', 'garlic', 'chili'], off)).toBeNull();
  });
  it('ソースの材料は、完成品の材料に含まれている', () => {
    for (const m of MENU) {
      if (!m.sauce) continue;
      const rest = [...m.ingredients];
      for (const id of m.sauce) {
        const i = rest.indexOf(id);
        expect(i, `${m.id} の ${id}`).toBeGreaterThanOrEqual(0);
        rest.splice(i, 1);
      }
    }
  });
  it('あるソースの材料が、別のソースの材料の一部にならない（入れている途中で先に始まってしまうため）', () => {
    const sauces = MENU.filter((m) => m.enabled && m.sauce);
    for (const a of sauces) {
      for (const b of sauces) {
        if (a.id === b.id) continue;
        expect(findSauceRecipe(a.sauce!, [b])).toBeNull();
        // a が b の途中の状態になっていないこと（= b の一部だと、a が先に一致してしまう）
        expect(a.sauce!.length >= b.sauce!.length || !isSaucePartial(a.sauce!, [b])).toBe(true);
      }
    }
  });
});
