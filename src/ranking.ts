import type { Difficulty } from './difficulty';

// みんなで共有するランキング。保存先（いまは Firebase Firestore）はこのファイルの中だけに置く。
// ゲーム側は「登録する」「上位を取る」だけを呼ぶので、保存先を替えるとき（Supabase など）は、RankingBackend の中身を入れ替えるだけでよい。
// 設定値（.env.local / GitHub Actions の変数）が空なら、ランキングは「準備中」になり、ゲームはふつうに遊べる。

export const NAME_MAX = 12; // 名前の最大文字数
export const SCORE_MAX = 100000; // 登録できるスコアの上限（firestore.rules も同じ値にする）
export const TOP_LIMIT = 10; // 一覧に出す件数
const SUBMIT_TIMEOUT_MS = 10000; // 登録がこの時間で終わらなければ失敗とみなす

// 登録に失敗した理由を、利用者（と開発者）に分かる言葉にする
export function describeSubmitError(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'timeout':
    case 'unavailable':
      return 'サーバーにつながりませんでした（Firestore が未作成、または通信がブロックされている可能性）';
    case 'permission-denied':
      return 'サーバーに拒否されました（firestore.rules が未反映、または内容が合っていない可能性）';
    case 'not-found':
      return '保存先が見つかりません（Firestore データベースが未作成の可能性）';
    default:
      return code ? `エラー: ${code}` : e instanceof Error ? e.message : '原因不明のエラー';
  }
}

export type RankingEntry = { name: string; score: number };

export type RankingBackend = {
  submit(difficulty: Difficulty, entry: RankingEntry): Promise<void>;
  top(difficulty: Difficulty, limit: number): Promise<RankingEntry[]>;
};

// 名前を整える：前後の空白と制御文字を取り、長すぎれば切る。空ならゲスト
export function cleanName(raw: string): string {
  const name = [...raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, NAME_MAX).join('');
  return name || 'ゲスト';
}

export function validScore(score: number): boolean {
  return Number.isInteger(score) && score > 0 && score <= SCORE_MAX;
}

type FirebaseConfig = { apiKey: string; projectId: string; appId: string };

function readConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  return apiKey && projectId && appId ? { apiKey, projectId, appId } : null;
}

// Firestore：rankings/{難易度}/scores/{自動ID} に { name, score, createdAt } を1件ずつ足す。
// SDK は、使うときまで読み込まない（設定がなければ、まったく読み込まない）
function createFirebaseBackend(config: FirebaseConfig): RankingBackend {
  const db = (async () => {
    const [{ initializeApp }, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore')]);
    return { fs, db: fs.getFirestore(initializeApp(config)) };
  })();

  return {
    async submit(difficulty, entry) {
      const { fs, db: d } = await db;
      await fs.addDoc(fs.collection(d, 'rankings', difficulty, 'scores'), {
        name: entry.name,
        score: entry.score,
        createdAt: fs.serverTimestamp(),
      });
    },
    async top(difficulty, limit) {
      const { fs, db: d } = await db;
      const snap = await fs.getDocs(
        fs.query(fs.collection(d, 'rankings', difficulty, 'scores'), fs.orderBy('score', 'desc'), fs.limit(limit)),
      );
      return snap.docs.map((doc) => ({ name: String(doc.get('name') ?? ''), score: Number(doc.get('score') ?? 0) }));
    },
  };
}

const config = readConfig();
const backend: RankingBackend | null = config ? createFirebaseBackend(config) : null;

export const ranking = {
  // 保存先につながる設定が入っているか（なければ、ランキングは「準備中」）
  enabled: backend !== null,

  async submit(difficulty: Difficulty, rawName: string, score: number): Promise<void> {
    if (!backend) throw new Error('ランキングは準備中です');
    if (!validScore(score)) throw new Error('このスコアは登録できません');
    // Firestore は、サーバーに届かないとエラーにならず待ち続ける。一定時間で見切って、原因が分かる形で失敗させる
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), SUBMIT_TIMEOUT_MS);
    });
    try {
      await Promise.race([backend.submit(difficulty, { name: cleanName(rawName), score }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  },

  async top(difficulty: Difficulty): Promise<RankingEntry[]> {
    if (!backend) return [];
    return backend.top(difficulty, TOP_LIMIT);
  },
};
