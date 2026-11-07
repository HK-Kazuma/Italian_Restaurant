import { describe, expect, it } from 'vitest';
import { FRIDGE_HOME, FRIDGE_ITEM_IDS } from './fridge';
import {
  FREE_TRAY_IDS,
  TRAY_CONTENT,
  TRAY_FRIDGE_ITEM,
  TRAY_IDS,
  TRAY_SPOT_COUNT,
  TRAY_ZONE,
  freeTraySpots,
  trayAt,
  trayContentName,
  trayOfFridgeItem,
} from './tray';
import type { GameState, TrayId } from './types';

// 置き場の判定に使う部分だけの状態
function placement(overrides: Partial<Record<TrayId, [GameState['trays'][TrayId], number]>> = {}) {
  const trays = Object.fromEntries(TRAY_IDS.map((id) => [id, overrides[id]?.[0] ?? 'fridge'])) as GameState['trays'];
  const traySpot = Object.fromEntries(TRAY_IDS.map((id) => [id, overrides[id]?.[1] ?? 0])) as GameState['traySpot'];
  return { trays, traySpot };
}

describe('トレー・ケースの決まり', () => {
  it('どのトレー・ケースも、冷蔵庫の中の物と1対1で対応し、最初の置き場所がある', () => {
    for (const id of TRAY_IDS) {
      expect(FRIDGE_ITEM_IDS).toContain(TRAY_FRIDGE_ITEM[id]);
      expect(FRIDGE_HOME[TRAY_FRIDGE_ITEM[id]]).toBeDefined();
      expect(trayOfFridgeItem(TRAY_FRIDGE_ITEM[id])).toBe(id);
    }
    expect(new Set(TRAY_IDS.map((id) => TRAY_FRIDGE_ITEM[id])).size).toBe(TRAY_IDS.length);
    expect(trayOfFridgeItem('meatSauce')).toBeNull();
  });

  it('中身は種類ごとに決まっていて、置いたあとの名前になる', () => {
    expect(TRAY_CONTENT.shrimp).toBe('shrimp');
    expect(TRAY_CONTENT.saltOil).toBe('saltOilSauce');
    expect(trayContentName('shrimp')).toBe('小エビ');
    expect(trayContentName('chicken')).toBe('サラダチキン');
    expect(trayContentName('pancetta')).toBe('パンチェッタ');
    expect(trayContentName('sauteSauce')).toBe('ソテーソース');
    expect(trayContentName('tomatoSauce')).toBe('トマトソース');
    expect(trayContentName('spinach')).toBe('ほうれん草');
    expect(trayContentName('saltOil')).toBe('塩オイルソース');
    expect(trayContentName('squid')).toBe('イカ');
    expect(trayContentName('mushroom')).toBe('きのこ');
  });

  it('小エビ・チキン・パンチェッタ・イカ・きのこ・ソテーソース・トマトソースは、同じトッピングの置き場（7か所）に置く', () => {
    for (const id of ['shrimp', 'chicken', 'pancetta', 'squid', 'mushroom', 'sauteSauce', 'tomatoSauce'] as const) expect(TRAY_ZONE[id]).toBe('topping');
    expect(TRAY_ZONE.spinach).toBe('spinach');
    expect(TRAY_ZONE.saltOil).toBe('saltOil');
    expect(TRAY_SPOT_COUNT).toEqual({ spinach: 1, saltOil: 3, topping: 7 });
  });

  it('ガーリック・唐辛子の容器は置き場（区画）を持たず、台の上のどこにでも置ける', () => {
    expect(FREE_TRAY_IDS).toEqual(['garlic', 'chili']);
    for (const id of FREE_TRAY_IDS) expect(TRAY_ZONE[id]).toBeNull();
    expect(TRAY_CONTENT.garlic).toBe('garlic');
    expect(trayContentName('garlic')).toBe('ガーリック');
    expect(trayContentName('chili')).toBe('唐辛子');
    expect(freeTraySpots(placement(), 'topping')).toEqual([0, 1, 2, 3, 4, 5, 6]); // 置き場の空きには数えない
  });
});

describe('置き場の空き', () => {
  it('置いてあるトレーが、その区画のその番号にあるときだけ分かる', () => {
    const s = placement({ chicken: ['table', 2], spinach: ['table', 0], pancetta: ['hand', 1] });
    expect(trayAt(s, 'topping', 2)).toBe('chicken');
    expect(trayAt(s, 'topping', 1)).toBeNull(); // 手に持っている
    expect(trayAt(s, 'topping', 0)).toBeNull();
    expect(trayAt(s, 'spinach', 0)).toBe('spinach');
    expect(trayAt(s, 'saltOil', 0)).toBeNull(); // 同じ番号でも、区画が違う
  });

  it('空いている置き場の番号を、若い順に返す', () => {
    expect(freeTraySpots(placement(), 'topping')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const s = placement({ shrimp: ['table', 0], sauteSauce: ['table', 2] });
    expect(freeTraySpots(s, 'topping')).toEqual([1, 3, 4, 5, 6]);
    expect(freeTraySpots(placement({ spinach: ['table', 0] }), 'spinach')).toEqual([]);
    expect(freeTraySpots(placement({ saltOil: ['table', 1] }), 'saltOil')).toEqual([0, 2]);
  });
});
