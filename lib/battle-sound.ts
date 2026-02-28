/**
 * Battle theme (battle.mp3) on match-found / Ready screen.
 * Preload when user taps match start so it plays on mobile.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { ensureAudioModeForSpeech } from './audio-mode';

type SoundLike = { setPositionAsync: (n: number) => Promise<void>; playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };

let cachedSound: SoundLike | null = null;

// Web: HTML5 Audio (expo-av has issues with ontimeupdate)
let webAudio: HTMLAudioElement | null = null;
function getWebBattleAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (webAudio) return webAudio;
  try {
    const asset = Asset.fromModule(require('../assets/sound/battle.mp3'));
    if (!asset.uri) return null;
    webAudio = new Audio(asset.uri);
    return webAudio;
  } catch {
    return null;
  }
}

async function loadBattleSound(): Promise<SoundLike | null> {
  if (cachedSound) return cachedSound;
  if (Platform.OS === 'web') return null;
  try {
    await ensureAudioModeForSpeech();
    const av = await import('expo-av');
    const { sound } = await av.Audio.Sound.createAsync(require('../assets/sound/battle.mp3'));
    cachedSound = sound as unknown as SoundLike;
    return cachedSound;
  } catch (e) {
    console.warn('[BattleSound] load:', e);
    return null;
  }
}

/**
 * Call right after user taps match start so sound is ready on opponent-found screen.
 */
export function preloadBattleSound(): void {
  if (Platform.OS === 'web') {
    getWebBattleAudio();
    return;
  }
  loadBattleSound().catch(() => {});
}

/**
 * Clear cache so next match can reload (e.g. after leaving and re-entering).
 */
export function clearBattleSoundCache(): void {
  cachedSound = null;
  if (typeof window !== 'undefined' && webAudio) {
    webAudio = null;
  }
}

/**
 * Play once on opponent-found / Ready screen (called from match screen effect).
 */
export function playBattleSound(): void {
  if (Platform.OS === 'web') {
    const a = getWebBattleAudio();
    if (a) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
    return;
  }
  if (cachedSound) {
    cachedSound.setPositionAsync(0).then(() => cachedSound!.playAsync()).catch(() => {
      cachedSound = null; // Reload on next use if play failed
    });
    return;
  }
  loadBattleSound().then((s) => {
    if (s) s.setPositionAsync(0).then(() => s.playAsync());
  });
}
