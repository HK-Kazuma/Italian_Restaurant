import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Player } from './player';
import { DEFAULT_SETTINGS, SETTING_SPECS, clampSetting, loadSettings, lookScale, saveSettings } from './settings';
import type { World } from './world';

const world: World = { bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, obstacles: [] };

function memoryStore(initial?: string) {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
}

describe('設定の値', () => {
  it('標準は等倍', () => {
    expect(lookScale(DEFAULT_SETTINGS)).toBe(1);
  });
  it('範囲の外は端に収まり、刻み幅に丸められる', () => {
    expect(clampSetting('mouseSensitivity', 99)).toBe(3);
    expect(clampSetting('mouseSensitivity', -1)).toBe(0.2);
    expect(clampSetting('cursorSpeed', 1.52)).toBe(1.5);
    expect(clampSetting('cursorSpeed', NaN)).toBe(1);
  });
  it('どの項目も、標準の値がバーの範囲の中にある', () => {
    for (const s of SETTING_SPECS) {
      expect(DEFAULT_SETTINGS[s.key]).toBeGreaterThanOrEqual(s.min);
      expect(DEFAULT_SETTINGS[s.key]).toBeLessThanOrEqual(s.max);
    }
  });
  it('感度とカーソル速度の両方が、視点の回る量にかかる', () => {
    expect(lookScale({ mouseSensitivity: 2, cursorSpeed: 1.5 })).toBe(3);
  });
});

describe('設定の保存', () => {
  it('保存した値を読み戻せる', () => {
    const store = memoryStore();
    saveSettings({ mouseSensitivity: 1.5, cursorSpeed: 0.5 }, store);
    expect(loadSettings(store)).toEqual({ mouseSensitivity: 1.5, cursorSpeed: 0.5 });
  });
  it('保存がない・壊れている・範囲外のときは、標準か端の値になる', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStore('{broken'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStore('{"mouseSensitivity":50,"cursorSpeed":"fast"}'))).toEqual({ mouseSensitivity: 3, cursorSpeed: 1 });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Player: 視点の倍率', () => {
  it('倍率に比例して視点が回る', () => {
    const a = new Player(cfg, world);
    const b = new Player(cfg, world);
    b.lookScale = 2;
    a.look(10, 0);
    b.look(10, 0);
    expect(b.yaw).toBeCloseTo(a.yaw * 2);
  });
});
