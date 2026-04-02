/**
 * タワー各ステージの問題プール。
 * Study と同じデータ源・同じ帯（TOEIC level）を使い、帯内の全件を 10 ステージにほぼ均等分割。
 * 実際の出題はその桶から {@link TOWER_STAGE_DRAW_COUNT} 問をランダムに選ぶ。
 */

import type { Question } from '../types/firestore';
import type { StudyQuestion } from './study-questions';
import { getQuestionsForToeicBand } from './study-questions';
import { getListeningResponseQuestions } from './listening-response-questions';
import type { DictationEntry } from './dictation-vocab';
import { getWordsForToeicBand } from './dictation-vocab';
import { TOWER_TOTAL_STAGES } from './tower-progress/constants';
import type { LevelCode, TowerType } from './tower-progress/types';
import { toeicLevelForBand } from './tower-progress/level-mapping';
import { TOWER_BOSS_DRAW_COUNT, TOWER_STAGE_DRAW_COUNT } from './tower-progress/tower-stage-rules';

export { TOWER_BOSS_DRAW_COUNT, TOWER_STAGE_DRAW_COUNT } from './tower-progress/tower-stage-rules';
export {
  isTowerBossPassed,
  isTowerStagePassed,
  TOWER_BOSS_CLEAR_MIN_CORRECT,
  TOWER_STAGE_CLEAR_RATIO,
} from './tower-progress/tower-stage-rules';

function hashTowerPayload(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * タワー進行（桶内ユニーク正解）の永続化用。同一アイテムは常に同じキーになるようにする。
 */
export function getTowerSessionItemKey(
  towerType: TowerType,
  levelCode: LevelCode,
  item: Question | StudyQuestion | Pick<DictationEntry, 'word'>
): string {
  if (towerType === 'dictation') {
    const w = String((item as Pick<DictationEntry, 'word'>).word ?? '')
      .trim()
      .toLowerCase();
    return `d:${levelCode}:${w}`;
  }
  const maybe = item as StudyQuestion;
  if (typeof maybe.id === 'string' && maybe.id.length > 0) {
    return `g:${maybe.id}`;
  }
  const q = item as Question;
  const payload = `${towerType}:${levelCode}:${q.prompt ?? ''}\0${(q.choices ?? []).join('\0')}`;
  return `l:${levelCode}:${hashTowerPayload(payload)}`;
}

export function shuffleCopy<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** ステージ桶から最大 `count` 件を重複なしランダム抽出 */
export function drawRandomFromPool<T>(pool: readonly T[], count: number = TOWER_STAGE_DRAW_COUNT): T[] {
  const shuffled = shuffleCopy(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * `items` を `stageCount` 桶に分割。余りは先頭の桶から 1 問ずつ多く振る。
 * 例: 23 問・10 ステージ → [3,2,2,2,2,2,2,2,2,2]
 */
export function splitItemsIntoStages<T>(items: readonly T[], stageCount: number): T[][] {
  const n = items.length;
  if (stageCount <= 0) return [];
  const base = Math.floor(n / stageCount);
  const extra = n % stageCount;
  const buckets: T[][] = [];
  let offset = 0;
  for (let s = 0; s < stageCount; s++) {
    const size = base + (s < extra ? 1 : 0);
    buckets.push(items.slice(offset, offset + size) as T[]);
    offset += size;
  }
  return buckets;
}

function bucketsForBand<T>(items: readonly T[]): T[][] {
  return splitItemsIntoStages(items, TOWER_TOTAL_STAGES);
}

/** Grammar tower: Study 4択（corpus）と同一プール。stageNumber は 1..10 */
export function getGrammarTowerStageQuestions(levelCode: LevelCode, stageNumber: number): StudyQuestion[] {
  const toeic = toeicLevelForBand(levelCode);
  const all = getQuestionsForToeicBand(toeic);
  const buckets = bucketsForBand(all);
  return buckets[stageNumber - 1] ?? [];
}

/** Listening tower: Study の listening_response JSON と同一プール */
export function getListeningTowerStageQuestions(levelCode: LevelCode, stageNumber: number): Question[] {
  const toeic = toeicLevelForBand(levelCode);
  const all = getListeningResponseQuestions(toeic);
  const buckets = bucketsForBand(all);
  return buckets[stageNumber - 1] ?? [];
}

/** Dictation tower: Study の built-in 語彙と同一プール */
export function getDictationTowerStageWords(levelCode: LevelCode, stageNumber: number): DictationEntry[] {
  const toeic = toeicLevelForBand(levelCode);
  const all = getWordsForToeicBand(toeic);
  const buckets = bucketsForBand(all);
  return buckets[stageNumber - 1] ?? [];
}

export function drawGrammarTowerStageSession(levelCode: LevelCode, stageNumber: number): StudyQuestion[] {
  return drawRandomFromPool(getGrammarTowerStageQuestions(levelCode, stageNumber));
}

export function drawListeningTowerStageSession(levelCode: LevelCode, stageNumber: number): Question[] {
  return drawRandomFromPool(getListeningTowerStageQuestions(levelCode, stageNumber));
}

export function drawDictationTowerStageSession(levelCode: LevelCode, stageNumber: number): DictationEntry[] {
  return drawRandomFromPool(getDictationTowerStageWords(levelCode, stageNumber));
}

/** ボス: 帯内の全ステージ桶の和＝帯全体プールからランダムに最大10件 */
export function drawGrammarTowerBossSession(levelCode: LevelCode): StudyQuestion[] {
  const toeic = toeicLevelForBand(levelCode);
  const pool = getQuestionsForToeicBand(toeic);
  return drawRandomFromPool(pool, TOWER_BOSS_DRAW_COUNT);
}

export function drawListeningTowerBossSession(levelCode: LevelCode): Question[] {
  const toeic = toeicLevelForBand(levelCode);
  const pool = getListeningResponseQuestions(toeic);
  return drawRandomFromPool(pool, TOWER_BOSS_DRAW_COUNT);
}

export function drawDictationTowerBossSession(levelCode: LevelCode): DictationEntry[] {
  const toeic = toeicLevelForBand(levelCode);
  const pool = getWordsForToeicBand(toeic);
  return drawRandomFromPool(pool, TOWER_BOSS_DRAW_COUNT);
}

/** ステージ桶の件数と、その帯（全ステージの和）の総件数 */
export type TowerStagePoolStats = { stagePool: number; bandTotal: number };

export function getTowerStagePoolStats(
  towerType: TowerType,
  levelCode: LevelCode,
  stageNumber: number
): TowerStagePoolStats {
  if (towerType === 'grammar') {
    const stagePool = getGrammarTowerStageQuestions(levelCode, stageNumber).length;
    const bandTotal = getQuestionsForToeicBand(toeicLevelForBand(levelCode)).length;
    return { stagePool, bandTotal };
  }
  if (towerType === 'listening') {
    const stagePool = getListeningTowerStageQuestions(levelCode, stageNumber).length;
    const bandTotal = getListeningResponseQuestions(toeicLevelForBand(levelCode)).length;
    return { stagePool, bandTotal };
  }
  const stagePool = getDictationTowerStageWords(levelCode, stageNumber).length;
  const bandTotal = getWordsForToeicBand(toeicLevelForBand(levelCode)).length;
  return { stagePool, bandTotal };
}

/** ボス用（帯全体＝全ステージの和） */
export function getTowerBossPoolStats(towerType: TowerType, levelCode: LevelCode): TowerStagePoolStats {
  const { bandTotal } = getTowerStagePoolStats(towerType, levelCode, 1);
  return { stagePool: bandTotal, bandTotal };
}
