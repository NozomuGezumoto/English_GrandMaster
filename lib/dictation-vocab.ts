/**
 * ディクテーション用語彙（レベル別100語）。questions とは別データ。
 * 語源: English Profile (EVP) 等。data/dictation-vocab.json を node scripts/build-dictation-vocab.js で生成。
 * 各語に英英定義（definition）を持たせ、正解時に表示する。
 */

import dictationVocabJson from '../data/dictation-vocab.json';
import type { ToeicLevel } from '../types/firestore';
import { getLevelRangeForToeic } from './levels';

export type DictationEntry = { word: string; definition: string };
type RawLevel = (string | DictationEntry)[];

function normalizeEntry(item: string | DictationEntry): DictationEntry {
  if (typeof item === 'string') return { word: item.trim().toLowerCase(), definition: '' };
  const o = item as DictationEntry;
  return { word: (o.word || '').trim().toLowerCase(), definition: (o.definition || '').trim() };
}

function getEntriesForLevel(level: number): DictationEntry[] {
  const key = String(level);
  const raw = (dictationVocabJson as Record<string, RawLevel>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry);
}

/** レベル 1–10 のうち指定レベル用の語リスト（最大100語） */
export function getWordsForLevel(level: number): DictationEntry[] {
  return getEntriesForLevel(level);
}

/** 選択中の TOEIC 帯に対応するレベル範囲の語を結合して返す（重複語は1つに） */
export function getWordsForToeicBand(selectedLevel: ToeicLevel): DictationEntry[] {
  const [minLv, maxLv] = getLevelRangeForToeic(selectedLevel);
  const seen = new Set<string>();
  const result: DictationEntry[] = [];
  for (let lv = minLv; lv <= maxLv; lv++) {
    for (const entry of getEntriesForLevel(lv)) {
      if (seen.has(entry.word)) continue;
      seen.add(entry.word);
      result.push(entry);
    }
  }
  return result;
}

/** 全レベル合計語数 */
export function getTotalWordCount(): number {
  let n = 0;
  for (let lv = 1; lv <= 10; lv++) {
    n += getEntriesForLevel(lv).length;
  }
  return n;
}
