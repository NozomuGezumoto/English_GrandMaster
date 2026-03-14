/**
 * 学習履歴（AsyncStorage）
 * Total study / Year review 用に長期保存。
 * 保持期間: 約400日（1年+余裕）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@studyHistory';
const MAX_DAYS_TO_KEEP = 400;

export interface StudyHistoryDay {
  date: string;
  studySeconds: number;
  flashcards: number;
  dictation: number;
  battles: number;
}

export type StudyHistoryMode = 'flashcards' | 'dictation' | 'choice' | 'listening' | 'battle';

function getTodayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateStringFromTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ensureEntry(byDate: Record<string, StudyHistoryDay>, date: string): StudyHistoryDay {
  if (!byDate[date]) {
    byDate[date] = {
      date,
      studySeconds: 0,
      flashcards: 0,
      dictation: 0,
      battles: 0,
    };
  }
  return byDate[date];
}

/** 学習履歴を加算（addStudyTimeToday から呼ばれる） */
export async function incrementStudyHistory(
  mode: StudyHistoryMode,
  studySeconds: number,
  counts?: { flashcards?: number; dictation?: number; battles?: number }
): Promise<void> {
  const today = getTodayLocalDateString();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const byDate: Record<string, StudyHistoryDay> = raw ? JSON.parse(raw) : {};

  const entry = ensureEntry(byDate, today);
  entry.studySeconds += studySeconds;
  if (counts?.flashcards) entry.flashcards += counts.flashcards;
  if (counts?.dictation) entry.dictation += counts.dictation;
  if (counts?.battles) entry.battles += counts.battles;

  // 古い日付を削除（古い順にソートして超過分を削除）
  const sorted = Object.keys(byDate).sort();
  if (sorted.length > MAX_DAYS_TO_KEEP) {
    const toRemove = sorted.slice(0, sorted.length - MAX_DAYS_TO_KEEP);
    toRemove.forEach((k) => delete byDate[k]);
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byDate));
}

/** 今日の学習時間（秒） */
export async function getTodayStudySeconds(): Promise<number> {
  const today = getTodayLocalDateString();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    const entry = byDate[today];
    return entry?.studySeconds ?? 0;
  } catch {
    return 0;
  }
}

/** 直近7日間の学習時間（秒）合計 */
export async function getWeekStudySeconds(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffStr = getDateStringFromTimestamp(cutoff.getTime());
    const todayStr = getTodayLocalDateString();

    let total = 0;
    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr >= cutoffStr && dateStr <= todayStr && entry) {
        total += entry.studySeconds ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** 今月の日別学習時間を取得（study-time-today とのマージ用）dateStr -> studySeconds */
export async function getThisMonthDailyStudyData(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const out: Record<string, number> = {};
  if (!raw) return out;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthEnd = getDateStringFromTimestamp(lastDay.getTime());

    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr >= monthStart && dateStr <= monthEnd && entry) {
        out[dateStr] = entry.studySeconds ?? 0;
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** 今月の学習時間（秒）合計（study-history のみ。マージ版は study-time-today の getThisMonthStudySeconds） */
export async function getThisMonthStudySecondsFromHistory(): Promise<number> {
  const data = await getThisMonthDailyStudyData();
  return Object.values(data).reduce((sum, v) => sum + v, 0);
}

/** 全期間の学習時間（秒）合計 */
export async function getTotalStudySeconds(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    return Object.values(byDate).reduce((sum, e) => sum + (e?.studySeconds ?? 0), 0);
  } catch {
    return 0;
  }
}

/** 秒を表示用文字列にフォーマット（設計書準拠） */
export function formatStudySeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/** 指定年の学習履歴を取得（Year review 用） */
export interface YearStudySummary {
  year: number;
  totalStudySeconds: number;
  totalFlashcards: number;
  totalDictation: number;
  totalBattles: number;
  bestDay: { date: string; studySeconds: number } | null;
  daysByMonth: { month: number; studySeconds: number; days: number }[];
}

export async function getYearStudyData(year: number): Promise<YearStudySummary> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const result: YearStudySummary = {
    year,
    totalStudySeconds: 0,
    totalFlashcards: 0,
    totalDictation: 0,
    totalBattles: 0,
    bestDay: null,
    daysByMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, studySeconds: 0, days: 0 })),
  };

  if (!raw) return result;

  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    let bestSeconds = 0;
    let bestDate: string | null = null;

    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr < yearStart || dateStr > yearEnd || !entry) continue;

      result.totalStudySeconds += entry.studySeconds ?? 0;
      result.totalFlashcards += entry.flashcards ?? 0;
      result.totalDictation += entry.dictation ?? 0;
      result.totalBattles += entry.battles ?? 0;

      const sec = entry.studySeconds ?? 0;
      if (sec > bestSeconds) {
        bestSeconds = sec;
        bestDate = dateStr;
      }

      const month = parseInt(dateStr.slice(5, 7), 10);
      if (month >= 1 && month <= 12) {
        result.daysByMonth[month - 1].studySeconds += sec;
        result.daysByMonth[month - 1].days += 1;
      }
    }

    if (bestDate) {
      result.bestDay = { date: bestDate, studySeconds: bestSeconds };
    }

    return result;
  } catch {
    return result;
  }
}

/** 指定年の日別学習時間を取得（ヒートマップ用）dateStr -> studySeconds */
export async function getYearDailyStudyData(year: number): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const out: Record<string, number> = {};
  if (!raw) return out;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr >= yearStart && dateStr <= yearEnd && entry) {
        out[dateStr] = entry.studySeconds ?? 0;
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** 指定年の日別詳細（studySeconds + counts）dateStr -> StudyHistoryDay */
export async function getYearDailyStudyDataFull(year: number): Promise<Record<string, StudyHistoryDay>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const out: Record<string, StudyHistoryDay> = {};
  if (!raw) return out;
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr >= yearStart && dateStr <= yearEnd && entry) {
        out[dateStr] = entry;
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** テストデータを追加（表示確認用・開発時のみ）。2025年 + 2026年（今日含む） */
export async function seedTestDataFor2025(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const byDate: Record<string, StudyHistoryDay> = raw ? JSON.parse(raw) : {};

  const now = new Date();
  const currentYear = now.getFullYear();
  const todayStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // タップ表示の確認用: Jan 3, 2025 = Study time 5m, Flashcards 20, Dictation 2, Battles 0
  // 1分〜60分でヒートマップ4段階（なし/少し/普通/多い）を確認
  const testDays: StudyHistoryDay[] = [
    // 2025年
    { date: '2025-01-01', studySeconds: 60, flashcards: 5, dictation: 1, battles: 0 },       // 1分
    { date: '2025-01-03', studySeconds: 300, flashcards: 20, dictation: 2, battles: 0 },   // 5分（表示確認用）
    { date: '2025-01-05', studySeconds: 540, flashcards: 25, dictation: 3, battles: 1 },  // 9分
    { date: '2025-01-08', studySeconds: 600, flashcards: 30, dictation: 3, battles: 1 },   // 10分
    { date: '2025-01-10', studySeconds: 900, flashcards: 40, dictation: 4, battles: 2 },   // 15分
    { date: '2025-01-12', studySeconds: 1200, flashcards: 50, dictation: 5, battles: 2 },  // 20分
    { date: '2025-01-15', studySeconds: 1500, flashcards: 55, dictation: 6, battles: 2 },  // 25分
    { date: '2025-01-18', studySeconds: 1800, flashcards: 60, dictation: 6, battles: 3 },  // 30分
    { date: '2025-01-20', studySeconds: 2700, flashcards: 70, dictation: 8, battles: 3 },  // 45分
    { date: '2025-01-22', studySeconds: 3600, flashcards: 80, dictation: 9, battles: 4 },  // 60分
    { date: '2025-01-25', studySeconds: 120, flashcards: 8, dictation: 1, battles: 0 },    // 2分
    { date: '2025-01-28', studySeconds: 1800, flashcards: 65, dictation: 7, battles: 3 },    // 30分
    { date: '2025-01-31', studySeconds: 420, flashcards: 20, dictation: 2, battles: 1 },   // 7分
    { date: '2025-02-10', studySeconds: 2400, flashcards: 70, dictation: 7, battles: 3 },
    { date: '2025-03-08', studySeconds: 3600, flashcards: 80, dictation: 8, battles: 4 },
    { date: '2025-04-20', studySeconds: 180, flashcards: 10, dictation: 1, battles: 0 },
    { date: '2025-05-05', studySeconds: 1200, flashcards: 45, dictation: 4, battles: 2 },
    { date: '2025-06-15', studySeconds: 600, flashcards: 25, dictation: 3, battles: 1 },
    { date: '2025-07-22', studySeconds: 2700, flashcards: 60, dictation: 7, battles: 2 },
    { date: '2025-08-03', studySeconds: 90, flashcards: 5, dictation: 1, battles: 0 },
    { date: '2025-09-01', studySeconds: 1800, flashcards: 35, dictation: 6, battles: 2 },
    { date: '2025-10-12', studySeconds: 900, flashcards: 42, dictation: 5, battles: 3 },
    { date: '2025-11-22', studySeconds: 2100, flashcards: 45, dictation: 5, battles: 2 },
    { date: '2025-12-25', studySeconds: 480, flashcards: 25, dictation: 2, battles: 1 },
    // 2026年（今日含む・初期表示の年で確認しやすい）
    { date: todayStr, studySeconds: 170, flashcards: 10, dictation: 2, battles: 0 },       // 2m 50s（今日）
    { date: '2026-03-10', studySeconds: 600, flashcards: 25, dictation: 3, battles: 1 },    // 10分
    { date: '2026-03-12', studySeconds: 900, flashcards: 40, dictation: 4, battles: 0 },    // 15分
  ];

  for (const d of testDays) {
    byDate[d.date] = d;
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byDate));
}

/** 記録がある年の一覧を取得 */
export async function getAvailableYears(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const byDate: Record<string, StudyHistoryDay> = JSON.parse(raw);
    const years = new Set<number>();
    for (const dateStr of Object.keys(byDate)) {
      const y = parseInt(dateStr.slice(0, 4), 10);
      if (!isNaN(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  } catch {
    return [];
  }
}
