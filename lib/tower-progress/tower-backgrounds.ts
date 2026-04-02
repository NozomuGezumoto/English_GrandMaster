import type { ImageSourcePropType } from 'react-native';
import type { LevelCode, TowerType } from './types';

const GRAMMAR_TOWER_BG = require('../../assets/tower/granmmer.png');
const GRAMMAR_BAND_BG: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/tower/grammar/A2.png'),
  B1: require('../../assets/tower/grammar/B1.png'),
  B2: require('../../assets/tower/grammar/B2.png'),
  C1: require('../../assets/tower/grammar/C1.png'),
  C2: require('../../assets/tower/grammar/C2.png'),
};
const LISTENING_TOWER_BG = require('../../assets/tower/listening.png');
/** Per-band backgrounds under `assets/tower/listening/` (A2 band uses `A1.png` — filename in repo). */
const LISTENING_BAND_BG: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/tower/listening/A1.png'),
  B1: require('../../assets/tower/listening/B1.png'),
  B2: require('../../assets/tower/listening/B2.png'),
  C1: require('../../assets/tower/listening/C1.png'),
  C2: require('../../assets/tower/listening/C2.png'),
};
const DICTATION_TOWER_BG = require('../../assets/tower/dictation.png');
const DICTATION_BAND_BG: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/tower/dictation/A2.png'),
  B1: require('../../assets/tower/dictation/B1.png'),
  B2: require('../../assets/tower/dictation/B2.png'),
  C1: require('../../assets/tower/dictation/C1_1.png'),
  C2: require('../../assets/tower/dictation/C2.png'),
};
/** Guardian Gate list / routes without a band — fallback hero. */
const GUARDIAN_GATE_BG = require('../../assets/tower/guardian.png');
/** Per-band duel backgrounds under `assets/tower/guardian/` (filenames match piece names; A2 uses `pown.png`). */
const GUARDIAN_DUEL_BG: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/tower/guardian/pown.png'),
  B1: require('../../assets/tower/guardian/knight.png'),
  B2: require('../../assets/tower/guardian/bishop.png'),
  C1: require('../../assets/tower/guardian/rook.png'),
  C2: require('../../assets/tower/guardian/queen.png'),
};

export type TowerProgressBackgroundKind = TowerType | 'guardian';

/**
 * Optional override for `TowerScreenBackground`. `undefined` = default trial-tower.png
 * Grammar / listening / dictation + `levelCode`: per-band art under `assets/tower/{type}/{...}.png`.
 */
export function getTowerProgressBackgroundSource(
  kind: TowerProgressBackgroundKind | null | undefined,
  levelCode?: LevelCode | null
): ImageSourcePropType | undefined {
  if (kind === 'guardian') {
    if (levelCode) return GUARDIAN_DUEL_BG[levelCode];
    return GUARDIAN_GATE_BG;
  }
  if (kind === 'grammar' && levelCode) return GRAMMAR_BAND_BG[levelCode];
  if (kind === 'grammar') return GRAMMAR_TOWER_BG;
  if (kind === 'listening' && levelCode) return LISTENING_BAND_BG[levelCode];
  if (kind === 'listening') return LISTENING_TOWER_BG;
  if (kind === 'dictation' && levelCode) return DICTATION_BAND_BG[levelCode];
  if (kind === 'dictation') return DICTATION_TOWER_BG;
  return undefined;
}
