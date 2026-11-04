import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { getMenu } from './recipe';
import { serveScore } from './score';

describe('serveScore', () => {
  const tarako = getMenu('tarako');

  it('即提供なら基礎点＋最大ボーナス', () => {
    expect(serveScore(tarako, 0, 0, cfg).total).toBe(30 + cfg.speedBonusMax);
  });
  it('待たせるほどボーナスが減り、窓を超えるとゼロ', () => {
    expect(serveScore(tarako, cfg.speedBonusWindow / 2, 0, cfg).speedBonus).toBe(cfg.speedBonusMax / 2);
    expect(serveScore(tarako, 999, 0, cfg).speedBonus).toBe(0);
  });
  it('コンボで倍率が上がり、上限で止まる', () => {
    expect(serveScore(tarako, 999, 3, cfg).multiplier).toBeCloseTo(1.3);
    expect(serveScore(tarako, 999, 50, cfg).multiplier).toBe(cfg.comboMax);
  });
});
