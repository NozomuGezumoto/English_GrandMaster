import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Speech from 'expo-speech';
import type { Question } from '../../../types/firestore';
import { ensureAudioModeForSpeech } from '../../../lib/audio-mode';
import { shuffleListeningChoices } from '../../../lib/listening-response-questions';
import {
  buildGuardianDuelSession,
  guardianDuelPassRuleLine,
  GUARDIAN_LIVES_PER_SEGMENT,
  GUARDIAN_POST_ANSWER_MS,
  GUARDIAN_QUESTION_TIME_SEC,
  GUARDIAN_SEGMENT_INTERLUDE_MS,
  isGuardianDuelPassed,
  type GuardianDuelStep,
} from '../../../lib/guardian-duel';
import {
  TOWER_GUARDIAN_CARD_ART,
  TOWER_GUARDIAN_NAMES,
  type LevelCode,
} from '../../../lib/tower-progress';
import { applyDictationMatchInputChange } from '../../../lib/dictation-match-input';
import { COLORS } from '../../../lib/theme';
import { StageBossIdentityCard } from './StageBossIdentityCard';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  levelCode: LevelCode;
  safeTop: number;
  safeBottom: number;
  sessionKey: number;
  onBack: () => void;
  onRetrySession: () => void;
  onVictory: () => Promise<void>;
};

function countSegments(list: GuardianDuelStep[]): { nChoice: number; nListen: number; nDict: number } {
  let nChoice = 0;
  let nListen = 0;
  let nDict = 0;
  for (const s of list) {
    if (s.kind === 'choice') nChoice += 1;
    else if (s.kind === 'listening') nListen += 1;
    else nDict += 1;
  }
  return { nChoice, nListen, nDict };
}

function segmentLabel(
  index: number,
  nChoice: number,
  nListen: number,
  nDict: number
): string {
  if (nChoice > 0 && index < nChoice) {
    return `Choice ${index + 1}/${nChoice}`;
  }
  if (nListen > 0 && index < nChoice + nListen) {
    return `Listening ${index - nChoice + 1}/${nListen}`;
  }
  return `Dictation ${index - nChoice - nListen + 1}/${nDict}`;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `0:${String(s).padStart(2, '0')}`;
}

function renderDictationCharSlots(correctWord: string, displayedChars: string): ReactElement[] {
  const correctWordLower = correctWord.toLowerCase();
  const displayedWithoutSpaces = displayedChars.replace(/\s/g, '');
  let displayedIndex = 0;
  const result: ReactElement[] = [];
  for (let i = 0; i < correctWordLower.length; i++) {
    if (correctWordLower[i] === ' ') {
      result.push(
        <Text key={i} style={styles.dictationPlaceholderSlot}>
          {' '}
        </Text>
      );
    } else if (displayedIndex < displayedWithoutSpaces.length) {
      result.push(
        <Text key={i} style={styles.dictationFilledChar}>
          {displayedWithoutSpaces[displayedIndex]}
        </Text>
      );
      displayedIndex += 1;
    } else {
      result.push(
        <Text key={i} style={styles.dictationPlaceholderSlot}>
          _
        </Text>
      );
    }
  }
  return result;
}

export function GuardianQuizMedley({
  levelCode,
  safeTop,
  safeBottom,
  sessionKey,
  onBack,
  onRetrySession,
  onVictory,
}: Props) {
  const list = useMemo(() => buildGuardianDuelSession(levelCode), [levelCode, sessionKey]);
  const { nChoice, nListen, nDict } = useMemo(() => countSegments(list), [list]);

  const [index, setIndex] = useState(0);
  const [interlude, setInterlude] = useState<null | 'listening' | 'dictation'>(null);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [dictationInput, setDictationInput] = useState('');
  const [displayedChars, setDisplayedChars] = useState('');
  const [isDictationCorrectLocal, setIsDictationCorrectLocal] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [doneStats, setDoneStats] = useState<{ correct: number; total: number } | null>(null);
  const [runCorrect, setRunCorrect] = useState(0);
  const [runAnswered, setRunAnswered] = useState(0);
  const [lives, setLives] = useState(GUARDIAN_LIVES_PER_SEGMENT);
  const [timeRemaining, setTimeRemaining] = useState(GUARDIAN_QUESTION_TIME_SEC);
  const [earlyFail, setEarlyFail] = useState(false);

  const correctRef = useRef(0);
  const victoryRecordedRef = useRef(false);
  const questionStartMsRef = useRef(0);
  const timeoutHandledRef = useRef(false);
  const speechSessionRef = useRef(0);
  const lastAudioKeyRef = useRef('');
  const mcAdvanceLockRef = useRef(-1);
  const dictAdvanceLockRef = useRef(-1);
  const livesRef = useRef(lives);
  const indexRef = useRef(index);
  const answeredRef = useRef(answered);
  const displayedCharsRef = useRef('');
  const dictationInputStateRef = useRef('');
  const lastWrongAudioAtRef = useRef(0);
  const dictationInputRef = useRef<TextInput>(null);

  livesRef.current = lives;
  indexRef.current = index;
  answeredRef.current = answered;

  const totalSteps = list.length;
  const step = index < totalSteps ? list[index] : null;

  useEffect(() => {
    setIndex(0);
    setInterlude(null);
    setDoneStats(null);
    setEarlyFail(false);
    correctRef.current = 0;
    victoryRecordedRef.current = false;
    setRunCorrect(0);
    setRunAnswered(0);
    setDictationInput('');
    setDisplayedChars('');
    displayedCharsRef.current = '';
    dictationInputStateRef.current = '';
    lastWrongAudioAtRef.current = 0;
    setIsDictationCorrectLocal(false);
    setIsPlayingAudio(false);
    setAnswered(false);
    setSelected(null);
    setTimedOut(false);
    setLives(GUARDIAN_LIVES_PER_SEGMENT);
    questionStartMsRef.current = 0;
    timeoutHandledRef.current = false;
    lastAudioKeyRef.current = '';
    mcAdvanceLockRef.current = -1;
    dictAdvanceLockRef.current = -1;
  }, [levelCode, sessionKey]);

  useEffect(() => {
    if (!interlude) return;
    const kind = interlude;
    const t = setTimeout(() => {
      setInterlude(null);
      if (kind === 'listening') {
        setIndex(nChoice);
        setLives(GUARDIAN_LIVES_PER_SEGMENT);
      } else {
        setIndex(nChoice + nListen);
        setLives(GUARDIAN_LIVES_PER_SEGMENT);
      }
    }, GUARDIAN_SEGMENT_INTERLUDE_MS);
    return () => clearTimeout(t);
  }, [interlude, nChoice, nListen]);

  useEffect(() => {
    const s = index < list.length ? list[index] : undefined;
    if (!s || s.kind === 'dictation') {
      setCurrentQ(null);
      setAnswered(false);
      setSelected(null);
      setTimedOut(false);
      return;
    }
    setCurrentQ(shuffleListeningChoices(s.question as Question));
    setAnswered(false);
    setSelected(null);
    setTimedOut(false);
  }, [index, list]);

  useEffect(() => {
    setDictationInput('');
    setDisplayedChars('');
    displayedCharsRef.current = '';
    dictationInputStateRef.current = '';
    lastWrongAudioAtRef.current = 0;
    setIsDictationCorrectLocal(false);
    setIsPlayingAudio(false);
    mcAdvanceLockRef.current = -1;
    dictAdvanceLockRef.current = -1;
  }, [index]);

  useEffect(() => {
    if (!doneStats || !isGuardianDuelPassed(doneStats.correct, doneStats.total)) return;
    if (victoryRecordedRef.current) return;
    victoryRecordedRef.current = true;
    onVictory().catch((e) => console.warn('[Guardian] record victory', e));
  }, [doneStats, onVictory]);

  const commitRoundEnd = useCallback(
    (wasCorrect: boolean) => {
      if (earlyFail) return;

      const cur = indexRef.current;

      /**
       * 次の index と同じフレームで MC 系を必ずリセットする。
       * さもないと index だけ進んで answered が true のまま残り、自動進行 effect が
       * mcAdvanceLockRef を先に食い、2問目でロックされて止まる。
       */
      const resetMcStateForNextQuestion = () => {
        setAnswered(false);
        setSelected(null);
        setTimedOut(false);
        mcAdvanceLockRef.current = -1;
        dictAdvanceLockRef.current = -1;
      };

      let nextLives = livesRef.current;
      if (!wasCorrect) {
        nextLives = nextLives - 1;
        setLives(nextLives);
        if (nextLives <= 0) {
          // ランクマ overall と同様: Choice / Listening でライフ尽きは「フェーズ終了」→次へ。Dictation のみ全体敗北。
          const inChoice = nChoice > 0 && cur < nChoice;
          const inListening = nListen > 0 && cur >= nChoice && cur < nChoice + nListen;

          if (inChoice) {
            resetMcStateForNextQuestion();
            setLives(GUARDIAN_LIVES_PER_SEGMENT);
            setRunCorrect(correctRef.current);
            setRunAnswered(cur + 1);
            if (nListen > 0) {
              setInterlude('listening');
            } else if (nDict > 0) {
              setInterlude('dictation');
            } else {
              setDoneStats({ correct: correctRef.current, total: cur + 1 });
              setIndex(totalSteps);
            }
            return;
          }

          if (inListening) {
            resetMcStateForNextQuestion();
            setLives(GUARDIAN_LIVES_PER_SEGMENT);
            setRunCorrect(correctRef.current);
            setRunAnswered(cur + 1);
            if (nDict > 0) {
              setInterlude('dictation');
            } else {
              setDoneStats({ correct: correctRef.current, total: cur + 1 });
              setIndex(totalSteps);
            }
            return;
          }

          setEarlyFail(true);
          return;
        }
      }
      if (wasCorrect) correctRef.current += 1;

      const nextIdx = cur + 1;

      if (nextIdx >= totalSteps) {
        resetMcStateForNextQuestion();
        const nc = correctRef.current;
        setRunCorrect(nc);
        setRunAnswered(nextIdx);
        setDoneStats({ correct: nc, total: totalSteps });
        setIndex(totalSteps);
        return;
      }

      if (nChoice > 0 && nextIdx === nChoice && cur === nChoice - 1) {
        resetMcStateForNextQuestion();
        setRunCorrect(correctRef.current);
        setRunAnswered(nextIdx);
        setInterlude('listening');
        return;
      }
      if (nListen > 0 && nextIdx === nChoice + nListen && cur === nChoice + nListen - 1) {
        resetMcStateForNextQuestion();
        setRunCorrect(correctRef.current);
        setRunAnswered(nextIdx);
        setInterlude('dictation');
        return;
      }

      resetMcStateForNextQuestion();
      setRunCorrect(correctRef.current);
      setRunAnswered(nextIdx);
      setIndex(nextIdx);
    },
    [earlyFail, totalSteps, nChoice, nListen, nDict]
  );

  const playDictationAudio = useCallback(async (word: string) => {
    const w = word.trim();
    if (!w || isPlayingAudio) return;
    setIsPlayingAudio(true);
    const sessionId = ++speechSessionRef.current;
    Speech.stop();
    return new Promise<void>(async (resolve) => {
      try {
        await ensureAudioModeForSpeech();
        if (sessionId !== speechSessionRef.current) {
          setIsPlayingAudio(false);
          resolve();
          return;
        }
        Speech.speak(w, {
          language: 'en-US',
          onDone: () => {
            if (sessionId !== speechSessionRef.current) return;
            setIsPlayingAudio(false);
            resolve();
          },
          onError: () => {
            if (sessionId !== speechSessionRef.current) return;
            setIsPlayingAudio(false);
            resolve();
          },
        });
      } catch {
        setIsPlayingAudio(false);
        resolve();
      }
    });
  }, [isPlayingAudio]);

  const handleDictationInputChange = useCallback(
    (text: string) => {
      if (!step || step.kind !== 'dictation' || answered || interlude) return;
      applyDictationMatchInputChange(text, answered, {
        correctWord: step.word.word,
        displayedCharsRef,
        dictationInputStateRef,
        lastWrongAudioAtRef,
        setDisplayedChars,
        setDictationInput,
        setIsDictationCorrectLocal,
        playDictationAudio,
        onCorrectComplete: () => setAnswered(true),
      });
    },
    [step, answered, interlude, playDictationAudio]
  );

  useEffect(() => {
    if (interlude || doneStats || earlyFail || index >= totalSteps) return;
    questionStartMsRef.current = Date.now();
    setTimeRemaining(GUARDIAN_QUESTION_TIME_SEC);
    timeoutHandledRef.current = false;
  }, [index, interlude, doneStats, earlyFail, totalSteps, sessionKey, levelCode]);

  useEffect(() => {
    if (interlude || doneStats || earlyFail || index >= totalSteps) return;

    const tick = () => {
      const start = questionStartMsRef.current;
      if (!start) return;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const rem = Math.max(0, GUARDIAN_QUESTION_TIME_SEC - elapsed);
      setTimeRemaining(rem);

      if (rem > 0 || timeoutHandledRef.current) return;
      timeoutHandledRef.current = true;

      const s = list[indexRef.current];
      if (!s) return;

      if (s.kind === 'dictation') {
        if (answeredRef.current) return;
        setIsDictationCorrectLocal(false);
        setAnswered(true);
        return;
      }

      if (!answeredRef.current) {
        setTimedOut(true);
        setAnswered(true);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [index, interlude, doneStats, earlyFail, totalSteps, list]);

  useEffect(() => {
    if (interlude || earlyFail || index >= totalSteps) return;
    const s = list[index];
    if (!s) return;

    if (s.kind === 'choice') {
      lastAudioKeyRef.current = '';
      return;
    }

    if (s.kind === 'listening' && currentQ && typeof currentQ.prompt === 'string') {
      const promptText = currentQ.prompt.trim();
      if (!promptText) return;
      const key = `l:${index}:${promptText}`;
      if (lastAudioKeyRef.current === key) return;
      lastAudioKeyRef.current = key;
      const sessionId = ++speechSessionRef.current;
      Speech.stop();
      ensureAudioModeForSpeech().then(() => {
        if (sessionId !== speechSessionRef.current) return;
        Speech.speak(promptText, { language: 'en-US' });
      });
      return;
    }

    if (s.kind === 'dictation') {
      const w = s.word.word.trim();
      if (!w) return;
      const key = `d:${index}:${w}`;
      if (lastAudioKeyRef.current === key) return;
      lastAudioKeyRef.current = key;
      void playDictationAudio(w);
    }
  }, [index, interlude, earlyFail, totalSteps, list, currentQ, playDictationAudio]);

  useEffect(() => {
    if (interlude || !step || (step.kind !== 'choice' && step.kind !== 'listening')) return;
    if (!currentQ || !answered) return;
    if (!timedOut && selected === null) return;
    if (mcAdvanceLockRef.current === index) return;
    mcAdvanceLockRef.current = index;

    const corr = typeof currentQ.answerIndex === 'number' ? currentQ.answerIndex : 0;
    const ok = !timedOut && selected !== null && selected === corr;
    const t = setTimeout(() => {
      commitRoundEnd(ok);
      setTimedOut(false);
    }, GUARDIAN_POST_ANSWER_MS);
    return () => clearTimeout(t);
  }, [interlude, step, currentQ, answered, selected, timedOut, index, commitRoundEnd]);

  useEffect(() => {
    if (interlude || !step || step.kind !== 'dictation') return;
    if (!answered) return;
    if (dictAdvanceLockRef.current === index) return;
    dictAdvanceLockRef.current = index;

    const t = setTimeout(() => commitRoundEnd(isDictationCorrectLocal), GUARDIAN_POST_ANSWER_MS);
    return () => clearTimeout(t);
  }, [interlude, step, answered, isDictationCorrectLocal, index, commitRoundEnd]);

  const handlePlay = () => {
    if (!currentQ) return;
    ensureAudioModeForSpeech().then(() => {
      Speech.speak(String(currentQ.prompt ?? ''), { language: 'en-US' });
    });
  };

  const handleSelect = (i: number) => {
    if (answered || interlude) return;
    setSelected(i);
    setAnswered(true);
  };

  const renderLifeHearts = (n: number, total = GUARDIAN_LIVES_PER_SEGMENT) => (
    <View style={styles.heartsRow}>
      {Array.from({ length: total }, (_, i) => (
        <Text
          key={i}
          style={[styles.heartIcon, i < n ? styles.heartIconActive : styles.heartIconInactive]}
        >
          {i < n ? '♥' : '♡'}
        </Text>
      ))}
    </View>
  );

  const timerUrgent = timeRemaining <= 8 && timeRemaining > 0 && !interlude;

  if (totalSteps === 0) {
    return (
      <View style={[styles.pad, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← Back</Text>
        </Pressable>
        <Text style={styles.emptyTitle}>No questions</Text>
        <Text style={styles.emptyBody}>No pool data for {levelCode}.</Text>
      </View>
    );
  }

  if (earlyFail) {
    return (
      <View style={[styles.pad, styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Text style={[styles.doneTitle, styles.doneTitleFail]}>Duel lost</Text>
        <Text style={styles.doneSub}>You ran out of lives in the dictation phase.</Text>
        <Text style={styles.doneRule}>
          Choice and listening: losing all lives ends only that phase (like ranked overall). Dictation: no lives left ends the duel.
        </Text>
        <View style={styles.resultBtnRow}>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onRetrySession}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onBack}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (index >= totalSteps && doneStats) {
    const passed = isGuardianDuelPassed(doneStats.correct, doneStats.total);
    const pct = Math.round((doneStats.correct / doneStats.total) * 100);
    return (
      <View style={[styles.pad, styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Text style={[styles.doneTitle, !passed && styles.doneTitleFail]}>
          {passed ? 'Guardian defeated' : 'Not cleared'}
        </Text>
        <Text style={styles.doneSub}>
          {doneStats.correct} / {doneStats.total} correct ({pct}%)
        </Text>
        <Text style={styles.doneRule}>{guardianDuelPassRuleLine(doneStats.total)}</Text>
        {passed ? (
          <Text style={styles.unlockHint}>This band is mastered on the Guardian Gate.</Text>
        ) : null}
        <View style={styles.resultBtnRow}>
          {!passed ? (
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onRetrySession}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          ) : null}
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onBack}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (interlude) {
    return (
      <View style={[styles.center, styles.interludeWrap, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Text style={styles.interludeKicker}>Next phase</Text>
        <Text style={styles.interludeTitle}>
          {interlude === 'listening' ? 'Listening' : 'Dictation'}
        </Text>
        <Text style={styles.interludeBody}>Lives restored to {GUARDIAN_LIVES_PER_SEGMENT}</Text>
      </View>
    );
  }

  if (!step) {
    return (
      <View style={[styles.center, { paddingTop: safeTop }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const sessionLine = `${totalSteps} max · ${GUARDIAN_QUESTION_TIME_SEC}s/question · Lives ${GUARDIAN_LIVES_PER_SEGMENT}/phase · 0 lives in choice/listening → next phase (ranked overall)`;

  const battleHud = (
    <View style={styles.battleHudStack}>
      <StageBossIdentityCard
        heroSource={TOWER_GUARDIAN_CARD_ART[levelCode]}
        bossName={TOWER_GUARDIAN_NAMES[levelCode]}
        levelCode={levelCode}
      />

      <View style={styles.battlePlayerTimerPanel}>
        <View style={styles.battlePlayerTimerRow}>
          <View style={styles.battlePlayerBlock}>
            <Text style={styles.battlePlayerLabel}>You</Text>
            {renderLifeHearts(lives)}
          </View>
          <View style={styles.battleTimerBlock}>
            <Text style={[styles.battleTimerDigits, timerUrgent && styles.timerUrgent]}>
              {formatTime(timeRemaining)}
            </Text>
            <View style={styles.timerTrack}>
              <View
                style={[
                  styles.timerFill,
                  { flex: Math.max(0.001, timeRemaining) },
                  timerUrgent && styles.timerFillUrgent,
                ]}
              />
              <View style={{ flex: Math.max(0.001, GUARDIAN_QUESTION_TIME_SEC - timeRemaining) }} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (step.kind === 'dictation') {
    const dictShowResult = answered;
    const scoreCorrect = dictShowResult
      ? runCorrect + (isDictationCorrectLocal ? 1 : 0)
      : runCorrect;
    const scoreAnswered = dictShowResult ? runAnswered + 1 : runAnswered;
    const dictWord = step.word.word.trim();
    return (
      <ScrollView
        style={[styles.scroll, styles.scrollFlex]}
        contentContainerStyle={{ paddingTop: safeTop + 8, paddingBottom: safeBottom + 24, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable onPress={onBack}>
            <Text style={styles.linkBack}>← Back</Text>
          </Pressable>
          <Text style={styles.progress}>
            {levelCode} · {index + 1}/{totalSteps}
          </Text>
        </View>
        {battleHud}
        <Text style={styles.sessionRule}>{sessionLine}</Text>
        <Text style={styles.phaseTag}>{segmentLabel(index, nChoice, nListen, nDict)}</Text>
        <Text style={styles.scoreLine}>
          Total correct: {scoreCorrect} / {scoreAnswered}
        </Text>
        <Text style={styles.autoHint}>Audio plays automatically · Tap Play again to replay</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>Type what you hear (one letter at a time).</Text>
          {step.word.definition ? (
            <Text style={styles.dictationDefinition}>{step.word.definition}</Text>
          ) : null}
          <Text style={styles.dictationCharRow}>{renderDictationCharSlots(step.word.word, displayedChars)}</Text>
          <Pressable
            style={[styles.playBtn, isPlayingAudio && styles.playBtnDisabled]}
            onPress={() => dictWord && playDictationAudio(dictWord)}
            disabled={!dictWord || isPlayingAudio}
          >
            <Text style={styles.playBtnText}>🔊 Play again</Text>
          </Pressable>
          <TextInput
            ref={dictationInputRef}
            style={styles.dictationInputField}
            value={dictationInput}
            onChangeText={handleDictationInputChange}
            placeholder="Type here"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!answered}
          />
          {answered ? (
            <>
              <Text
                style={[styles.dictResult, isDictationCorrectLocal ? styles.dictOk : styles.dictBad]}
              >
                {isDictationCorrectLocal ? 'Correct' : `Answer: ${step.word.word}`}
              </Text>
              {step.word.definition ? <Text style={styles.defText}>{step.word.definition}</Text> : null}
              <Text style={styles.autoAdvanceHint}>Next in {GUARDIAN_POST_ANSWER_MS / 1000}s…</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  const q = currentQ;
  if (!q) {
    return (
      <View style={[styles.center, { paddingTop: safeTop }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const correct = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  const listeningMode = step.kind === 'listening';
  const showResult = answered && (selected !== null || timedOut);
  const scoreCorrect =
    showResult && !timedOut && selected !== null
      ? runCorrect + (selected === correct ? 1 : 0)
      : timedOut
        ? runCorrect
        : runCorrect;
  const scoreAnswered =
    showResult && !timedOut && selected !== null
      ? runAnswered + 1
      : timedOut
        ? runAnswered + 1
        : runAnswered;

  return (
    <ScrollView
      style={[styles.scroll, styles.scrollFlex]}
      contentContainerStyle={{ paddingTop: safeTop + 8, paddingBottom: safeBottom + 24, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← Back</Text>
        </Pressable>
        <Text style={styles.progress}>
          {levelCode} · {index + 1}/{totalSteps}
        </Text>
      </View>
      {battleHud}
      <Text style={styles.sessionRule}>{sessionLine}</Text>
      <Text style={styles.phaseTag}>{segmentLabel(index, nChoice, nListen, nDict)}</Text>
      <Text style={styles.scoreLine}>
        Total correct: {scoreCorrect} / {scoreAnswered}
      </Text>
      {listeningMode ? (
        <Text style={styles.autoHint}>Audio plays automatically · Tap Play to replay</Text>
      ) : null}

      <View style={styles.card}>
        {listeningMode ? (
          <>
            <Pressable style={styles.playBtn} onPress={handlePlay}>
              <Text style={styles.playBtnText}>Play</Text>
            </Pressable>
            <Text style={styles.hint}>Tap Play to hear the prompt, then choose an answer.</Text>
          </>
        ) : null}

        {q.type === 'reading' && q.passage ? (
          <View style={styles.passageBox}>
            <Text style={styles.passageLabel}>Passage</Text>
            <Text style={styles.passageText}>{q.passage}</Text>
          </View>
        ) : null}

        {!listeningMode ? (
          <Text style={styles.prompt}>{q.prompt}</Text>
        ) : showResult ? (
          <Text style={styles.prompt}>{q.prompt}</Text>
        ) : null}

        {!showResult ? (
          <View style={styles.choices}>
            {choices.map((c, i) => (
              <Pressable key={i} style={styles.choice} onPress={() => handleSelect(i)}>
                <Text style={styles.choiceText}>
                  {String.fromCharCode(65 + i)}. {c}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.choices}>
              {choices.map((c, i) => {
                const ok = i === correct;
                const bad = selected !== null && i === selected && !ok;
                return (
                  <View key={i} style={[styles.choice, ok && styles.choiceOk, bad && styles.choiceBad]}>
                    <Text style={[styles.choiceText, ok && styles.choiceTextOk, bad && styles.choiceTextBad]}>
                      {String.fromCharCode(65 + i)}. {c}
                      {ok ? ' ✓' : ''}
                      {bad ? ' ✗' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
            {q.explanation ? (
              <View style={styles.explainBox}>
                <Text style={styles.explainLabel}>Explanation</Text>
                <Text style={styles.explainText}>{q.explanation}</Text>
              </View>
            ) : null}
            <Text style={styles.autoAdvanceHint}>Next in {GUARDIAN_POST_ANSWER_MS / 1000}s…</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: {},
  scrollFlex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  interludeWrap: { paddingHorizontal: 28 },
  interludeKicker: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: '#A8CCFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  interludeTitle: {
    fontFamily: FONT.display,
    fontSize: 28,
    color: '#DCC495',
    fontWeight: '800',
    marginBottom: 12,
  },
  interludeBody: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkBack: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gold,
  },
  progress: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: COLORS.muted,
    letterSpacing: 0.3,
  },
  battleHudStack: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 14,
    gap: 10,
  },
  battlePlayerTimerPanel: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.38)',
    backgroundColor: 'rgba(6, 10, 18, 0.88)',
  },
  battlePlayerTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  battlePlayerBlock: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingRight: 4,
    minWidth: 72,
    flexShrink: 0,
  },
  battlePlayerLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(180, 196, 218, 0.92)',
    marginBottom: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  battleTimerBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  battleTimerDigits: {
    fontFamily: FONT.body,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
    alignSelf: 'stretch',
  },
  heartsRow: { flexDirection: 'row', gap: 8 },
  heartIcon: { fontSize: 20, lineHeight: 24 },
  heartIconActive: { color: '#E86A7A' },
  heartIconInactive: { color: 'rgba(120, 130, 150, 0.45)' },
  timerUrgent: { color: '#F0A87A' },
  timerTrack: {
    flexDirection: 'row',
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(42, 61, 90, 0.55)',
  },
  timerFill: {
    backgroundColor: 'rgba(143, 182, 255, 0.75)',
    borderRadius: 4,
  },
  timerFillUrgent: {
    backgroundColor: 'rgba(240, 120, 100, 0.85)',
  },
  sessionRule: {
    fontFamily: FONT.body,
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(140, 156, 178, 0.82)',
    marginBottom: 8,
    letterSpacing: 0.15,
  },
  phaseTag: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: '700',
    color: '#A8CCFF',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  scoreLine: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: '700',
    color: '#DCC495',
    marginBottom: 8,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  autoHint: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: 'rgba(160, 184, 220, 0.85)',
    marginBottom: 10,
  },
  autoAdvanceHint: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: 'rgba(180, 198, 228, 0.9)',
    marginTop: 14,
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(10, 14, 22, 0.92)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.35)',
    padding: 18,
  },
  playBtnDisabled: {
    opacity: 0.45,
  },
  dictationDefinition: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 8,
  },
  dictationCharRow: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  dictationPlaceholderSlot: {
    fontFamily: FONT.display,
    fontSize: 22,
    color: 'rgba(164, 176, 196, 0.55)',
  },
  dictationFilledChar: {
    fontFamily: FONT.display,
    fontSize: 22,
    color: COLORS.gold,
    fontWeight: '700',
  },
  dictationInputField: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT.body,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(143, 182, 255, 0.45)',
    marginBottom: 10,
  },
  playBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '700',
    color: '#A4C4FF',
  },
  hint: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 14,
  },
  passageBox: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
  },
  passageLabel: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: '#A8CCFF',
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  passageText: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  prompt: {
    fontFamily: FONT.body,
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 24,
    marginBottom: 16,
  },
  choices: { gap: 10 },
  choice: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(42, 61, 90, 0.9)',
    backgroundColor: 'rgba(23, 35, 52, 0.6)',
  },
  choiceOk: { borderColor: 'rgba(80, 200, 120, 0.6)' },
  choiceBad: { borderColor: 'rgba(220, 100, 100, 0.55)' },
  choiceText: { fontFamily: FONT.body, fontSize: 15, color: COLORS.text },
  choiceTextOk: { color: '#8FE0A8' },
  choiceTextBad: { color: '#F0A0A0' },
  explainBox: { marginTop: 14 },
  explainLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: '#A8CCFF',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  explainText: { fontFamily: FONT.body, fontSize: 14, color: COLORS.muted, lineHeight: 21 },
  nextBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(198, 167, 94, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
  },
  nextBtnText: {
    fontFamily: FONT.display,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT.body,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dictResult: { marginTop: 14, fontFamily: FONT.body, fontSize: 16, fontWeight: '700' },
  dictOk: { color: '#8FE0A8' },
  dictBad: { color: '#F0A0A0' },
  defText: { marginTop: 8, fontFamily: FONT.body, fontSize: 14, color: COLORS.muted, lineHeight: 20 },
  emptyTitle: {
    fontFamily: FONT.display,
    fontSize: 22,
    color: COLORS.gold,
    marginTop: 20,
  },
  emptyBody: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    lineHeight: 20,
  },
  doneTitle: {
    fontFamily: FONT.display,
    fontSize: 26,
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  doneTitleFail: {
    color: '#C98A8A',
  },
  doneSub: { fontFamily: FONT.body, fontSize: 14, color: COLORS.muted, marginTop: 8, marginBottom: 8 },
  doneRule: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  unlockHint: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: '#A8CCFF',
    marginTop: 14,
    textAlign: 'center',
  },
  resultBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 28,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(10, 14, 22, 0.9)',
  },
  btnPressed: { opacity: 0.88 },
  btnText: { fontFamily: FONT.body, fontSize: 14, fontWeight: '700', color: COLORS.gold },
});
