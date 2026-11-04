import { describe, expect, it } from 'vitest';
import { createBoiler, pressButton, setNoodle, startShortBoil, takeNoodle, updateBoiler } from './boiler';
import { DEFAULT_CONFIG as cfg } from './config';

describe('boiler', () => {
  it('セット→ボタン→茹で時間で上がる→猶予を過ぎると伸びる', () => {
    const b = createBoiler();
    expect(pressButton(b, cfg)).toBe(false); // 麺なしでは押せない
    expect(setNoodle(b)).toBe(true);
    expect(pressButton(b, cfg)).toBe(true);
    expect(b.state).toBe('boiling');

    updateBoiler(b, cfg.boilTime - 1, cfg);
    expect(b.state).toBe('boiling');
    updateBoiler(b, 1, cfg);
    expect(b.state).toBe('lifted');
    expect(b.timer).toBeCloseTo(cfg.graceTime);

    updateBoiler(b, 29, cfg);
    expect(b.state).toBe('lifted');
    updateBoiler(b, 1, cfg);
    expect(b.state).toBe('overdue');
  });

  it('上がっている間だけ麺を取れる', () => {
    const b = createBoiler();
    setNoodle(b);
    pressButton(b, cfg);
    expect(takeNoodle(b)).toBe(false);
    updateBoiler(b, cfg.boilTime, cfg);
    expect(takeNoodle(b)).toBe(true);
    expect(b.state).toBe('empty');
  });

  it('のびかけ→ショート茹で3秒で復活し、また30秒の猶予', () => {
    const b = createBoiler();
    setNoodle(b);
    pressButton(b, cfg);
    updateBoiler(b, cfg.boilTime, cfg);
    updateBoiler(b, cfg.graceTime + 1, cfg);
    expect(b.state).toBe('overdue');
    expect(takeNoodle(b)).toBe(false);

    expect(startShortBoil(b, cfg)).toBe(true);
    updateBoiler(b, 3, cfg);
    expect(b.state).toBe('lifted');
    expect(b.timer).toBeCloseTo(cfg.graceTime);
  });

  it('のびかけ以外ではショート茹でできない', () => {
    const b = createBoiler();
    expect(startShortBoil(b, cfg)).toBe(false);
  });
});
