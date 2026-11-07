// Firebase（Firestore）への接続。ランキングと開発ボードが共有する。
// 設定値（.env.local / GitHub Actions の変数）が空なら null を返し、使う側は「準備中」にする。
// SDK は、使うときまで読み込まない（設定がなければ、まったく読み込まない）。

export type FirebaseConfig = { apiKey: string; projectId: string; appId: string };

export function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  return apiKey && projectId && appId ? { apiKey, projectId, appId } : null;
}

export type FirestoreHandle = { fs: typeof import('firebase/firestore'); db: import('firebase/firestore').Firestore };

// 同じ設定での initializeApp は、同じアプリを返す（何度呼んでもよい）
export function loadFirestore(config: FirebaseConfig): Promise<FirestoreHandle> {
  return (async () => {
    const [{ initializeApp }, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore')]);
    return { fs, db: fs.getFirestore(initializeApp(config)) };
  })();
}

// Firestore は、サーバーに届かないとエラーにならず待ち続ける。一定時間で見切って、原因が分かる形で失敗させる
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
