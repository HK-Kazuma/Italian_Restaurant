import type { GameState } from './types';

// 練習キッチンの左上に出す「チュートリアルを受けよう」のミッション。
// どれか1つのチュートリアルを最後までやり遂げたら達成で、そのブラウザでは、もう出さない。

const STORAGE_KEY = 'kitchen-time-attack:tutorial-cleared';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadTutorialCleared(store: Store | null = defaultStore()): boolean {
  try {
    return store?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // 読めなければ、まだ受けていない扱い
  }
}

export function saveTutorialCleared(store: Store | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, '1');
  } catch {
    // 保存できなくても遊べる（次に開いたとき、また出る）
  }
}

// ミッションを出すか：練習キッチンで、チュートリアルの最中ではなく、まだ達成していないとき
export function showMission(state: Pick<GameState, 'mode' | 'phase' | 'tutorial'>, cleared: boolean): boolean {
  if (cleared || state.tutorial !== null) return false;
  return state.mode === 'practice' && (state.phase === 'playing' || state.phase === 'paused');
}
