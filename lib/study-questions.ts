/**
 * Study 4択・AI対戦用のアプリ内問題データ。
 * データ元: data/corpus-questions.json（レベル別配列）。Firestore 読み取りを削減する。
 */

import type { Question } from '../types/firestore';
import type { ToeicLevel } from '../types/firestore';
import { getLevelRangeForToeic } from './levels';
import { normalizeQuestion } from './question-utils';

// レベル "1".."10" → Question[]（answerIndex 含む）
import corpusJson from '../data/corpus-questions.json';
const corpus = corpusJson as Record<string, unknown[]>;

export type StudyQuestion = Question & { id: string };

function getQuestionsByLevel(level: number): StudyQuestion[] {
  const key = String(level);
  const raw = corpus[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const q = normalizeQuestion(item);
      if (!q) return null;
      return { ...q, id: `local-${level}-${index}` } as StudyQuestion;
    })
    .filter((q): q is StudyQuestion => q != null);
}

/** TOEIC 帯に対応するレベル範囲の全問題（重複なし）。Study 一覧用。 */
export function getQuestionsForToeicBand(toeicLevel: ToeicLevel): StudyQuestion[] {
  const [minLv, maxLv] = getLevelRangeForToeic(toeicLevel);
  const seen = new Set<string>();
  const result: StudyQuestion[] = [];
  for (let lv = minLv; lv <= maxLv; lv++) {
    for (const q of getQuestionsByLevel(lv)) {
      const key = `${q.prompt}-${(q.choices || []).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(q);
    }
  }
  return result;
}

/** 合成 id (local-{level}-{index}) で問題を取得。AI 対戦の表示用。 */
export function getQuestionById(id: string): Question | null {
  const m = /^local-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  const level = parseInt(m[1], 10);
  const index = parseInt(m[2], 10);
  const list = getQuestionsByLevel(level);
  const q = list[index];
  return q ? { ...q } : null;
}

/** ローカルに問題があるか（id が local-* 形式か） */
export function isLocalQuestionId(questionId: string): boolean {
  return questionId.startsWith('local-');
}

/** TOEIC 帯からランダムに count 件の id を返す。AI 対戦の出題用。 */
export function getRandomQuestionIdsForToeic(toeicLevel: ToeicLevel, count: number): string[] {
  const pool = getQuestionsForToeicBand(toeicLevel);
  if (pool.length < count) return [];
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * pool.length));
  }
  return Array.from(indices).map((i) => pool[i].id);
}
