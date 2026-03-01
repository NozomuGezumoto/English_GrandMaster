import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, Functions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, Storage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "firebase/storage";
import Constants from "expo-constants";

// エミュレータポート（firebase.json と一致させること。変更時は docs/PORTS.md 参照）
// Functions: 5001（Web は CORS プロキシ 5052 経由） / Firestore: 8080 / Auth: 9099

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebase?.apiKey,
  authDomain: Constants.expoConfig?.extra?.firebase?.authDomain,
  projectId: Constants.expoConfig?.extra?.firebase?.projectId,
  storageBucket: Constants.expoConfig?.extra?.firebase?.storageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebase?.messagingSenderId,
  appId: Constants.expoConfig?.extra?.firebase?.appId,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Firebase設定がapp.jsonのextra.firebaseに正しく設定されていません');
}

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export const storage: Storage = getStorage(app);

// ローカルエミュレータを使用する場合（開発環境）
// 参照元: Constants.expoConfig?.extra?.useEmulator（app.config.js で EXPO_PUBLIC_USE_EMULATOR === 'true' のとき true）
const useEmulator = Constants.expoConfig?.extra?.useEmulator === true;

// デバッグ: useEmulator の判定ロジック（401 調査用。本番で useEmulator=true だとエミュレータURLを叩いて 401 になる）
console.log('[Firebase] useEmulator:', useEmulator, '| extra.useEmulator:', Constants.expoConfig?.extra?.useEmulator);

// エミュレータのホスト（Web・iOSシミュレータはlocalhostでOK。実機の場合はPCのIPが必要）
const getEmulatorHost = () => {
  // app.jsonで明示的に指定されている場合はそれを使用
  if (Constants.expoConfig?.extra?.emulatorHost) {
    const host = Constants.expoConfig.extra.emulatorHost;
    // 'localhost'が指定されている場合、実機ではExpoの開発サーバーhostUriからPCのIPを取得
    if (host === 'localhost') {
      if (typeof window !== 'undefined') {
        // Web: URLのホスト名がPCのIPならそれを使う（携帯のブラウザで http://PCのIP:8081 で開いた場合）
        const urlHost = window.location.hostname;
        if (urlHost !== 'localhost' && urlHost !== '127.0.0.1') {
          console.log(`[Firebase] Using URL hostname for emulator: ${urlHost}`);
          return urlHost;
        }
      } else {
        // React Native 実機: Expoの開発サーバー（hostUri）と同じマシンでエミュレータが動いている
        const hostUri = Constants.expoConfig?.hostUri;
        if (hostUri) {
          const hostPart = hostUri.split(':')[0];
          if (hostPart && hostPart !== 'localhost' && hostPart !== '127.0.0.1') {
            console.log(`[Firebase] Using Expo hostUri for emulator: ${hostPart}`);
            return hostPart;
          }
        }
      }
    }
    return host;
  }
  
  if (typeof window !== 'undefined') {
    const urlHost = window.location.hostname;
    if (urlHost !== 'localhost' && urlHost !== '127.0.0.1') {
      console.log(`[Firebase] Using URL hostname for emulator: ${urlHost}`);
      return urlHost;
    }
    return 'localhost';
  }
  
  // React Native（実機でemulatorHost未設定の場合）
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostPart = hostUri.split(':')[0];
    if (hostPart && hostPart !== 'localhost' && hostPart !== '127.0.0.1') return hostPart;
  }
  return 'localhost';
};

let functionsInstance: Functions;
if (useEmulator) {
  // ローカルエミュレータに接続
  functionsInstance = getFunctions(app);
  const emulatorHost = getEmulatorHost();
  
  console.log('[Firebase] Connecting to emulators...');
  console.log('[Firebase] Emulator host:', emulatorHost);
  
  try {
    // Functions Emulatorの接続（Web では CORS 回避のためプロキシ 5052 経由。要: npm run cors-proxy）
    try {
      const functionsPort = typeof window !== 'undefined' ? 5052 : 5001;
      connectFunctionsEmulator(functionsInstance, emulatorHost, functionsPort);
      console.log(`[Firebase] Connected to Functions emulator at ${emulatorHost}:${functionsPort}`);
    } catch (funcError: any) {
      if (funcError.message && funcError.message.includes('already')) {
        console.log('[Firebase] Functions emulator already connected');
      } else {
        console.warn('[Firebase] Functions emulator connection warning:', funcError);
      }
    }
    
    // Firestore Emulatorの接続
    try {
      connectFirestoreEmulator(db, emulatorHost, 8080);
      console.log(`[Firebase] Connected to Firestore emulator at ${emulatorHost}:8080`);
    } catch (firestoreError: any) {
      if (firestoreError.message && firestoreError.message.includes('already')) {
        console.log('[Firebase] Firestore emulator already connected');
      } else {
        console.warn('[Firebase] Firestore emulator connection warning:', firestoreError);
      }
    }
    
    // Auth Emulatorの接続
    try {
      connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
      console.log(`[Firebase] Connected to Auth emulator at ${emulatorHost}:9099`);
    } catch (authError: any) {
      if (authError.message && authError.message.includes('already')) {
        console.log('[Firebase] Auth emulator already connected');
      } else {
        console.warn('[Firebase] Auth emulator connection warning:', authError);
      }
    }
    // Storage Emulatorの接続（ポート 9199）
    try {
      connectStorageEmulator(storage, emulatorHost, 9199);
      console.log(`[Firebase] Connected to Storage emulator at ${emulatorHost}:9199`);
    } catch (storageError: any) {
      if (storageError?.message?.includes('already')) {
        console.log('[Firebase] Storage emulator already connected');
      } else {
        console.warn('[Firebase] Storage emulator connection warning:', storageError);
      }
    }
    
    console.log(`[Firebase] All emulators connected at ${emulatorHost}`);
  } catch (error) {
    // 既に接続済みの場合は無視
    console.error('[Firebase] Emulator connection error:', error);
  }
} else {
  // 本番環境（Cloud Functions）。リージョン明示で unauthenticated 回避
  functionsInstance = getFunctions(app, 'us-central1');
  console.log('[Firebase] Using production Cloud Functions (us-central1)');
}

export const functions: Functions = functionsInstance;
export { httpsCallable };

/**
 * Callable をトークン明示で呼ぶ（httpsCallable で unauthenticated になる場合の回避策）
 * 401 の場合、匿名ログイン直後のトークン伝播待ちのため1回リトライする
 */
async function doCallFunctionWithAuth<T>(
  name: string,
  data: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean; json: { result?: T; error?: { status?: string; message?: string } }; res: Response }> {
  const projectId = Constants.expoConfig?.extra?.firebase?.projectId;
  if (!projectId) throw new Error('Firebase projectId not configured');

  const region = 'us-central1';
  const url = useEmulator
    ? `http://${getEmulatorHost()}:${typeof window !== 'undefined' ? 5052 : 5001}/${projectId}/${region}/${name}`
    : `https://${region}-${projectId}.cloudfunctions.net/${name}`;

  // デバッグ: 401 調査用（叩いている URL、トークン有無）
  const hasToken = !!token && token.length > 10;
  console.log('[Firebase] callFunctionWithAuth:', {
    name,
    url,
    hasToken,
    tokenLength: token?.length ?? 0,
    useEmulator,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });

  // デバッグ: 401 時は body の詳細を確認
  const text = await res.text();
  let json: { result?: T; error?: { status?: string; message?: string; details?: unknown } };
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
    if (res.status === 401) console.log('[Firebase] 401 body (raw):', text?.substring(0, 300));
  }
  if (res.status === 401) {
    console.log('[Firebase] 401 details:', { url, status: res.status, error: json?.error, bodyPreview: text?.substring(0, 200) });
  }
  return { ok: res.ok && !json.error, json, res };
}

export async function callFunctionWithAuth<T = unknown>(
  name: string,
  data: Record<string, unknown>
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in');

  let token = await user.getIdToken(true);
  if (!token || token.length < 10) {
    console.error('[Firebase] callFunctionWithAuth: token empty or invalid', { tokenLength: token?.length });
    throw new Error('Failed to get auth token');
  }
  let { ok, json, res } = await doCallFunctionWithAuth<T>(name, data, token);

  // 401: 匿名ログイン直後はトークン伝播に遅れがあることがある → 少し待ってリトライ
  if (!ok && res.status === 401) {
    await new Promise((r) => setTimeout(r, 800));
    token = await user.getIdToken(true);
    const retry = await doCallFunctionWithAuth<T>(name, data, token);
    ok = retry.ok;
    json = retry.json;
    res = retry.res;
  }

  if (!ok || json.error) {
    const err = json.error || {};
    const msg = err.message || err.status || `Request failed: ${res.status}`;
    const code = err.status ? `functions/${err.status.toLowerCase()}` : 'functions/unknown';
    const e = new Error(msg) as Error & { code?: string };
    e.code = code;
    throw e;
  }

  return json.result as T;
}
