/**
 * Study モード（Dictation / Listening Quiz）で間違えた問題をローカルに記録。
 * AsyncStorage で永続化。対戦の「間違った回答」は Firestore のまま。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '../types/firestore';

const KEY_DICTATION = 'studyWrongDictation';
const KEY_LISTENING = 'studyWrongListening';
const MAX_ITEMS = 200;

export interface StudyWrongDictationEntry {
  word: string;
  level: number; // ToeicLevel の数値 (400, 600, ...)
  wrongAt: number;
}

export interface StudyWrongListeningEntry {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  level: number;
  userChoiceIndex: number;
  wrongAt: number;
}

async function getStored<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setStored(key: string, items: unknown[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items.slice(-MAX_ITEMS)));
}

/** Dictation で間違えた語を追加 */
export async function addStudyWrongDictation(entry: Omit<StudyWrongDictationEntry, 'wrongAt'>): Promise<void> {
  const list = await getStored<StudyWrongDictationEntry>(KEY_DICTATION);
  list.push({ ...entry, wrongAt: Date.now() });
  await setStored(KEY_DICTATION, list);
}

/** Dictation の間違えた一覧を取得（新しい順） */
export async function getStudyWrongDictation(): Promise<StudyWrongDictationEntry[]> {
  const list = await getStored<StudyWrongDictationEntry>(KEY_DICTATION);
  return list.sort((a, b) => b.wrongAt - a.wrongAt);
}

/** Listening Quiz で間違えた問題を追加 */
export async function addStudyWrongListening(entry: {
  question: Question;
  userChoiceIndex: number;
}): Promise<void> {
  const list = await getStored<StudyWrongListeningEntry>(KEY_LISTENING);
  const q = entry.question;
  list.push({
    prompt: q.prompt ?? '',
    choices: Array.isArray(q.choices) ? q.choices : [],
    answerIndex: typeof q.answerIndex === 'number' ? q.answerIndex : 0,
    explanation: q.explanation ?? '',
    level: typeof q.level === 'number' ? q.level : 0,
    userChoiceIndex: entry.userChoiceIndex,
    wrongAt: Date.now(),
  });
  await setStored(KEY_LISTENING, list);
}

/** Listening Quiz の間違えた一覧を取得（新しい順） */
export async function getStudyWrongListening(): Promise<StudyWrongListeningEntry[]> {
  const list = await getStored<StudyWrongListeningEntry>(KEY_LISTENING);
  return list.sort((a, b) => b.wrongAt - a.wrongAt);
}

/** Dictation の記録をクリア */
export async function clearStudyWrongDictation(): Promise<void> {
  await AsyncStorage.removeItem(KEY_DICTATION);
}

/** Listening Quiz の記録をクリア */
export async function clearStudyWrongListening(): Promise<void> {
  await AsyncStorage.removeItem(KEY_LISTENING);
}
