import { describe, expect, it } from 'vitest';
import {
  FRIDGE_HOME,
  FRIDGE_ITEM_IDS,
  FRIDGE_ITEM_SIZE,
  FRIDGE_SHELF_Y,
  clampOnShelf,
  fitsOnShelf,
  fridgeItemOf,
  returnToFridge,
} from './fridge';

describe('冷蔵庫の中の物の最初の置き場所', () => {
  const all = FRIDGE_ITEM_IDS.map((id) => ({ id, spot: FRIDGE_HOME[id] }));

  it('どれも、同じ棚のほかの物と重ならない', () => {
    for (const { id, spot } of all) expect(fitsOnShelf(id, spot, all), id).toBe(true);
  });

  it('どれも、棚板の内側に収まっている', () => {
    for (const { id, spot } of all) {
      const c = clampOnShelf(id, spot.x, spot.z);
      expect(c.x, id).toBeCloseTo(spot.x);
      expect(c.z, id).toBeCloseTo(spot.z);
    }
  });
});

describe('fitsOnShelf', () => {
  it('同じ棚で重なれば置けず、接するだけなら置ける', () => {
    const a = { id: 'meatSauce' as const, spot: { shelf: 1 as const, x: 0.4, z: 0 } };
    const w = FRIDGE_ITEM_SIZE.meatSauce.hz + FRIDGE_ITEM_SIZE.tomatoSauce.hz;
    expect(fitsOnShelf('tomatoSauce', { shelf: 1, x: 0.4, z: w - 0.01 }, [a])).toBe(false);
    expect(fitsOnShelf('tomatoSauce', { shelf: 1, x: 0.4, z: w }, [a])).toBe(true);
    expect(fitsOnShelf('tomatoSauce', { shelf: 2, x: 0.4, z: 0 }, [a])).toBe(true); // 別の棚
  });
  it('冷蔵庫は4段で、最下段にも置ける', () => {
    expect(FRIDGE_SHELF_Y).toHaveLength(4);
    expect(clampOnShelf('meatSauce', 0.4, 0).z).toBe(0);
    expect(fitsOnShelf('meatSauce', { shelf: 0, x: 0.4, z: 0 }, [])).toBe(true);
  });
});

describe('fridgeItemOf', () => {
  it('冷蔵庫の中の物の対象から、どの物かが分かる', () => {
    expect(fridgeItemOf({ kind: 'stock', id: 'meatSauce', inFridge: true })).toBe('meatSauce');
    expect(fridgeItemOf({ kind: 'fridgeTray', id: 'spinach' })).toBe('spinachTray');
    expect(fridgeItemOf({ kind: 'fridgeTray', id: 'saltOil' })).toBe('saltOilCase');
  });
  it('冷蔵庫の外の物・ほかの対象は null', () => {
    expect(fridgeItemOf({ kind: 'stock', id: 'shrimp' })).toBeNull();
    expect(fridgeItemOf({ kind: 'fridgeDoor' })).toBeNull();
    expect(fridgeItemOf(null)).toBeNull();
  });
});

describe('returnToFridge', () => {
  it('もとの場所が空いていれば、そのまま', () => {
    const r = returnToFridge(FRIDGE_HOME, ['spinachTray', 'saltOilCase']);
    expect(r).toEqual(FRIDGE_HOME);
  });
  it('もとの場所にほかの物があれば、重ならない近くの場所へ', () => {
    const items = { ...FRIDGE_HOME, tomatoSauce: { ...FRIDGE_HOME.spinachTray } };
    const r = returnToFridge(items, ['spinachTray']);
    expect(r.tomatoSauce).toEqual(items.tomatoSauce); // 冷蔵庫の中の物は動かさない
    expect(r.spinachTray).not.toEqual(items.spinachTray);
    expect(r.spinachTray.shelf).toBe(FRIDGE_HOME.spinachTray.shelf); // 同じ棚に空きがあれば、同じ棚
    const all = FRIDGE_ITEM_IDS.map((id) => ({ id, spot: r[id] }));
    for (const { id, spot } of all) expect(fitsOnShelf(id, spot, all), id).toBe(true);
    const c = clampOnShelf('spinachTray', r.spinachTray.x, r.spinachTray.z);
    expect(c.x).toBeCloseTo(r.spinachTray.x);
    expect(c.z).toBeCloseTo(r.spinachTray.z);
  });
});
