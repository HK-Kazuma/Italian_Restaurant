import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { loadTutorialCleared, saveTutorialCleared, showMission } from './mission';

function memoryStore(initial?: string) {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
}

describe('ミッションを出す条件', () => {
  const base = { mode: 'practice', phase: 'playing', tutorial: null } as const;

  it('練習キッチンで、まだチュートリアルを受けていなければ出る', () => {
    expect(showMission(base, false)).toBe(true);
    expect(showMission({ ...base, phase: 'paused' }, false)).toBe(true); // 一時停止中も出ている
  });

  it('チュートリアルを受けたあとは出ない', () => {
    expect(showMission(base, true)).toBe(false);
  });

  it('チュートリアルの最中は出ない（工程の一覧が同じ場所に出る）', () => {
    expect(showMission({ ...base, tutorial: { menuId: 'tarako', step: 0, total: 5 } }, false)).toBe(false);
  });

  it('ゲーム（本番）やタイトル・結果の画面では出ない', () => {
    expect(showMission({ ...base, mode: 'game' }, false)).toBe(false);
    expect(showMission({ ...base, phase: 'title' }, false)).toBe(false);
    expect(showMission({ ...base, phase: 'result' }, false)).toBe(false);
  });
});

describe('ミッション達成の保存', () => {
  it('保存していなければ未達成。保存すると、次に開いたときも達成のまま', () => {
    const store = memoryStore();
    expect(loadTutorialCleared(store)).toBe(false);
    saveTutorialCleared(store);
    expect(loadTutorialCleared(store)).toBe(true);
  });

  it('保存先が使えなくても、落ちない（未達成の扱い）', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadTutorialCleared(broken)).toBe(false);
    expect(() => saveTutorialCleared(broken)).not.toThrow();
    expect(loadTutorialCleared(null)).toBe(false);
  });
});

describe('Game: チュートリアルをやり遂げたときの通知', () => {
  it('途中でやめたときは通知しない', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    const done: string[] = [];
    g.onTutorialComplete = (id) => done.push(id);
    g.startTutorial('tarako');
    g.stopTutorial();
    expect(done).toEqual([]);
  });
});
