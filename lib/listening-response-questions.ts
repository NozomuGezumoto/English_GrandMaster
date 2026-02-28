/**
 * Listening Response Quiz 用の問題データ。
 * データ元: data/listening-response.json（Study 専用、既存 corpus と分離）
 */

import type { Question } from '../types/firestore';
import type { ToeicLevel } from '../types/firestore';
import { getLevelRangeForToeic } from './levels';
import { normalizeQuestion } from './question-utils';

import listeningResponseJson from '../data/listening-response.json';

const rawList = Array.isArray(listeningResponseJson) ? listeningResponseJson : [];

/** 本文ではない [97] などの参照番号を prompt から削除 */
function stripPromptRefNumbers(prompt: string | undefined): string {
  if (typeof prompt !== 'string') return prompt ?? '';
  return prompt.replace(/\s*\[\d+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function withCleanedPrompt(q: Question): Question {
  if (!q.prompt) return q;
  const cleaned = stripPromptRefNumbers(typeof q.prompt === 'string' ? q.prompt : String(q.prompt));
  return cleaned === (typeof q.prompt === 'string' ? q.prompt : String(q.prompt)) ? q : { ...q, prompt: cleaned };
}

/** レベル範囲内の listening_response 問題を返す。TOEIC 帯でフィルタ。 */
export function getListeningResponseQuestions(toeicLevel: ToeicLevel): Question[] {
  const [minLv, maxLv] = getLevelRangeForToeic(toeicLevel);
  return rawList
    .map((item) => normalizeQuestion(item))
    .filter((q): q is Question => {
      if (!q) return false;
      const lv = typeof q.level === 'number' ? q.level : 0;
      return q.type === 'listening_response' && lv >= minLv && lv <= maxLv;
    })
    .map(withCleanedPrompt);
}

/** ID形式: listening-{level}-{index}。data はレベル順に 100 問ずつ並んでいる想定。 */
export function getListeningQuestionById(id: string): Question | null {
  const m = /^listening-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  const level = parseInt(m[1], 10);
  const index = parseInt(m[2], 10);
  const base = (level - 1) * 100;
  const raw = rawList[base + index];
  if (!raw) return null;
  const q = normalizeQuestion(raw);
  if (!q || q.type !== 'listening_response') return null;
  return withCleanedPrompt(q);
}

/** listening-{level}-{index} 形式か */
export function isListeningQuestionId(questionId: string): boolean {
  return /^listening-\d+-\d+$/.test(questionId);
}

/** TOEIC 帯からランダムに count 件の listening 問題 ID を返す。AI/友達/ランクマ用。 */
export function getRandomListeningQuestionIds(toeicLevel: ToeicLevel, count: number): string[] {
  const [minLv, maxLv] = getLevelRangeForToeic(toeicLevel);
  const ids: string[] = [];
  for (let lv = minLv; lv <= maxLv; lv++) {
    for (let i = 0; i < 100; i++) ids.push(`listening-${lv}-${i}`);
  }
  if (ids.length < count) return [];
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Fisher–Yates シャッフル。選択肢の並びと answerIndex を更新した問題を返す。 */
export function shuffleListeningChoices(q: Question): Question {
  const choices = Array.isArray(q.choices) ? [...q.choices] : [];
  const correctIndex = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  const correct = choices[correctIndex];

  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  const newAnswerIndex = choices.indexOf(correct);
  if (newAnswerIndex === -1) return q;

  return { ...q, choices, answerIndex: newAnswerIndex };
}

/** シード付きの擬似乱数 [0, 1) */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** 文字列を数値ハッシュに（同一文字列なら同じ値） */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * シードで決定的にシャッフル。マッチ対戦で両端末が同じ選択肢順にするために使用。
 * seed には例: `${matchId}-${qIndex}` を渡す。
 */
export function shuffleListeningChoicesWithSeed(q: Question, seed: string): Question {
  const choices = Array.isArray(q.choices) ? [...q.choices] : [];
  const correctIndex = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  const correct = choices[correctIndex];
  const baseSeed = hashString(seed);

  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(baseSeed + i) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  const newAnswerIndex = choices.indexOf(correct);
  if (newAnswerIndex === -1) return q;

  return { ...q, choices, answerIndex: newAnswerIndex };
}
