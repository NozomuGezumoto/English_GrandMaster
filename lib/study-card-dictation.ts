/**
 * Study Card → マイデッキ用ディクテーション1件。
 * 出題は英語の見出し語のみ。正解後に和訳・品詞を表示。
 * 旧データで「deadline, 締め切り, noun」のように1フィールドに入っている場合は実行時に分解する。
 */

import type { DictationEntry } from './dictation-vocab';
import type { StudyCard } from '../types/study-card';
import { EXPRESSION_TYPE_LABELS, type StudyCardExpressionType } from '../types/study-card';

const EXPRESSION_ORDER: StudyCardExpressionType[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrase',
  'idiom',
  'grammar',
  'sentence',
  'other',
];

function parseThirdColumnAsExpressionType(token: string): StudyCardExpressionType | null {
  const t = token.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const key of EXPRESSION_ORDER) {
    if (key === lower) return key;
    if (EXPRESSION_TYPE_LABELS[key].toLowerCase() === lower) return key;
  }
  return null;
}

/** カンマ3分割以上かつ末尾が品詞ラベルなら、先頭を見出し語とみなす */
function tryParseLegacyCommaCombined(englishOnly: string): DictationEntry | null {
  const parts = englishOnly.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const pos = parseThirdColumnAsExpressionType(parts[parts.length - 1] ?? '');
  if (!pos) return null;
  const head = parts[0] ?? '';
  if (!head) return null;
  const middle = parts.slice(1, -1).join(', ');
  const reveal = [middle, EXPRESSION_TYPE_LABELS[pos]].filter(Boolean).join('\n');
  return { word: head, definition: reveal };
}

/**
 * 1枚のカードをディクテ用エントリに変換。
 * - 通常: englishText = 聞き取り・入力対象、和訳・品詞は別フィールドから正解後表示
 * - レガシー: 和訳・品詞が空で englishText が「語,和訳,品詞」形式
 */
export function studyCardToDictationEntry(card: StudyCard): DictationEntry | null {
  const en = card.englishText.trim();
  if (!en) return null;

  const ja = (card.japaneseNote ?? '').trim();
  const typ = card.expressionType;

  const revealLines: string[] = [];
  if (ja) revealLines.push(ja);
  if (typ) revealLines.push(EXPRESSION_TYPE_LABELS[typ]);

  if (ja || typ) {
    return {
      word: en,
      definition: revealLines.join('\n'),
    };
  }

  const legacy = tryParseLegacyCommaCombined(en);
  if (legacy) return legacy;

  return { word: en, definition: '' };
}

export function studyCardsToDeckDictationEntries(cards: StudyCard[]): DictationEntry[] {
  const out: DictationEntry[] = [];
  for (const c of cards) {
    const e = studyCardToDictationEntry(c);
    if (e && e.word.length > 0) out.push(e);
  }
  return out;
}
