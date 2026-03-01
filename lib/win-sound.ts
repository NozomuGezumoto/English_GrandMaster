/**
 * Win sound (win.mp3 at 1.5x) on ranked victory result screen.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { ensureAudioModeForSpeech } from './audio-mode';
import { syncWebAudioToDefaultOutput } from './web-audio-utils';

const PLAYBACK_RATE = 1.5;

type SoundLike = {
  setPositionAsync: (n: number) => Promise<void>;
  playAsync: () => Promise<void>;
  setRateAsync?: (rate: number, shouldCorrectPitch: boolean) => Promise<void>;
};

let cachedSound: SoundLike | null = null;

let webAudio: HTMLAudioElement | null = null;
function getWebWinAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (webAudio) return webAudio;
  try {
    const asset = Asset.fromModule(require('../assets/sound/win.mp3'));
    if (!asset.uri) return null;
    webAudio = new Audio(asset.uri);
    return webAudio;
  } catch {
    return null;
  }
}

async function loadWinSound(): Promise<SoundLike | null> {
  if (cachedSound) return cachedSound;
  if (Platform.OS === 'web') return null;
  try {
    await ensureAudioModeForSpeech();
    const av = await import('expo-av');
    const { sound } = await av.Audio.Sound.createAsync(require('../assets/sound/win.mp3'));
    cachedSound = sound as unknown as SoundLike;
    return cachedSound;
  } catch (e) {
    console.warn('[WinSound] load:', e);
    return null;
  }
}

/**
 * Call before showing result screen so playback works on mobile.
 */
export function preloadWinSound(): void {
  if (Platform.OS === 'web') {
    getWebWinAudio();
    return;
  }
  loadWinSound().catch(() => {});
}

/**
 * Play once when result screen shows (caller uses a ref to avoid replay).
 */
export function playWinSound(): void {
  if (Platform.OS === 'web') {
    const a = getWebWinAudio();
    if (a) {
      a.currentTime = 0;
      a.playbackRate = PLAYBACK_RATE;
      syncWebAudioToDefaultOutput(a).then(() => a.play().catch(() => {}));
    }
    return;
  }
  const play = (s: SoundLike) => {
    (s.setRateAsync ? s.setRateAsync(PLAYBACK_RATE, false) : Promise.resolve())
      .then(() => s.setPositionAsync(0))
      .then(() => s.playAsync())
      .catch(() => {
        cachedSound = null;
      });
  };
  if (cachedSound) {
    ensureAudioModeForSpeech().then(() => play(cachedSound!));
    return;
  }
  loadWinSound().then((s) => {
    if (s) ensureAudioModeForSpeech().then(() => play(s));
  });
}
