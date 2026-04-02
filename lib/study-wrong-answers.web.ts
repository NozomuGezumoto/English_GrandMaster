/**
 * Study モード（Dictation / Listening Quiz）で間違えた問題をローカルに記録。
 * Web 用: localStorage で永続化。
 */

import type { Question } from '../types/firestore';

const KEY_DICTATION = 'studyWrongDictation';
const KEY_LISTENING = 'studyWrongListening';
const MAX_ITEMS = 200;

export interface StudyWrongDictationEntry {
  word: string;
  level: number;
  wrongAt: number;
  deckId?: string;
  deckName?: string;
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

function getStored<T>(key: string): T[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStored(key: string, items: unknown[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {}
}

export async function addStudyWrongDictation(entry: Omit<StudyWrongDictationEntry, 'wrongAt'>): Promise<void> {
  const list = getStored<StudyWrongDictationEntry>(KEY_DICTATION);
  list.push({ ...entry, wrongAt: Date.now() });
  setStored(KEY_DICTATION, list);
}

export async function getStudyWrongDictation(): Promise<StudyWrongDictationEntry[]> {
  const list = getStored<StudyWrongDictationEntry>(KEY_DICTATION);
  return list.sort((a, b) => b.wrongAt - a.wrongAt);
}

export async function addStudyWrongListening(entry: {
  question: Question;
  userChoiceIndex: number;
}): Promise<void> {
  const list = getStored<StudyWrongListeningEntry>(KEY_LISTENING);
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
  setStored(KEY_LISTENING, list);
}

export async function getStudyWrongListening(): Promise<StudyWrongListeningEntry[]> {
  const list = getStored<StudyWrongListeningEntry>(KEY_LISTENING);
  return list.sort((a, b) => b.wrongAt - a.wrongAt);
}

export async function clearStudyWrongDictation(): Promise<void> {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEY_DICTATION);
  } catch {}
}

export async function clearStudyWrongListening(): Promise<void> {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEY_LISTENING);
  } catch {}
}
