import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, Functions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
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

// ローカルエミュレータを使用する場合（開発環境）
const useEmulator = Constants.expoConfig?.extra?.useEmulator === true;

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
      // 既に接続済みの場合は無視
      if (authError.message && authError.message.includes('already')) {
        console.log('[Firebase] Auth emulator already connected');
      } else {
        console.warn('[Firebase] Auth emulator connection warning:', authError);
      }
    }
    
    console.log(`[Firebase] All emulators connected at ${emulatorHost}`);
  } catch (error) {
    // 既に接続済みの場合は無視
    console.error('[Firebase] Emulator connection error:', error);
  }
} else {
  // 本番環境（Cloud Functions）
  functionsInstance = getFunctions(app);
  console.log('[Firebase] Using production Cloud Functions');
}

export const functions: Functions = functionsInstance;
export { httpsCallable };
