/**
 * 学習時間目標の設定（AsyncStorage）
 * 一日あたり or 週単位で目標分数を設定
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@studyTimeTarget';

export type StudyTimeTargetMode = 'daily' | 'weekly';

export interface StudyTimeTarget {
  mode: StudyTimeTargetMode;
  /** 目標分数（daily: 1日あたり, weekly: 1週間あたり） */
  minutes: number;
}

const DEFAULT: StudyTimeTarget = {
  mode: 'daily',
  minutes: 30,
};

/** 目標設定を取得 */
export async function getStudyTimeTarget(): Promise<StudyTimeTarget> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<StudyTimeTarget>;
    return {
      mode: parsed.mode === 'weekly' ? 'weekly' : 'daily',
      minutes: typeof parsed.minutes === 'number' && parsed.minutes > 0 ? Math.floor(parsed.minutes) : DEFAULT.minutes,
    };
  } catch {
    return DEFAULT;
  }
}

/** 目標設定を保存 */
export async function setStudyTimeTarget(target: StudyTimeTarget): Promise<void> {
  const toSave: StudyTimeTarget = {
    mode: target.mode === 'weekly' ? 'weekly' : 'daily',
    minutes: Math.max(1, Math.floor(target.minutes)),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}
