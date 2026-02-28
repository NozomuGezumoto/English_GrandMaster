import type { ToeicLevel } from '../types/firestore';

export const TOEIC_LEVELS: ToeicLevel[] = [400, 600, 730, 860, 990];

/**
 * 難易度表示（Cambridge Dictionary / English Profile のレベル定義に合わせる）
 * https://dictionary.cambridge.org/help/ — A1 Beginner, A2 Elementary, B1 Intermediate, B2 Upper-Intermediate, C1 Advanced, C2 Proficiency
 */
export const LEVEL_DISPLAY: Record<ToeicLevel, { cefr: string; label: string }> = {
  400: { cefr: 'A2', label: 'Elementary' },
  600: { cefr: 'B1', label: 'Intermediate' },
  730: { cefr: 'B2', label: 'Upper-Intermediate' },
  860: { cefr: 'C1', label: 'Advanced' },
  990: { cefr: 'C2', label: 'Proficiency' },
};

/** TOEIC level → Firestore question level range (1–10). Same as backend getLevelRange. */
export function getLevelRangeForToeic(toeic: ToeicLevel): [number, number] {
  switch (toeic) {
    case 400: return [1, 2];
    case 600: return [3, 4];
    case 730: return [5, 6];
    case 860: return [7, 8];
    case 990: return [9, 10];
    default: return [1, 10];
  }
}

/** Ranked match: Elo rating → TOEIC level for question selection (same as backend). */
export function ratingToToeicLevel(rating: number): ToeicLevel {
  if (rating < 900) return 400;
  if (rating < 1100) return 600;
  if (rating < 1300) return 730;
  if (rating < 1500) return 860;
  return 990;
}
