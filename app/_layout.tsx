import { Stack, useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { preloadClickSound } from '../lib/click-sound';
import { loadTowerRuntimeProgress } from '../lib/tower-progress/tower-runtime-storage';

const WEB_VIEWPORT_CSS = `
  /* モバイルブラウザで縦スクロール可能に（overflow:hidden はタッチスクロールを殺す） */
  html {
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  body {
    margin: 0;
    min-height: 100%;
    min-height: -webkit-fill-available;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  #root {
    min-height: 100%;
    min-height: -webkit-fill-available;
    width: 100%;
    overflow-x: hidden;
    overflow-y: visible;
    display: flex;
    flex-direction: column;
  }
  @supports (height: 100dvh) {
    body { min-height: 100dvh; }
    #root { min-height: 100dvh; }
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { max-width: 100vw; }
  #root { max-width: 100vw; }
  /* Replace default thick light scrollbars on inner scroll views (tower, modals, etc.) */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(198, 167, 94, 0.42) rgba(8, 12, 20, 0.75);
  }
  *::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  *::-webkit-scrollbar-track {
    background: rgba(8, 12, 20, 0.5);
  }
  *::-webkit-scrollbar-thumb {
    background: rgba(198, 167, 94, 0.3);
    border-radius: 5px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(198, 167, 94, 0.52);
  }
`;

export default function RootLayout() {
  const router = useRouter();

  // 携帯でリスニング・ディクテーションの音声が鳴るように、ネイティブで音声モードを設定
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const av = await import('expo-av');
        if (cancelled) return;
        await av.Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          interruptionModeIOS: av.InterruptionModeIOS?.DoNotMix ?? 1,
          interruptionModeAndroid: av.InterruptionModeAndroid?.DoNotMix ?? 1,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        if (!cancelled) console.warn('[Audio] setAudioModeAsync:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // クリック音を起動時にプリロード（バトル画面のボタンで即鳴るように）
  useEffect(() => {
    preloadClickSound();
  }, []);

  useEffect(() => {
    loadTowerRuntimeProgress().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.setAttribute('data-viewport-fix', 'true');
    el.textContent = WEB_VIEWPORT_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  /** ホスティングや古い index で viewport が欠けると「PC幅レイアウトのまま携帯表示」になり横切れする */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const content =
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.prepend(meta);
    }
    meta.setAttribute('content', content);
  }, []);

  /** Web: height:100% 固定は子のスクロール領域を潰すため minHeight のみ */
  const wrapperStyle = Platform.OS === 'web'
    ? { flex: 1 as const, width: '100%' as const, minHeight: '100dvh' as const }
    : { flex: 1 as const };

  return (
    <SafeAreaProvider>
    <ErrorBoundary onGoHome={() => router.replace('/(tabs)/battle')}>
    <View style={wrapperStyle}>
    <OfflineBanner />
    <Stack
      screenOptions={{
        headerShown: false, // すべての画面でヘッダーを無効化（各画面で独自実装）
      }}
    >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="match" options={{ headerShown: false }} />
        <Stack.Screen name="result/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="link-account" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="year-review" options={{ headerShown: false }} />
        <Stack.Screen name="study-cards" options={{ headerShown: false }} />
        <Stack.Screen name="tower" options={{ headerShown: false }} />
    </Stack>
    </View>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}


