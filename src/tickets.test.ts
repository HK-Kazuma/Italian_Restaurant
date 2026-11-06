import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { MENU } from './recipe';
import { nextTicketInterval, pickMenu } from './tickets';

describe('nextTicketInterval', () => {
  const noJitter = { ...cfg, ticketIntervalJitter: 0 };

  it('開始時は長く、終了時は短い', () => {
    expect(nextTicketInterval(0, noJitter, () => 0.5)).toBe(cfg.ticketIntervalStart);
    expect(nextTicketInterval(1, noJitter, () => 0.5)).toBe(cfg.ticketIntervalEnd);
  });
  it('ばらつきは ±jitter の範囲', () => {
    const lo = nextTicketInterval(0, cfg, () => 0);
    const hi = nextTicketInterval(0, cfg, () => 1);
    expect(lo).toBeCloseTo(cfg.ticketIntervalStart * (1 - cfg.ticketIntervalJitter));
    expect(hi).toBeCloseTo(cfg.ticketIntervalStart * (1 + cfg.ticketIntervalJitter));
  });
});

describe('pickMenu', () => {
  it('enabled なメニューからだけ選ぶ', () => {
    for (const r of [0, 0.5, 0.999]) expect(pickMenu(MENU, () => r).enabled).toBe(true);
  });
  it('重みが 0 の品は出ない', () => {
    for (let i = 0; i < 100; i++) {
      expect(pickMenu(MENU, () => i / 100, { tarako: 0 }).id).not.toBe('tarako');
    }
  });
  it('重みの比率で選ばれる（2 : 1）', () => {
    const only = MENU.filter((m) => m.id === 'tarako' || m.id === 'meat');
    const weights = { tarako: 2, meat: 1 };
    expect(pickMenu(only, () => 0, weights).id).toBe('tarako');
    expect(pickMenu(only, () => 0.66, weights).id).toBe('tarako');
    expect(pickMenu(only, () => 0.67, weights).id).toBe('meat');
    expect(pickMenu(only, () => 0.999, weights).id).toBe('meat');
  });
  it('全部の重みが 0 なら選べない', () => {
    const w = Object.fromEntries(MENU.map((m) => [m.id, 0]));
    expect(() => pickMenu(MENU, () => 0, w)).toThrow();
  });
});
