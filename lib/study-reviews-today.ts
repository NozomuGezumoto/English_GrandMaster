/**
 * 今日の学習：復習した単語の記録（AsyncStorage）
 * 同じ単語・同じリストを複数回カウントする
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@studyReviewsToday';
const MAX_DAYS_TO_KEEP = 3;

export interface StudyReviewEntry {
  englishText: string;
  reviewedAt: number;
}

function getTodayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateStringFromTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 復習を1件記録（答えを表示したとき呼ぶ） */
export async function recordStudyReview(englishText: string): Promise<void> {
  const text = (englishText || '').trim();
  if (!text) return;

  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  let entries: StudyReviewEntry[] = [];
  if (raw) {
    try {
      entries = JSON.parse(raw);
      if (!Array.isArray(entries)) entries = [];
    } catch {
      entries = [];
    }
  }

  entries.push({ englishText: text, reviewedAt: Date.now() });

  // 古い日付のエントリを削除（最大 MAX_DAYS_TO_KEEP 日分残す）
  const today = getTodayLocalDateString();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS_TO_KEEP);
  const cutoffStr = getDateStringFromTimestamp(cutoff.getTime());
  entries = entries.filter((e) => getDateStringFromTimestamp(e.reviewedAt) >= cutoffStr);

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** 今日復習した単語一覧を取得（同じ単語も複数カウント、時系列順） */
export async function getTodayStudyReviews(): Promise<StudyReviewEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const entries: StudyReviewEntry[] = JSON.parse(raw);
    const today = getTodayLocalDateString();
    return (Array.isArray(entries) ? entries : []).filter(
      (e) => getDateStringFromTimestamp(e.reviewedAt) === today
    );
  } catch {
    return [];
  }
}
