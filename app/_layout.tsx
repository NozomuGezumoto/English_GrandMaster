import { Stack, useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { preloadClickSound } from '../lib/click-sound';

const WEB_VIEWPORT_CSS = `
  html, body, #root { height: 100% !important; min-height: 100% !important; overflow: hidden !important; }
  @supports (height: 100dvh) { html, body, #root { min-height: 100dvh !important; height: 100dvh !important; } }
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
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.setAttribute('data-viewport-fix', 'true');
    el.textContent = WEB_VIEWPORT_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  const wrapperStyle = Platform.OS === 'web'
    ? { flex: 1 as const, minHeight: '100%' as const, height: '100%' as const }
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
        <Stack.Screen name="match/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="result/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="link-account" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="year-review" options={{ headerShown: false }} />
        <Stack.Screen name="study-cards" options={{ headerShown: false }} />
    </Stack>
    </View>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}


