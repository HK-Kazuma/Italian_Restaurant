import { loadFirestore, readFirebaseConfig, withTimeout, type FirebaseConfig } from './firebase';
import { cleanName } from './ranking';

// 開発ボード：今後の開発予定を公開し、プレイヤーからの要望・改善案を受け取る。保存先（いまは Firebase Firestore）はこのファイルの中だけに置く。
//
// Firestore の構成：
//   devBoard/{id}   { title, note, status, createdAt }  … 誰でも読める。書けるのは開発者コードを知っている人だけ
//   devAuth/{id}    { code }                            … 書き込み専用（誰も読めない）。開発者コードを、devBoard の書き込みと同じ「バッチ」で送るための置き場
//   feedback/{id}   { kind, text, name, createdAt }     … 誰でも追加できるが、読めるのは Firebase コンソールだけ（開発者用）
// 開発者コードは devBoard のドキュメントには保存されない（誰でも読めるため）。firestore.rules が、同じバッチの devAuth の中身を見て許可する。

export const TITLE_MAX = 40;
export const NOTE_MAX = 200;
export const FEEDBACK_MAX = 500;
export const CODE_MAX = 64;
const WRITE_TIMEOUT_MS = 10000;
const READ_LIMIT = 100;

export type DevStatus = 'doing' | 'planned';
export const DEV_STATUSES: readonly { id: DevStatus; label: string }[] = [
  { id: 'doing', label: '開発中' },
  { id: 'planned', label: 'これから' },
];

export type DevItem = { id: string; title: string; note: string; status: DevStatus };

export type FeedbackKind = 'feature' | 'improve';
export const FEEDBACK_KINDS: readonly { id: FeedbackKind; label: string }[] = [
  { id: 'feature', label: '実装してほしいこと' },
  { id: 'improve', label: '改善してほしいこと' },
];

export function isDevStatus(v: unknown): v is DevStatus {
  return v === 'doing' || v === 'planned';
}
export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return v === 'feature' || v === 'improve';
}

// 文字列を整える：制御文字を取り（multiline なら改行は残す）、前後の空白を取り、長すぎれば切る（絵文字などは1文字と数える）
export function cleanText(raw: string, max: number, multiline = false): string {
  const control = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  return [...raw.replace(/\r\n?/g, '\n').replace(control, '').trim()].slice(0, max).join('');
}

// 開発者コードの書式（中身が正しいかは、サーバー側のルールが決める）
export function cleanCode(raw: string): string {
  return raw.trim().slice(0, CODE_MAX);
}

// 書き込みが失敗した理由を、利用者に分かる言葉にする（コードが違うときの permission-denied が、いちばん多い）
export function describeDevError(e: unknown, needsCode: boolean): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'permission-denied':
      return needsCode ? '拒否されました。開発者コードが違うようです' : 'サーバーに拒否されました（firestore.rules が未反映の可能性）';
    case 'timeout':
    case 'unavailable':
      return 'サーバーにつながりませんでした。通信を確認して、もう一度試してください';
    default:
      return code ? `エラー: ${code}` : e instanceof Error ? e.message : '原因不明のエラー';
  }
}

export type DevBoardBackend = {
  list(): Promise<DevItem[]>;
  add(code: string, item: Omit<DevItem, 'id'>): Promise<void>;
  setStatus(code: string, id: string, status: DevStatus): Promise<void>;
  remove(code: string, id: string): Promise<void>;
  sendFeedback(entry: { kind: FeedbackKind; text: string; name: string }): Promise<void>;
};

function createFirebaseBackend(config: FirebaseConfig): DevBoardBackend {
  const db = loadFirestore(config);

  return {
    async list() {
      const { fs, db: d } = await db;
      const snap = await fs.getDocs(fs.query(fs.collection(d, 'devBoard'), fs.orderBy('createdAt', 'asc'), fs.limit(READ_LIMIT)));
      const items: DevItem[] = [];
      for (const doc of snap.docs) {
        const status = doc.get('status');
        if (!isDevStatus(status)) continue;
        items.push({ id: doc.id, title: String(doc.get('title') ?? ''), note: String(doc.get('note') ?? ''), status });
      }
      return items;
    },
    async add(code, item) {
      const { fs, db: d } = await db;
      const ref = fs.doc(fs.collection(d, 'devBoard'));
      const batch = fs.writeBatch(d);
      batch.set(fs.doc(d, 'devAuth', ref.id), { code });
      batch.set(ref, { title: item.title, note: item.note, status: item.status, createdAt: fs.serverTimestamp() });
      await batch.commit();
    },
    async setStatus(code, id, status) {
      const { fs, db: d } = await db;
      const batch = fs.writeBatch(d);
      batch.set(fs.doc(d, 'devAuth', id), { code });
      batch.update(fs.doc(d, 'devBoard', id), { status });
      await batch.commit();
    },
    async remove(code, id) {
      const { fs, db: d } = await db;
      const batch = fs.writeBatch(d);
      batch.set(fs.doc(d, 'devAuth', id), { code });
      batch.delete(fs.doc(d, 'devBoard', id));
      await batch.commit();
    },
    async sendFeedback(entry) {
      const { fs, db: d } = await db;
      await fs.addDoc(fs.collection(d, 'feedback'), {
        kind: entry.kind,
        text: entry.text,
        name: entry.name,
        createdAt: fs.serverTimestamp(),
      });
    },
  };
}

const config = readFirebaseConfig();
const backend: DevBoardBackend | null = config ? createFirebaseBackend(config) : null;

export const devBoard = {
  // 保存先につながる設定が入っているか（なければ、開発ボードは「準備中」）
  enabled: backend !== null,

  async list(): Promise<DevItem[]> {
    if (!backend) return [];
    return backend.list();
  },

  // 以下の開発者向けの操作は、コードが空・内容が空なら送らずにエラーにする（コードの正誤は、サーバーのルールが決める）
  async add(rawCode: string, status: DevStatus, rawTitle: string, rawNote: string): Promise<void> {
    if (!backend) throw new Error('開発ボードは準備中です');
    const code = requireCode(rawCode);
    const title = cleanText(rawTitle, TITLE_MAX);
    if (!title) throw new Error('タイトルを入力してください');
    if (!isDevStatus(status)) throw new Error('種類が正しくありません');
    await withTimeout(backend.add(code, { title, note: cleanText(rawNote, NOTE_MAX, true), status }), WRITE_TIMEOUT_MS);
  },

  async setStatus(rawCode: string, id: string, status: DevStatus): Promise<void> {
    if (!backend) throw new Error('開発ボードは準備中です');
    await withTimeout(backend.setStatus(requireCode(rawCode), id, status), WRITE_TIMEOUT_MS);
  },

  async remove(rawCode: string, id: string): Promise<void> {
    if (!backend) throw new Error('開発ボードは準備中です');
    await withTimeout(backend.remove(requireCode(rawCode), id), WRITE_TIMEOUT_MS);
  },

  // 要望・改善案を開発者に送る（誰でも）。名前は任意で、空ならゲスト
  async sendFeedback(kind: FeedbackKind, rawText: string, rawName: string): Promise<void> {
    if (!backend) throw new Error('開発ボードは準備中です');
    if (!isFeedbackKind(kind)) throw new Error('種類が正しくありません');
    const text = cleanText(rawText, FEEDBACK_MAX, true);
    if (!text) throw new Error('内容を入力してください');
    await withTimeout(backend.sendFeedback({ kind, text, name: cleanName(rawName) }), WRITE_TIMEOUT_MS);
  },
};

function requireCode(raw: string): string {
  const code = cleanCode(raw);
  if (!code) throw new Error('開発者コードを入力してください');
  return code;
}
