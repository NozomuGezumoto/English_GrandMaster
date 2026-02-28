/**
 * Firestore から取得した問題オブジェクトの正規化。
 * choices がオブジェクトで返る場合に配列に変換する。
 */

import type { Question } from '../types/firestore';

export function normalizeQuestion(data: unknown): Question | null {
  if (!data || typeof data !== 'object') return null;
  const q = data as Record<string, unknown>;
  let choices = q.choices;
  if (!Array.isArray(choices)) {
    if (choices && typeof choices === 'object' && !Array.isArray(choices)) {
      const obj = choices as Record<string, string>;
      choices = Object.keys(obj)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => String(obj[k] ?? ''));
    } else {
      choices = [];
    }
  }
  return {
    ...q,
    choices: choices as string[],
  } as Question;
}

/** 正解の単語を安全に取得（choices/answerIndex が不正でも落ちない） */
export function getCorrectWord(q: Question | null): string {
  if (!q) return '';
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const i = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  return String(choices[i] ?? '').trim();
}
