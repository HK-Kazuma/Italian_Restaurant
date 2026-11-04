import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { createPack, soakPack, stockItem, warmTime } from './pack';

describe('pack', () => {
  it('カルボナーラのパックだけ温めが必要', () => {
    expect(warmTime('carbonaraSauce', cfg)).toBe(cfg.carbonaraWarmTime);
    expect(warmTime('tomatoSauce', cfg)).toBeNull();
  });

  it('取り出し元：温め不要の物は具材、必要な物はパックを手に持つ', () => {
    expect(stockItem('tomatoSauce', cfg)).toEqual({ kind: 'ingredient', id: 'tomatoSauce' });
    expect(stockItem('carbonaraSauce', cfg)).toEqual({
      kind: 'pack',
      pack: { id: 'carbonaraSauce', soak: 0, warm: false },
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
