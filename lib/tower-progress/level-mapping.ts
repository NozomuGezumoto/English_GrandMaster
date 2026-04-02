import type { ToeicLevel } from '../../types/firestore';
import type { LevelCode } from './types';

/** CEFR band → Study / tower と同じ TOEIC 帯（`getLevelRangeForToeic` と対応） */
export const LEVEL_CODE_TO_TOEIC: Record<LevelCode, ToeicLevel> = {
  A2: 400,
  B1: 600,
  B2: 730,
  C1: 860,
  C2: 990,
};

export function toeicLevelForBand(code: LevelCode): ToeicLevel {
  return LEVEL_CODE_TO_TOEIC[code];
}
