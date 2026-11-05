import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import {
  addIngredient,
  canAddIngredient,
  canInsert,
  canPour,
  canStartHeating,
  createPot,
  createWasher,
  insertPot,
  isWashing,
  pourOnto,
  sauceFill,
  startHeating,
  takeWashedPot,
  updateHeat,
  updateWasher,
} from './pot';

const max = cfg.maxPotContents;

describe('鍋の加熱', () => {
  it('具材を入れると使用済みになり、加熱を開始できる', () => {
    const pot = createPot();
    expect(canStartHeating(pot)).toBe(false); // 空では加熱できない
    addIngredient(pot, 'meatSauce');
    expect(pot.dirty).toBe(true);
    expect(startHeating(pot, cfg)).toBe(true);
    expect(pot.heat).toBe('heating');
    expect(startHeating(pot, cfg)).toBe(false); // 加熱中の押し直しは無効
  });

  it('時間が経つと自動で完了になる', () => {
    const pot = createPot();
    addIngredient(pot, 'meatSauce');
    startHeating(pot, cfg);
    updateHeat(pot, cfg.sauceHeatTime - 1);
    expect(pot.heat).toBe('heating');
    updateHeat(pot, 1);
    expect(pot.heat).toBe('ready');
    expect(pot.heatTimer).toBe(0);
  });

  it('ソースは加熱前だけ、麺は加熱完了後だけ入れられる', () => {
    const pot = createPot();
    expect(canAddIngredient(pot, 'meatSauce', max)).toBe(true);
    expect(canAddIngredient(pot, 'noodle', max)).toBe(false);
    addIngredient(pot, 'meatSauce');
    startHeating(pot, cfg);
    expect(canAddIngredient(pot, 'meatSauce', max)).toBe(false); // 加熱中
    updateHeat(pot, cfg.sauceHeatTime);
    expect(canAddIngredient(pot, 'meatSauce', max)).toBe(false); // 完了後にソースは足せない
    expect(canAddIngredient(pot, 'noodle', max)).toBe(true);
  });

  it('上限を超えて入らない', () => {
    const pot = createPot();
    for (let i = 0; i < max; i++) addIngredient(pot, 'meatSauce');
    expect(canAddIngredient(pot, 'meatSauce', max)).toBe(false);
  });
});

describe('皿にかける', () => {
  const readyPot = () => {
    const pot = createPot();
    addIngredient(pot, 'meatSauce');
    addIngredient(pot, 'meatSauce');
    startHeating(pot, cfg);
    updateHeat(pot, cfg.sauceHeatTime);
    return pot;
  };

  it('完了前はかけられない', () => {
    const pot = createPot();
    addIngredient(pot, 'meatSauce');
    expect(canPour(pot, [], 8)).toBe(false);
  });

  it('完了後は中身が皿に移り、鍋は空の使用済みになる', () => {
    const pot = readyPot();
    const plate: ('noodle' | 'meatSauce')[] = ['noodle'];
    expect(canPour(pot, plate, 8)).toBe(true);
    pourOnto(pot, plate);
    expect(plate).toEqual(['noodle', 'meatSauce', 'meatSauce']);
    expect(pot.contents).toEqual([]);
    expect(pot.dirty).toBe(true);
    expect(pot.heat).toBe('cold');
    expect(canAddIngredient(pot, 'meatSauce', max)).toBe(false); // 洗うまで再利用できない
  });

  it('皿の上限を超えるならかけられない', () => {
    expect(canPour(readyPot(), ['noodle'], 2)).toBe(false);
  });
});

describe('washer', () => {
  const used = () => {
    const p = createPot();
    addIngredient(p, 'meatSauce');
    return p;
  };

  it('使用済みの鍋だけ入れられる', () => {
    const w = createWasher();
    expect(canInsert(w, createPot())).toBe(false);
    expect(insertPot(w, createPot(), cfg)).toBe(false);
    expect(insertPot(w, used(), cfg)).toBe(true);
  });

  it('洗浄は1個ずつ：入っている間は次を入れられない', () => {
    const w = createWasher();
    insertPot(w, used(), cfg);
    expect(canInsert(w, used())).toBe(false);
  });

  it('洗浄中は取り出せず、5秒後に洗い済みになって取り出せる', () => {
    const w = createWasher();
    const pot = used();
    startHeating(pot, cfg);
    insertPot(w, pot, cfg);
    expect(isWashing(w)).toBe(true);

    updateWasher(w, cfg.potWashTime - 0.1);
    expect(takeWashedPot(w)).toBeNull();

    updateWasher(w, 0.2);
    expect(isWashing(w)).toBe(false);
    const out = takeWashedPot(w);
    expect(out).toBe(pot);
    expect(out?.dirty).toBe(false);
    expect(out?.contents).toEqual([]); // 洗うと中身も加熱状態もリセットされる
    expect(out?.heat).toBe('cold');
    expect(w.pot).toBeNull();
  });
});

describe('sauceFill（ソースの量）', () => {
  it('ミートソースはお玉1杯で半分、2杯で満杯', () => {
    expect(sauceFill([])).toBe(0);
    expect(sauceFill(['meatSauce'])).toBe(0.5);
    expect(sauceFill(['meatSauce', 'meatSauce'])).toBe(1);
  });
  it('満杯を超えない', () => {
    expect(sauceFill(['meatSauce', 'meatSauce', 'meatSauce'])).toBe(1);
  });
  it('ソース以外（パンチェッタ・麺）は量に数えず、入れた順序にも依存しない', () => {
    expect(sauceFill(['pancetta', 'tomatoSauce'])).toBe(0.5);
    expect(sauceFill(['tomatoSauce', 'pancetta'])).toBe(0.5);
    expect(sauceFill(['meatSauce', 'noodle'])).toBe(0.5);
  });
});
