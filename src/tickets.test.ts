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
});
