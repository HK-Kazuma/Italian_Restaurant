import { describe, expect, it } from 'vitest';
import { MENU, findMatchingTicket, getMenu, judge } from './recipe';

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
