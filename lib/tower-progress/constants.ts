import type { LevelCode, TowerType } from './types';

/** Unlock order within one tower (low → high). */
export const TOWER_LEVEL_ORDER: LevelCode[] = ['A2', 'B1', 'B2', 'C1', 'C2'];

/** Single-tower overview: summit first. */
export const TOWER_LEVEL_OVERVIEW_ORDER: LevelCode[] = ['C2', 'C1', 'B2', 'B1', 'A2'];

export const TOWER_TOTAL_STAGES = 10;

/**
 * Stage row title for floors 1–10 (tower level detail list). One string per step — edit freely.
 * Index = `stageNumber - 1`. Length must stay aligned with {@link TOWER_TOTAL_STAGES}.
 */
export const TOWER_STAGE_STEP_LABELS: readonly string[] = [
  'First Light',
  'Open Terrace',
  'The Threshold',
  'Stone Trial',
  'Iron Trial',
  'Gold Trial',
  'High Bastion',
  'Thin Air',
  'Last Span',
  'Boss Gate',
];

export function getTowerStageStepLabel(stageNumber: number): string {
  const i = stageNumber - 1;
  if (i >= 0 && i < TOWER_STAGE_STEP_LABELS.length) return TOWER_STAGE_STEP_LABELS[i]!;
  return `Stage ${stageNumber}`;
}

export const REQUIRED_TOWERS_FOR_GUARDIAN = 3;

export const TOWER_TYPES: TowerType[] = ['grammar', 'listening', 'dictation'];

export const TOWER_TYPE_LABELS: Record<TowerType, string> = {
  grammar: 'Grammar Tower',
  listening: 'Listening Tower',
  dictation: 'Dictation Tower',
};

export const TOWER_TYPE_SUBTITLES: Record<TowerType, string> = {
  grammar: 'Structure, tense, and form',
  listening: 'Comprehension and ear training',
  dictation: 'Spelling and precision',
};

export const TOWER_LEVEL_TITLES: Record<LevelCode, string> = {
  A2: 'Foundation Grammar',
  B1: 'Syntax Gate',
  B2: 'Clause Forge',
  C1: 'Tribunal of Form',
  C2: 'Crown of Syntax',
};

export const TOWER_GUARDIAN_NAMES: Record<LevelCode, string> = {
  A2: 'Pawn',
  B1: 'Knight',
  B2: 'Bishop',
  C1: 'Rook',
  C2: 'Queen',
};

/** Tower boss encounter — guardian “lineage” shown in UI (not read from card art). */
export const TOWER_BOSS_GUARDIAN_TYPE_LABEL: Record<TowerType, string> = {
  grammar: 'Choice guardian',
  listening: 'Listening guardian',
  dictation: 'Dictation guardian',
};

/** Grammar tower — large boss name on summit card (per CEFR band). */
export const GRAMMAR_BOSS_SUMMIT_HEADLINE: Record<LevelCode, string> = {
  A2: 'THE HARE',
  B1: 'THE FOX',
  B2: 'THE WOLF',
  C1: 'THE PANTHER',
  C2: 'THE LION',
};

/** Listening / Dictation — one label for all bands until per-band titles exist. */
export const TOWER_BOSS_SUMMIT_HEADLINE_DEFAULT: Record<'listening' | 'dictation', string> = {
  listening: 'BOSS',
  dictation: 'BOSS',
};

export function getTowerBossSummitHeadline(towerType: TowerType, levelCode: LevelCode): string {
  if (towerType === 'grammar') return GRAMMAR_BOSS_SUMMIT_HEADLINE[levelCode];
  return TOWER_BOSS_SUMMIT_HEADLINE_DEFAULT[towerType];
}
