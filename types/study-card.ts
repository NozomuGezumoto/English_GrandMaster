/**
 * 英文ベース単語帳（Study Card）の型定義
 * 単語ではなく英文を中心に扱う
 */

export type StudyCardStatus = 'learning' | 'mastered' | 'archived';

export type StudyCardReviewDirection = 'en_to_ja' | 'ja_to_en';

export type StudyCardExpressionType =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'phrase'
  | 'idiom'
  | 'grammar'
  | 'sentence'
  | 'other';

/** デッキ（リスト） */
export interface StudyDeck {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudyCard {
  id: string;
  userId: string;
  deckId: string;

  englishText: string;
  japaneseNote: string;

  expressionType: StudyCardExpressionType | null;

  status: StudyCardStatus;

  autoPlayAudio: boolean;

  createdAt: number;
  updatedAt: number;
  lastReviewedAt: number | null;

  reviewCount: number;
  masteredCount: number;
}

/** 新規作成用（id, timestamps は未設定） */
export interface StudyCardCreateInput {
  englishText: string;
  japaneseNote: string;
  expressionType: StudyCardExpressionType | null;
}

/** Firestore 保存時のドキュメント形状（id は doc.id） */
export interface StudyCardDoc {
  englishText: string;
  japaneseNote: string;
  expressionType: StudyCardExpressionType | null;
  status: StudyCardStatus;
  autoPlayAudio: boolean;
  createdAt: number;
  updatedAt: number;
  lastReviewedAt: number | null;
  reviewCount: number;
  masteredCount: number;
}

export const EXPRESSION_TYPE_LABELS: Record<StudyCardExpressionType, string> = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  phrase: 'Phrase',
  idiom: 'Idiom',
  grammar: 'Grammar',
  sentence: 'Sentence',
  other: 'Other',
};

export const STATUS_LABELS: Record<StudyCardStatus, string> = {
  learning: 'Learning',
  mastered: 'Mastered',
  archived: 'Archived',
};
