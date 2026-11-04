import type { GameConfig } from './config';
import type { MenuItem } from './recipe';

export type ServeScore = {
  base: number;
  speedBonus: number;
  multiplier: number;
  total: number;
};

type ScoreConfig = Pick<GameConfig, 'speedBonusMax' | 'speedBonusWindow' | 'comboStep' | 'comboMax'>;

// waited: 伝票が届いてから提供までの秒数、combo: この提供の直前までの連続成功数
export function serveScore(menu: MenuItem, waited: number, combo: number, cfg: ScoreConfig): ServeScore {
  const speedRatio = Math.min(1, Math.max(0, 1 - waited / cfg.speedBonusWindow));
  const speedBonus = Math.round(cfg.speedBonusMax * speedRatio);
  const multiplier = Math.min(cfg.comboMax, 1 + cfg.comboStep * combo);
  const base = menu.basePoints;
  return { base, speedBonus, multiplier, total: Math.round((base + speedBonus) * multiplier) };
}
