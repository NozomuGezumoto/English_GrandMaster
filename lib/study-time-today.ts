/**
 * 今日の学習時間（AsyncStorage）
 * 問題ごとに上限を設け、解いた分だけ加算。
 * 放置で増えない / 問題を解いた分だけ増える / モードごとに妥当
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  incrementStudyHistory,
  getThisMonthDailyStudyData,
  getYearDailyStudyData,
  getYearDailyStudyDataFull,
  getYearStudyData,
  type StudyHistoryMode,
} from './study-history';
import type { YearStudySummary } from './study-history';

const STORAGE_KEY = '@studyTimeToday';
const MAX_DAYS_TO_KEEP = 14; // 週単位目標用に2週間分保持

export type StudyTimeMode = 'flashcards' | 'dictation' | 'choice' | 'listening' | 'battle';

interface StudyTimeByDate {
  date: string;
  flashcards: number;
  dictation: number;
  choice: number;
  listening: number;
  battle: number;
}

function getTodayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateStringFromTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** モードごとの1問あたり上限（秒） */
export const MAX_SECONDS_PER_ITEM: Record<StudyTimeMode, number> = {
  flashcards: 30,
  dictation: 60,
  choice: 45,
  listening: 90,
  battle: 90,
};

/** 学習時間を加算（上限付き、問題を解いた時に呼ぶ） */
export async function addStudyTimeToday(
  mode: StudyTimeMode,
  elapsedSeconds: number
): Promise<void> {
  const capped = Math.min(
    Math.max(0, Math.floor(elapsedSeconds)),
    MAX_SECONDS_PER_ITEM[mode]
  );
  if (capped <= 0) return;

  const today = getTodayLocalDateString();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const byDate: Record<string, StudyTimeByDate> = raw ? JSON.parse(raw) : {};

  if (!byDate[today]) {
    byDate[today] = {
      date: today,
      flashcards: 0,
      dictation: 0,
      choice: 0,
      listening: 0,
      battle: 0,
    };
  }
  byDate[today][mode] += capped;

  // 古い日付を削除
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS_TO_KEEP);
  const cutoffStr = getDateStringFromTimestamp(cutoff.getTime());
  const filtered: Record<string, StudyTimeByDate> = {};
  for (const [k, v] of Object.entries(byDate)) {
    if (k >= cutoffStr) filtered[k] = v;
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

  // 学習履歴（@studyHistory）にも記録（Total study / Year review 用）
  // 失敗時は1回リトライし、それでも失敗したらログ出力
  const counts: { flashcards?: number; dictation?: number; battles?: number } = {};
  if (mode === 'flashcards') counts.flashcards = 1;
  if (mode === 'dictation') counts.dictation = 1;
  if (mode === 'battle') counts.battles = 1;
  const doIncrement = () =>
    incrementStudyHistory(mode as StudyHistoryMode, capped, Object.keys(counts).length ? counts : undefined);
  doIncrement().catch(async (err) => {
    console.error('[study-time-today] incrementStudyHistory failed, retrying:', err);
    try {
      await doIncrement();
    } catch (retryErr) {
      console.error('[study-time-today] incrementStudyHistory retry failed:', retryErr);
    }
  });
}

/** 今日の合計学習時間（秒）を取得 */
export async function getTodayStudyTimeSeconds(): Promise<number> {
  const today = getTodayLocalDateString();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const byDate: Record<string, StudyTimeByDate> = JSON.parse(raw);
    const entry = byDate[today];
    if (!entry) return 0;
    return (entry.flashcards ?? 0) + (entry.dictation ?? 0) + (entry.choice ?? 0) + (entry.listening ?? 0) + (entry.battle ?? 0);
  } catch {
    return 0;
  }
}

/** 今週（月曜始まり）の合計学習時間（秒）を取得 */
export async function getThisWeekStudyTimeSeconds(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const byDate: Record<string, StudyTimeByDate> = JSON.parse(raw);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const weekStartStr = getDateStringFromTimestamp(monday.getTime());

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekEndStr = getDateStringFromTimestamp(sunday.getTime());

    let total = 0;
    for (const [dateStr, entry] of Object.entries(byDate)) {
      if (dateStr >= weekStartStr && dateStr <= weekEndStr && entry) {
        total += (entry.flashcards ?? 0) + (entry.dictation ?? 0) + (entry.choice ?? 0) + (entry.listening ?? 0) + (entry.battle ?? 0);
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function getEntryTotalSeconds(entry: StudyTimeByDate | undefined): number {
  if (!entry) return 0;
  return (entry.flashcards ?? 0) + (entry.dictation ?? 0) + (entry.choice ?? 0) + (entry.listening ?? 0) + (entry.battle ?? 0);
}

/** 今月の学習時間（秒）合計。study-time-today と study-history をマージ（同期ズレ時も正しく表示） */
export async function getThisMonthStudySeconds(): Promise<number> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = getDateStringFromTimestamp(lastDay.getTime());

  const [rawToday, historyByDate] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY),
    getThisMonthDailyStudyData(),
  ]);

  const byDateToday: Record<string, StudyTimeByDate> = rawToday ? JSON.parse(rawToday) : {};
  const allDates = new Set<string>([
    ...Object.keys(byDateToday).filter((d) => d >= monthStart && d <= monthEnd),
    ...Object.keys(historyByDate),
  ]);

  let total = 0;
  for (const dateStr of allDates) {
    if (dateStr < monthStart || dateStr > monthEnd) continue;
    const todayVal = getEntryTotalSeconds(byDateToday[dateStr]);
    const historyVal = historyByDate[dateStr] ?? 0;
    total += Math.max(todayVal, historyVal);
  }
  return total;
}

export interface DayStudyDetail {
  studySeconds: number;
  flashcards: number;
  dictation: number;
  battles: number;
}

/** 指定年の日別詳細（マージ版）。studySeconds + Flashcards/Dictation/Battles の内訳。タップで表示用 */
export async function getYearDailyStudyDataWithCounts(year: number): Promise<Record<string, DayStudyDetail>> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [rawToday, historyFull] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY),
    getYearDailyStudyDataFull(year),
  ]);

  const byDateToday: Record<string, StudyTimeByDate> = rawToday ? JSON.parse(rawToday) : {};
  const merged: Record<string, DayStudyDetail> = {};
  const allDates = new Set<string>([
    ...Object.keys(byDateToday).filter((d) => d >= yearStart && d <= yearEnd),
    ...Object.keys(historyFull),
  ]);

  for (const dateStr of allDates) {
    if (dateStr < yearStart || dateStr > yearEnd) continue;
    const todaySec = getEntryTotalSeconds(byDateToday[dateStr]);
    const h = historyFull[dateStr];
    const historySec = h?.studySeconds ?? 0;
    merged[dateStr] = {
      studySeconds: Math.max(todaySec, historySec),
      flashcards: h?.flashcards ?? 0,
      dictation: h?.dictation ?? 0,
      battles: h?.battles ?? 0,
    };
  }
  return merged;
}

/** 指定年の日別学習時間（マージ版）。Year review カレンダー用。study-time-today と study-history をマージ */
export async function getYearDailyStudyDataMerged(year: number): Promise<Record<string, number>> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [rawToday, historyDaily] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY),
    getYearDailyStudyData(year),
  ]);

  const byDateToday: Record<string, StudyTimeByDate> = rawToday ? JSON.parse(rawToday) : {};
  const merged: Record<string, number> = { ...historyDaily };

  for (const [dateStr, entry] of Object.entries(byDateToday)) {
    if (dateStr < yearStart || dateStr > yearEnd) continue;
    const todayVal = getEntryTotalSeconds(entry);
    const historyVal = historyDaily[dateStr] ?? 0;
    merged[dateStr] = Math.max(todayVal, historyVal);
  }
  return merged;
}

/** 指定年の学習サマリー（マージ版）。Year review の Total カード用 */
export async function getYearStudyDataMerged(year: number): Promise<YearStudySummary> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [historySummary, mergedDaily, historyDaily, rawToday] = await Promise.all([
    getYearStudyData(year),
    getYearDailyStudyDataMerged(year),
    getYearDailyStudyData(year),
    AsyncStorage.getItem(STORAGE_KEY),
  ]);

  const byDateToday: Record<string, StudyTimeByDate> = rawToday ? JSON.parse(rawToday) : {};

  const result: YearStudySummary = {
    year,
    totalStudySeconds: Object.values(mergedDaily).reduce((s, v) => s + v, 0),
    totalFlashcards: historySummary.totalFlashcards,
    totalDictation: historySummary.totalDictation,
    totalBattles: historySummary.totalBattles,
    bestDay: null,
    daysByMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, studySeconds: 0, days: 0 })),
  };

  let bestSeconds = 0;
  let bestDate: string | null = null;
  for (const [dateStr, sec] of Object.entries(mergedDaily)) {
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
  if (bestDate) result.bestDay = { date: bestDate, studySeconds: bestSeconds };

  // study-history に無い日は study-time-today からカウントを補完
  for (const [dateStr, entry] of Object.entries(byDateToday)) {
    if (dateStr < yearStart || dateStr > yearEnd) continue;
    const todaySec = getEntryTotalSeconds(entry);
    const historySec = historyDaily[dateStr] ?? 0;
    if (todaySec > 0 && historySec === 0) {
      if ((entry.flashcards ?? 0) > 0) result.totalFlashcards += 1;
      if ((entry.dictation ?? 0) > 0) result.totalDictation += 1;
      if ((entry.battle ?? 0) > 0) result.totalBattles += 1;
    }
  }

  return result;
}
