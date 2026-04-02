import type { ImageSourcePropType } from 'react-native';
import type { LevelCode, TowerType } from './types';

/** Grammar tower — boss hero art per band (`assets/choice/card_{code}.png` pattern; B2 file is `card_b2`). */
const GRAMMAR_BOSS_HERO: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/choice/card_A2.png'),
  B1: require('../../assets/choice/card_B1.png'),
  B2: require('../../assets/choice/card_b2.png'),
  C1: require('../../assets/choice/card_C1.png'),
  C2: require('../../assets/choice/card_C2.png'),
};

/** Listening — `assets/listening/card_*.png` (B2 is `card_B2`). */
const LISTENING_BOSS_HERO: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/listening/card_A2.png'),
  B1: require('../../assets/listening/card_B1.png'),
  B2: require('../../assets/listening/card_B2.png'),
  C1: require('../../assets/listening/card_C1.png'),
  C2: require('../../assets/listening/card_C2.png'),
};

/** Dictation — `assets/dictation/card_*.png`. */
const DICTATION_BOSS_HERO: Record<LevelCode, ImageSourcePropType> = {
  A2: require('../../assets/dictation/card_A2.png'),
  B1: require('../../assets/dictation/card_B1.png'),
  B2: require('../../assets/dictation/card_B2.png'),
  C1: require('../../assets/dictation/card_C1.png'),
  C2: require('../../assets/dictation/card_C2.png'),
};

export function getTowerBossHeroSource(
  towerType: TowerType,
  levelCode: LevelCode
): ImageSourcePropType | undefined {
  if (towerType === 'grammar') return GRAMMAR_BOSS_HERO[levelCode];
  if (towerType === 'listening') return LISTENING_BOSS_HERO[levelCode];
  if (towerType === 'dictation') return DICTATION_BOSS_HERO[levelCode];
  return undefined;
}
