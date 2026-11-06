import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { canStackPack, createPack, findWarmPack, soakPack, stackLimit, stockItem, warmTime } from './pack';

describe('pack', () => {
  it('カルボナーラのパックだけ温めが必要', () => {
    expect(warmTime('carbonaraSauce', cfg)).toBe(cfg.carbonaraWarmTime);
    expect(warmTime('tomatoSauce', cfg)).toBeNull();
  });

  it('取り出し元：温め不要の物は具材、必要な物はパックを手に持つ', () => {
    expect(stockItem('tomatoSauce', cfg)).toEqual({ kind: 'ingredient', id: 'tomatoSauce' });
    expect(stockItem('carbonaraSauce', cfg)).toEqual({
      kind: 'pack',
      packs: [{ id: 'carbonaraSauce', soak: 0, warm: false }],
    });
  });

  it('熱湯に規定秒数浸けると温まる（累計）', () => {
    const pack = createPack('carbonaraSauce');
    soakPack(pack, cfg.carbonaraWarmTime - 1, cfg);
    expect(pack.warm).toBe(false);
    soakPack(pack, 0.5, cfg); // 途中で取り出して戻しても累計で数える
    expect(pack.warm).toBe(false);
    soakPack(pack, 0.5, cfg);
    expect(pack.warm).toBe(true);
  });
});

describe('stockItem: サラダベース', () => {
  it('お皿にサラダが入ったもの（皿の中身が saladBase）を手に持つ', () => {
    expect(stockItem('saladBase', cfg)).toEqual({ kind: 'plate', contents: ['saladBase'] });
  });
});

describe('コーンスープのパック', () => {
  it('温め時間は5秒。カルボナーラは3秒', () => {
    expect(warmTime('cornSoup', cfg)).toBe(cfg.cornSoupWarmTime);
    const pack = createPack('cornSoup');
    soakPack(pack, cfg.cornSoupWarmTime - 0.1, cfg);
    expect(pack.warm).toBe(false);
    soakPack(pack, 0.2, cfg);
    expect(pack.warm).toBe(true);
  });

  it('コーンスープは最大5つ、カルボナーラは最大3つまで手に持てる。ほかのパックは1つ', () => {
    expect(stackLimit('cornSoup', cfg)).toBe(5);
    expect(stackLimit('carbonaraSauce', cfg)).toBe(3);
    expect(stackLimit('tomatoSauce', cfg)).toBe(1);

    const hand = stockItem('cornSoup', cfg);
    expect(hand.kind).toBe('pack');
    if (hand.kind !== 'pack') return;
    for (let i = hand.packs.length; i < 5; i++) {
      expect(canStackPack(hand, 'cornSoup', cfg)).toBe(true);
      hand.packs.push(createPack('cornSoup'));
    }
    expect(hand.packs).toHaveLength(5);
    expect(canStackPack(hand, 'cornSoup', cfg)).toBe(false); // 6つ目は持てない

    const carbonara = stockItem('carbonaraSauce', cfg);
    if (carbonara.kind !== 'pack') throw new Error('カルボナーラはパック');
    for (let i = carbonara.packs.length; i < 3; i++) {
      expect(canStackPack(carbonara, 'carbonaraSauce', cfg)).toBe(true);
      carbonara.packs.push(createPack('carbonaraSauce'));
    }
    expect(carbonara.packs).toHaveLength(3);
    expect(canStackPack(carbonara, 'carbonaraSauce', cfg)).toBe(false); // 4つ目は持てない
    expect(canStackPack(carbonara, 'cornSoup', cfg)).toBe(false); // 違う種類は重ねられない
  });

  it('温まったパックを探せる', () => {
    const a = createPack('cornSoup');
    const b = createPack('cornSoup');
    b.warm = true;
    expect(findWarmPack([a, b])).toBe(1);
    expect(findWarmPack([a], 'cornSoup')).toBe(-1);
  });
});

describe('stockItem: ペンネ', () => {
  it('冷蔵庫のペンネは、生麺（ペンネ）として手に持つ', () => {
    expect(stockItem('penne', cfg)).toEqual({ kind: 'rawNoodle', id: 'penne' });
  });
});
