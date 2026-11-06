// プレイヤーが iPad の「設定」アプリで変えられる値。ゲームの設定値（config.ts）にかける倍率で持つ（1 = 標準）。
export type Settings = {
  mouseSensitivity: number; // マウス感度：視点の振り向きやすさ（倍率）
  cursorSpeed: number; // カーソル速度：照準（画面中央のカーソル）の動く速さ（倍率）
};

export type SettingKey = keyof Settings;

export type SettingSpec = {
  key: SettingKey;
  label: string;
  note: string;
  min: number;
  max: number;
  step: number;
};

export const SETTING_SPECS: readonly SettingSpec[] = [
  { key: 'mouseSensitivity', label: 'マウス感度', note: '大きいほど、少しマウスを動かしただけで視点が大きく回る', min: 0.2, max: 3, step: 0.05 },
  { key: 'cursorSpeed', label: 'カーソル速度', note: '大きいほど、照準が素早く動く', min: 0.2, max: 3, step: 0.05 },
];

export const DEFAULT_SETTINGS: Settings = { mouseSensitivity: 1, cursorSpeed: 1 };

const STORAGE_KEY = 'kitchen-time-attack:settings';

function specOf(key: SettingKey): SettingSpec {
  return SETTING_SPECS.find((s) => s.key === key)!;
}

// 範囲に収めて、刻み幅に丸める（バーの表示とゲームの値をずらさない）
export function clampSetting(key: SettingKey, value: number): number {
  const { min, max, step } = specOf(key);
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 1000) / 1000;
}

// 視点の回転にかける倍率：感度 × カーソル速度
export function lookScale(s: Settings): number {
  return s.mouseSensitivity * s.cursorSpeed;
}

export function formatSetting(value: number): string {
  return `×${value.toFixed(2)}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: Store | null = defaultStore()): Settings {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Record<SettingKey, unknown>>;
    for (const { key } of SETTING_SPECS) {
      if (typeof parsed[key] === 'number') out[key] = clampSetting(key, parsed[key]);
    }
  } catch {
    // 読めなければ標準の値
  }
  return out;
}

export function saveSettings(s: Settings, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても遊べる
  }
}
