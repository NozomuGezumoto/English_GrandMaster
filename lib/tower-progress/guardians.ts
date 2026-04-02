import type { ImageSourcePropType } from 'react-native';
import type { CefrTowerCode, TowerType } from './types';

/** Local guardian art per CEFR band (existing project assets). */
export const TOWER_GUARDIAN_ICONS: Record<CefrTowerCode, ImageSourcePropType> = {
  A2: require('../../assets/boss/icon_A2.png'),
  B1: require('../../assets/boss/icon_B1.png'),
  B2: require('../../assets/boss/icon_B2.png'),
  C1: require('../../assets/boss/icon_C1.png'),
  C2: require('../../assets/boss/icon_C2.png'),
};

/** Grammar tower — band list row art (small `icon_*.png`; cards are for boss hero only, not 64px circles). */
export const GRAMMAR_TOWER_LEVEL_ICONS: Record<CefrTowerCode, ImageSourcePropType> = {
  A2: require('../../assets/choice/icon_A2.png'),
  B1: require('../../assets/choice/icon_B1.png'),
  B2: require('../../assets/choice/icon_B2.png'),
  C1: require('../../assets/choice/icon_C1.png'),
  C2: require('../../assets/choice/icon_C2.png'),
};

/** Listening tower — same pattern as grammar (`assets/listening/icon_*.png`). */
export const LISTENING_TOWER_LEVEL_ICONS: Record<CefrTowerCode, ImageSourcePropType> = {
  A2: require('../../assets/listening/icon_A2.png'),
  B1: require('../../assets/listening/icon_B1.png'),
  B2: require('../../assets/listening/icon_B2.png'),
  C1: require('../../assets/listening/icon_C1.png'),
  C2: require('../../assets/listening/icon_C2.png'),
};

/** Dictation tower — same pattern (`assets/dictation/icon_*.png`). */
export const DICTATION_TOWER_LEVEL_ICONS: Record<CefrTowerCode, ImageSourcePropType> = {
  A2: require('../../assets/dictation/icon_A2.png'),
  B1: require('../../assets/dictation/icon_B1.png'),
  B2: require('../../assets/dictation/icon_B2.png'),
  C1: require('../../assets/dictation/icon_C1.png'),
  C2: require('../../assets/dictation/icon_C2.png'),
};

export function getTowerLevelListIcons(towerType: TowerType): Record<CefrTowerCode, ImageSourcePropType> {
  if (towerType === 'grammar') return GRAMMAR_TOWER_LEVEL_ICONS;
  if (towerType === 'listening') return LISTENING_TOWER_LEVEL_ICONS;
  return DICTATION_TOWER_LEVEL_ICONS;
}

/** Full guardian card art for Guardian Gate list (hero / cover). */
export const TOWER_GUARDIAN_CARD_ART: Record<CefrTowerCode, ImageSourcePropType> = {
  A2: require('../../assets/boss/card_A2.png'),
  B1: require('../../assets/boss/card_B1.png'),
  B2: require('../../assets/boss/card_B2.png'),
  C1: require('../../assets/boss/card_C1.png'),
  C2: require('../../assets/boss/card_C2.png'),
};
