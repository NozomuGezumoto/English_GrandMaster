/**
 * ランクマッチのディクテーション入力ロジック（1文字ずつ検証・誤字時に単語再生・完成で即完了）。
 * `app/match/[id].tsx` と Guardian などで共有。
 */

import type { MutableRefObject } from 'react';

export type DictationMatchInputDeps = {
  /** 正解語（表示・スペース含む。Study の単語など） */
  correctWord: string;
  displayedCharsRef: MutableRefObject<string>;
  dictationInputStateRef: MutableRefObject<string>;
  lastWrongAudioAtRef: MutableRefObject<number>;
  setDisplayedChars: (s: string) => void;
  setDictationInput: (s: string) => void;
  setIsDictationCorrectLocal: (v: boolean) => void;
  playDictationAudio: (word: string) => void;
  /** 正解確定時（完成した表示文字列） */
  onCorrectComplete: (finalDisplayed: string) => void;
};

/**
 * `TextInput` の `onChangeText` にそのまま渡す。
 */
export function applyDictationMatchInputChange(
  text: string,
  answered: boolean,
  deps: DictationMatchInputDeps
): void {
  const raw = deps.correctWord.trim();
  if (!raw || answered) return;

  const textWithoutSpaces = text.replace(/\s/g, '').toLowerCase();
  const correctWord = raw.toLowerCase();
  const correctWordWithoutSpaces = correctWord.replace(/\s/g, '');

  const currentDisplayedChars = deps.displayedCharsRef.current || '';
  const displayedWithoutSpaces = currentDisplayedChars.replace(/\s/g, '');
  const displayedLength = displayedWithoutSpaces.length;

  if (textWithoutSpaces.length >= correctWordWithoutSpaces.length) {
    if (textWithoutSpaces === correctWordWithoutSpaces) {
      let newDisplayed = '';
      let correctIndex = 0;
      for (let i = 0; i < correctWordWithoutSpaces.length; i++) {
        while (correctIndex < correctWord.length && correctWord[correctIndex] === ' ') {
          newDisplayed += ' ';
          correctIndex++;
        }
        if (correctIndex < correctWord.length) {
          newDisplayed += correctWordWithoutSpaces[i];
          correctIndex++;
        }
      }
      deps.displayedCharsRef.current = newDisplayed;
      deps.dictationInputStateRef.current = newDisplayed;
      deps.setDisplayedChars(newDisplayed);
      deps.setDictationInput(newDisplayed);
      deps.setIsDictationCorrectLocal(true);
      deps.onCorrectComplete(newDisplayed);
      return;
    }
    return;
  }

  if (textWithoutSpaces.length < displayedLength) {
    let newDisplayed = '';
    let correctIndex = 0;
    for (let i = 0; i < textWithoutSpaces.length; i++) {
      while (correctIndex < correctWord.length && correctWord[correctIndex] === ' ') {
        newDisplayed += ' ';
        correctIndex++;
      }
      if (correctIndex < correctWord.length) {
        newDisplayed += textWithoutSpaces[i];
        correctIndex++;
      }
    }
    deps.displayedCharsRef.current = newDisplayed;
    deps.dictationInputStateRef.current = newDisplayed;
    deps.setDictationInput(newDisplayed);
    deps.setDisplayedChars(newDisplayed);
    return;
  }

  const newInput = textWithoutSpaces.slice(displayedLength);
  if (newInput.length === 0) {
    return;
  }

  const currentDisplayedWithoutSpaces = deps.displayedCharsRef.current.replace(/\s/g, '');
  let processedInput = currentDisplayedWithoutSpaces;
  let newDisplayed = '';
  let correctIndex = 0;
  let processedLength = currentDisplayedWithoutSpaces.length;

  for (let inputIdx = 0; inputIdx < newInput.length; inputIdx++) {
    const nextInputChar = newInput[inputIdx];
    const nextCorrectChar = correctWordWithoutSpaces[processedLength];

    if (nextInputChar === nextCorrectChar) {
      let tempDisplayed = '';
      let tempCorrectIndex = 0;
      const tempProcessedLength = processedLength + 1;

      for (let i = 0; i < tempProcessedLength; i++) {
        while (tempCorrectIndex < correctWord.length && correctWord[tempCorrectIndex] === ' ') {
          tempDisplayed += ' ';
          tempCorrectIndex++;
        }
        if (tempCorrectIndex < correctWord.length) {
          if (i < processedLength) {
            tempDisplayed += processedInput[i];
          } else {
            tempDisplayed += nextInputChar;
          }
          tempCorrectIndex++;
        }
      }

      let charCount = 0;
      for (let i = 0; i < correctWord.length; i++) {
        if (correctWord[i] !== ' ') {
          charCount++;
          if (charCount === tempProcessedLength) {
            if (i + 1 < correctWord.length && correctWord[i + 1] === ' ') {
              tempDisplayed += ' ';
            }
            break;
          }
        }
      }

      newDisplayed = tempDisplayed;
      processedInput += nextInputChar;
      processedLength++;

      if (processedLength === correctWordWithoutSpaces.length) {
        const finalDisplayedWithoutSpaces = newDisplayed.replace(/\s/g, '');
        if (finalDisplayedWithoutSpaces === correctWordWithoutSpaces) {
          deps.displayedCharsRef.current = newDisplayed;
          deps.dictationInputStateRef.current = newDisplayed;
          deps.setDisplayedChars(newDisplayed);
          deps.setDictationInput(newDisplayed);
          deps.setIsDictationCorrectLocal(true);
          deps.onCorrectComplete(newDisplayed);
          return;
        }
      }
    } else {
      const now = Date.now();
      if (now - deps.lastWrongAudioAtRef.current >= 3000) {
        deps.lastWrongAudioAtRef.current = now;
        if (raw) deps.playDictationAudio(raw);
      }
      break;
    }
  }

  if (newDisplayed.length > 0) {
    deps.displayedCharsRef.current = newDisplayed;
    deps.dictationInputStateRef.current = newDisplayed;
    deps.setDisplayedChars(newDisplayed);
    deps.setDictationInput(newDisplayed);
  }
}
