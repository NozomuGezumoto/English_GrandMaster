/**
 * Button click sound (click.mp3). Call synchronously on press so it plays on mobile.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { ensureAudioModeForSpeech } from './audio-mode';

let cachedSound: { setPositionAsync: (n: number) => Promise<void>; playAsync: () => Promise<void> } | null = null;

// Web: get URL via expo-asset, play with HTML5 Audio
let webAudio: HTMLAudioElement | null = null;
function getWebClickAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (webAudio) return webAudio;
  try {
    const asset = Asset.fromModule(require('../assets/sound/click.mp3'));
    const url = asset.uri;
    if (!url) return null;
    webAudio = new Audio(url);
    return webAudio;
  } catch {
    return null;
  }
}

async function getClickSound() {
  if (cachedSound) return cachedSound;
  await ensureAudioModeForSpeech();
  const av = await import('expo-av');
  const { sound } = await av.Audio.Sound.createAsync(
    require('../assets/sound/click.mp3')
  );
  cachedSound = sound as unknown as { setPositionAsync: (n: number) => Promise<void>; playAsync: () => Promise<void> };
  return cachedSound;
}

/**
 * Clear cache so it can be reloaded (e.g. after leaving screen).
 */
export function clearClickSoundCache(): void {
  cachedSound = null;
  if (typeof window !== 'undefined' && webAudio) {
    webAudio = null;
  }
}

/**
 * Preload on screen mount so first tap plays reliably on mobile.
 */
export function preloadClickSound(): void {
  if (Platform.OS === 'web') {
    getWebClickAudio();
    return;
  }
  getClickSound().catch((e) => console.warn('[ClickSound] preload:', e));
}

/**
 * Play once. Call at the start of button onPress.
 */
export function playClickSound(): void {
  if (Platform.OS === 'web') {
    const a = getWebClickAudio();
    if (a) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
    return;
  }
  // If cached, schedule play (keeps it in tap context on mobile)
  if (cachedSound) {
    cachedSound
      .setPositionAsync(0)
      .then(() => cachedSound!.playAsync())
      .catch(() => {
        cachedSound = null; // Reload next time if invalid
      });
    return;
  }
  getClickSound()
    .then((s) => s.setPositionAsync(0).then(() => s.playAsync()))
    .catch((e) => {
      cachedSound = null;
      console.warn('[ClickSound] play:', e);
    });
}
