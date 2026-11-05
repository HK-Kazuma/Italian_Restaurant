import { describe, expect, it } from 'vitest';
import { dishName, groupNames, plateLabel, potLabel } from './labels';
import { createPot } from './pot';
import type { IngredientId, Pot } from './types';

function pot(contents: IngredientId[], heat: Pot['heat'] = 'cold', extra: Partial<Pot> = {}): Pot {
  return { ...createPot(), contents, heat, ...extra };
}

describe('groupNames', () => {
  it('同じ物はまとめる', () => {
    expect(groupNames(['meatSauce', 'meatSauce'])).toBe('ミートソース×2');
    expect(groupNames(['noodle', 'meatSauce', 'cheese'])).toBe('麺、ミートソース、粉チーズ');
  });
});

describe('鍋の名前', () => {
  it('空の鍋には何も出さない', () => {
    expect(potLabel(pot([]), true)).toBeNull();
  });

  it('材料を入れている間は、視点を合わせたときだけ中身の名前', () => {
    const p = pot(['meatSauce']);
    expect(potLabel(p, false)).toBeNull();
    expect(potLabel(p, true)?.text).toBe('ミートソース');
  });

  it('作れない組み合わせは、視点を合わせると赤で出る', () => {
    const p = pot(['meatSauce', 'nori']);
    expect(potLabel(p, true)?.text).toBe('ミートソース、刻みのり');
    expect(potLabel(p, true)?.color).toBe('#ff8a80');
  });

  it('加熱中は「加熱中」だけ（視点を合わせても中身の名前は出ない）', () => {
    const p = pot(['meatSauce', 'meatSauce'], 'heating', { heatTimer: 12.2 });
    expect(potLabel(p, false)?.text).toBe('加熱中 13');
    expect(potLabel(p, true)?.text).toBe('加熱中 13');
  });

  it('完成したら、視点に関係なくソースの名前', () => {
    const p = pot(['meatSauce', 'meatSauce'], 'ready');
    expect(potLabel(p, false)?.text).toBe('ミートパスタのソース 完成！');
    expect(potLabel(p, true)?.text).toBe('ミートパスタのソース 完成！');
  });

  it('麺を入れたあとも、ソースの名前を出す（混ぜる進み具合つき）', () => {
    const p = pot(['meatSauce', 'meatSauce', 'noodle'], 'ready', { mixCount: 1 });
    expect(potLabel(p, false)?.text).toBe('ミートパスタのソース 混ぜる 1/3');
    p.mixCount = 3;
    expect(potLabel(p, false)?.text).toBe('ミートパスタのソース 混ざった！');
  });
});

describe('皿の名前', () => {
  it('空の皿には何も出さない', () => {
    expect(plateLabel([], true)).toBeNull();
  });

  it('盛り付け中は、視点を合わせたときだけ中身の名前', () => {
    const contents: IngredientId[] = ['noodle', 'meatSauce', 'meatSauce'];
    expect(plateLabel(contents, false)).toBeNull();
    expect(plateLabel(contents, true)?.text).toBe('麺、ミートソース×2');
  });

  it('料理が出来上がったら、視点に関係なく料理名だけ', () => {
    const done: IngredientId[] = ['noodle', 'meatSauce', 'meatSauce', 'cheese', 'parsley'];
    expect(dishName(done)).toBe('ミートパスタ');
    expect(plateLabel(done, false)?.text).toBe('ミートパスタ');
    expect(plateLabel(done, true)?.text).toBe('ミートパスタ'); // 視点を合わせても、材料の名前は出ない
  });

  it('入れる順序が違っても、同じ料理名になる', () => {
    expect(dishName(['nori', 'tarakoSauce', 'noodle'])).toBe('たらこのパスタ');
  });

  it('コーンスープは、スープ皿に入れた時点で料理名が出る', () => {
    expect(plateLabel(['cornSoup'], false)?.text).toBe('コーンスープ');
  });

  it('材料が1つ足りない・多い皿は、料理名にならない', () => {
    expect(dishName(['noodle', 'tarakoSauce'])).toBeNull();
    expect(dishName(['noodle', 'tarakoSauce', 'nori', 'cheese'])).toBeNull();
  });
});
