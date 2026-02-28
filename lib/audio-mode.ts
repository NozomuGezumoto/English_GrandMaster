/**
 * Set audio mode for TTS (expo-speech) on mobile. Call before playing. Idempotent.
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

let audioModePromise: Promise<void> | null = null;

/** Invisible char used to unlock audio (zero-width space) */
const UNLOCK_CHAR = '\u200B';

export function ensureAudioModeForSpeech(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (audioModePromise) return audioModePromise;
  audioModePromise = (async () => {
    try {
      const av = await import('expo-av');
      await av.Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: (av as { InterruptionModeIOS?: { DoNotMix: number } }).InterruptionModeIOS?.DoNotMix ?? 1,
        interruptionModeAndroid: (av as { InterruptionModeAndroid?: { DoNotMix: number } }).InterruptionModeAndroid?.DoNotMix ?? 1,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[Audio] ensureAudioModeForSpeech:', err);
    }
  })();
  return audioModePromise;
}

/**
 * Unlock audio on mobile: speak invisible char so first real TTS can play. No-op on web.
 */
export function unlockAudioOnUserGesture(): void {
  if (Platform.OS === 'web') return;
  try {
    Speech.speak('\u200B', { language: 'en-US', rate: 1 });
  } catch (e) {
    console.warn('[Audio] unlockAudioOnUserGesture:', e);
  }
}

/**
 * Call synchronously right after user tap so it stays in gesture context. Inaudible.
 */
export function unlockAudioOnUserGestureSync(): void {
  if (Platform.OS === 'web') return;
  try {
    Speech.speak(UNLOCK_CHAR, { language: 'en-US', rate: 1 });
  } catch (e) {
    console.warn('[Audio] unlockAudioOnUserGestureSync:', e);
  }
}

/**
 * Call on Continue tap and await before continuing. Speaks invisible char to enable session. Inaudible.
 */
export function unlockAudioOnUserGestureAsync(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return (async () => {
    try {
      let resolveDone: () => void;
      const donePromise = new Promise<void>((r) => { resolveDone = r; });
      const t = setTimeout(() => resolveDone(), 3000);
      Speech.speak(UNLOCK_CHAR, {
        language: 'en-US',
        rate: 1,
        onDone: () => { clearTimeout(t); resolveDone(); },
        onError: () => { clearTimeout(t); resolveDone(); },
      });
      await ensureAudioModeForSpeech();
      await donePromise;
    } catch (e) {
      console.warn('[Audio] unlockAudioOnUserGestureAsync:', e);
    }
  })();
}
