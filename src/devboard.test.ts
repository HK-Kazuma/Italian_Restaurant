import { describe, expect, it } from 'vitest';
import { CODE_MAX, NOTE_MAX, TITLE_MAX, cleanCode, cleanText, describeDevError, devBoard, isDevStatus, isFeedbackKind } from './devboard';

describe('devboard: 文字列の整え方', () => {
  it('前後の空白と制御文字を取る。1行の文字列は改行も取る', () => {
    expect(cleanText('  寿司を追加  ', TITLE_MAX)).toBe('寿司を追加');
    expect(cleanText('a\nb\tc', TITLE_MAX)).toBe('abc');
  });

  it('複数行なら改行は残し、CRLF は LF にそろえる', () => {
    expect(cleanText('1行目\r\n2行目\t', NOTE_MAX, true)).toBe('1行目\n2行目');
  });

  it('長すぎれば切る（絵文字などの2文字分も1文字と数える）', () => {
    expect(cleanText('あ'.repeat(100), TITLE_MAX)).toBe('あ'.repeat(TITLE_MAX));
    expect([...cleanText('🍝'.repeat(100), TITLE_MAX)]).toHaveLength(TITLE_MAX);
  });

  it('開発者コードは前後の空白を取り、上限で切る', () => {
    expect(cleanCode('  abc  ')).toBe('abc');
    expect(cleanCode('x'.repeat(200))).toHaveLength(CODE_MAX);
  });

  it('種類の判定', () => {
    expect(isDevStatus('doing')).toBe(true);
    expect(isDevStatus('planned')).toBe(true);
    expect(isDevStatus('done')).toBe(false);
    expect(isFeedbackKind('feature')).toBe(true);
    expect(isFeedbackKind('improve')).toBe(true);
    expect(isFeedbackKind('bug')).toBe(false);
  });
});

describe('devboard: エラーの言葉', () => {
  it('開発者の操作で拒否されたら、コードの間違いを疑う', () => {
    expect(describeDevError({ code: 'permission-denied' }, true)).toContain('開発者コード');
    expect(describeDevError({ code: 'permission-denied' }, false)).not.toContain('開発者コード');
  });
});

describe('devboard: 保存先につながっていないとき', () => {
  // .env.local に Firebase の設定があると、つながる側になる。つながらない前提のテストは、そのときは飛ばす
  it.skipIf(devBoard.enabled)('準備中になり、一覧は空、書き込みはエラーになる', async () => {
    expect(await devBoard.list()).toEqual([]);
    await expect(devBoard.add('code', 'doing', 'タイトル', '')).rejects.toThrow();
    await expect(devBoard.sendFeedback('feature', '内容', '')).rejects.toThrow();
  });

  it('コードが空、タイトルが空、内容が空なら、送らずに断る', async () => {
    if (!devBoard.enabled) return; // つながっていなければ、上のテストが「準備中」で断ることを見ている
    await expect(devBoard.add('', 'doing', 'タイトル', '')).rejects.toThrow('コード');
    await expect(devBoard.add('code', 'doing', '   ', '')).rejects.toThrow('タイトル');
    await expect(devBoard.sendFeedback('feature', '  ', '')).rejects.toThrow('内容');
  });
});
