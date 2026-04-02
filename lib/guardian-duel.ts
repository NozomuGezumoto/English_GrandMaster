/**
 * Guardian Gate ボス: ランクマ overall と同じ構成（4択10 → リスニング10 → ディクテ5）、
 * 同一 CEFR 帯のプールからランダム抽選。合格は {@link isTowerStagePassed}（80%超）。
 */

import type { Question } from '../types/firestore';
import type { StudyQuestion } from './study-questions';
import { getQuestionsForToeicBand } from './study-questions';
import { getListeningResponseQuestions } from './listening-response-questions';
import type { DictationEntry } from './dictation-vocab';
import { getWordsForToeicBand } from './dictation-vocab';
import type { LevelCode } from './tower-progress/types';
import { toeicLevelForBand } from './tower-progress/level-mapping';
import { drawRandomFromPool, isTowerStagePassed, TOWER_STAGE_CLEAR_RATIO } from './tower-questions';

/** ランクマ overall と同じ内訳 */
export const GUARDIAN_DUEL_CHOICE_COUNT = 10;
export const GUARDIAN_DUEL_LISTENING_COUNT = 10;
export const GUARDIAN_DUEL_DICTATION_COUNT = 5;

/** ランクマの 4択/リスニングと同様（1 問 20 秒） */
export const GUARDIAN_QUESTION_TIME_SEC = 20;

/** overall と同様、フェーズ開始時にライフ 3（セグメントごとにリセット） */
export const GUARDIAN_LIVES_PER_SEGMENT = 3;

/** 正誤表示後に次へ（ランクマの両者回答後クールダウンに相当） */
export const GUARDIAN_POST_ANSWER_MS = 1000;

/** Choice→Listening、Listening→Dictation の間（overall のフェーズ切替に相当） */
export const GUARDIAN_SEGMENT_INTERLUDE_MS = 2000;

export type GuardianDuelStep =
  | { kind: 'choice'; question: StudyQuestion }
  | { kind: 'listening'; question: Question }
  | { kind: 'dictation'; word: DictationEntry };

export function isGuardianDuelPassed(correctCount: number, totalQuestions: number): boolean {
  return isTowerStagePassed(correctCount, totalQuestions);
}

export function guardianDuelPassRuleLine(total: number): string {
  const pct = Math.round(TOWER_STAGE_CLEAR_RATIO * 100);
  const need = total <= 0 ? 0 : Math.floor(TOWER_STAGE_CLEAR_RATIO * total) + 1;
  return `Pass: more than ${pct}% (min. ${need} / ${total} correct)`;
}

/** 帯全体プールから各モードをランダムに抽出し、4択→リスニング→ディクテの順に並べる */
export function buildGuardianDuelSession(levelCode: LevelCode): GuardianDuelStep[] {
  const toeic = toeicLevelForBand(levelCode);
  const grammar = drawRandomFromPool(
    getQuestionsForToeicBand(toeic),
    GUARDIAN_DUEL_CHOICE_COUNT
  );
  const listening = drawRandomFromPool(
    getListeningResponseQuestions(toeic),
    GUARDIAN_DUEL_LISTENING_COUNT
  );
  const words = drawRandomFromPool(getWordsForToeicBand(toeic), GUARDIAN_DUEL_DICTATION_COUNT);

  return [
    ...grammar.map((question) => ({ kind: 'choice' as const, question })),
    ...listening.map((question) => ({ kind: 'listening' as const, question })),
    ...words.map((word) => ({ kind: 'dictation' as const, word })),
  ];
}
