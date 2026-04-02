import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { StudyQuestion } from '../../../lib/study-questions';
import { ensureAudioModeForSpeech } from '../../../lib/audio-mode';
import { shuffleListeningChoices } from '../../../lib/listening-response-questions';
import { TOWER_TYPE_LABELS, type LevelCode, type TowerType } from '../../../lib/tower-progress';
import { getTowerSessionItemKey } from '../../../lib/tower-questions';
import { applyDictationMatchInputChange } from '../../../lib/dictation-match-input';
import { COLORS } from '../../../lib/theme';
import { StageBossIdentityCard, type StageBossIdentity } from './StageBossIdentityCard';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

/** タワー・ディクテ1語あたり（タイムアウトで不正解確定。ランクマ 20s に近い） */
const TOWER_DICTATION_QUESTION_SEC = 25;

function formatTowerDictTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `0:${String(s).padStart(2, '0')}`;
}

export type TowerQuizPassRule = {
  isPassed: (correct: number, total: number) => boolean;
  /** 結果画面の合格条件の説明 */
  resultRuleLine: (total: number) => string;
  /** 出題中ヘッダー下の1行 */
  sessionRuleLine: (total: number) => string;
  /** 合格時のサブ文言（null で非表示） */
  successHint: string | null;
  /** 合格時タイトル */
  passTitle: string;
  /** 不合格時タイトル */
  failTitle: string;
  onRecordPass: () => Promise<void>;
};

type ChoiceProps = {
  towerType: TowerType;
  levelCode: LevelCode;
  questions: (Question | StudyQuestion)[];
  listeningMode: boolean;
  safeTop: number;
  safeBottom: number;
  onBack: () => void;
  onRetrySession: () => void;
  formatProgress: (currentIndex: number, total: number) => string;
  passRule: TowerQuizPassRule;
  /** ステージ桶 / 帯の総数など */
  poolSummaryLine?: string;
  /** セッション完了時（合格・不合格どちらでも）その回の正解キー */
  onSessionFinished?: (payload: { correctKeys: string[] }) => void;
  /** 頂ボス戦のみ：ステージボスの画像・名前（ガーディアン対戦と同一 UI） */
  stageBossIdentity?: StageBossIdentity | null;
};

export function TowerChoiceQuizFlow({
  towerType,
  levelCode,
  questions,
  listeningMode,
  safeTop,
  safeBottom,
  onBack,
  onRetrySession,
  formatProgress,
  passRule,
  poolSummaryLine,
  onSessionFinished,
  stageBossIdentity,
}: ChoiceProps) {
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<Question | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [doneStats, setDoneStats] = useState<{ correct: number; total: number } | null>(null);
  const [runCorrect, setRunCorrect] = useState(0);
  const [runAnswered, setRunAnswered] = useState(0);
  const correctRef = useRef(0);
  const correctKeysRef = useRef<string[]>([]);
  const recordedRef = useRef(false);
  const passRuleRef = useRef(passRule);
  passRuleRef.current = passRule;
  const speechSessionRef = useRef(0);
  const lastAutoListenKeyRef = useRef('');

  useEffect(() => {
    lastAutoListenKeyRef.current = '';
  }, [questions]);

  useEffect(() => {
    setIndex(0);
    setDoneStats(null);
    correctRef.current = 0;
    correctKeysRef.current = [];
    recordedRef.current = false;
    setRunCorrect(0);
    setRunAnswered(0);
  }, [questions]);

  useEffect(() => {
    if (questions.length === 0 || index >= questions.length) {
      setCurrent(null);
      return;
    }
    const q = shuffleListeningChoices(questions[index] as Question);
    setCurrent(q);
    setAnswered(false);
    setSelected(null);
  }, [index, questions]);

  useEffect(() => {
    if (!doneStats || !passRuleRef.current.isPassed(doneStats.correct, doneStats.total)) return;
    if (recordedRef.current) return;
    recordedRef.current = true;
    passRuleRef.current.onRecordPass().catch((e) => console.warn('[Tower] record pass', e));
  }, [doneStats]);

  useEffect(() => {
    if (!doneStats) return;
    onSessionFinished?.({ correctKeys: [...correctKeysRef.current] });
  }, [doneStats, onSessionFinished]);

  useEffect(() => {
    if (!listeningMode || !current) return;
    const promptText = typeof current.prompt === 'string' ? current.prompt.trim() : '';
    if (!promptText) return;
    const key = `listen:${index}:${promptText}`;
    if (lastAutoListenKeyRef.current === key) return;
    lastAutoListenKeyRef.current = key;
    const sessionId = ++speechSessionRef.current;
    Speech.stop();
    ensureAudioModeForSpeech().then(() => {
      if (sessionId !== speechSessionRef.current) return;
      Speech.speak(promptText, { language: 'en-US' });
    });
  }, [listeningMode, current, index]);

  const handlePlay = () => {
    if (!current) return;
    const promptText = typeof current.prompt === 'string' ? current.prompt.trim() : '';
    if (!promptText) return;
    const sessionId = ++speechSessionRef.current;
    Speech.stop();
    ensureAudioModeForSpeech().then(() => {
      if (sessionId !== speechSessionRef.current) return;
      Speech.speak(promptText, { language: 'en-US' });
    });
  };

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
  };

  const handleNext = () => {
    if (!current) return;
    const corr = typeof current.answerIndex === 'number' ? current.answerIndex : 0;
    if (selected !== null && selected === corr) {
      correctRef.current += 1;
      correctKeysRef.current.push(getTowerSessionItemKey(towerType, levelCode, current as Question | StudyQuestion));
    }
    const nc = correctRef.current;
    const na = index + 1;
    setRunCorrect(nc);
    setRunAnswered(na);
    if (index + 1 < questions.length) {
      setIndex((x) => x + 1);
    } else {
      setDoneStats({ correct: nc, total: questions.length });
      setIndex(questions.length);
    }
  };

  if (questions.length === 0) {
    return (
      <View style={[styles.pad, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← {TOWER_TYPE_LABELS[towerType]}</Text>
        </Pressable>
        <Text style={styles.emptyTitle}>No questions</Text>
        <Text style={styles.emptyBody}>
          No items in this pool for {levelCode}. Add data or pick another band.
        </Text>
      </View>
    );
  }

  if (index >= questions.length && doneStats) {
    const passed = passRuleRef.current.isPassed(doneStats.correct, doneStats.total);
    const pct = Math.round((doneStats.correct / doneStats.total) * 100);
    return (
      <View style={[styles.pad, styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Text style={[styles.doneTitle, !passed && styles.doneTitleFail]}>
          {passed ? passRuleRef.current.passTitle : passRuleRef.current.failTitle}
        </Text>
        <Text style={styles.doneSub}>
          {doneStats.correct} / {doneStats.total} correct ({pct}%)
        </Text>
        <Text style={styles.doneRule}>{passRuleRef.current.resultRuleLine(doneStats.total)}</Text>
        {passed && passRuleRef.current.successHint ? (
          <Text style={styles.unlockHint}>{passRuleRef.current.successHint}</Text>
        ) : null}
        <View style={styles.resultBtnRow}>
          {!passed ? (
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onRetrySession}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          ) : null}
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onBack}>
            <Text style={styles.btnText}>← Back to tower</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const q = current;
  if (!q) {
    return (
      <View style={[styles.center, { paddingTop: safeTop }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const correct = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  const showResult = answered && selected !== null;
  const scoreCorrect =
    showResult && selected !== null ? runCorrect + (selected === correct ? 1 : 0) : runCorrect;
  const scoreAnswered = showResult && selected !== null ? runAnswered + 1 : runAnswered;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: safeTop + 8, paddingBottom: safeBottom + 24, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← Back</Text>
        </Pressable>
        <Text style={styles.progress}>{formatProgress(index, questions.length)}</Text>
      </View>
      {stageBossIdentity ? <StageBossIdentityCard {...stageBossIdentity} /> : null}
      <Text style={styles.sessionRule}>{passRuleRef.current.sessionRuleLine(questions.length)}</Text>
      {poolSummaryLine ? <Text style={styles.poolSummary}>{poolSummaryLine}</Text> : null}
      <Text style={styles.scoreLine}>
        Total correct: {scoreCorrect} / {scoreAnswered}
      </Text>

      <View style={styles.card}>
        {listeningMode ? (
          <>
            <Pressable style={styles.playBtn} onPress={handlePlay}>
              <Text style={styles.playBtnText}>Play</Text>
            </Pressable>
            <Text style={styles.hint}>Audio plays automatically · Tap Play to replay</Text>
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
                const bad = i === selected && !ok;
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
            <Pressable style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>{index + 1 < questions.length ? 'Next' : 'Finish'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

type DictationProps = {
  towerType: TowerType;
  levelCode: LevelCode;
  words: { word: string; definition: string }[];
  safeTop: number;
  safeBottom: number;
  onBack: () => void;
  onRetrySession: () => void;
  formatProgress: (currentIndex: number, total: number) => string;
  passRule: TowerQuizPassRule;
  poolSummaryLine?: string;
  onSessionFinished?: (payload: { correctKeys: string[] }) => void;
  stageBossIdentity?: StageBossIdentity | null;
};

export function TowerDictationQuizFlow({
  towerType,
  levelCode,
  words,
  safeTop,
  safeBottom,
  onBack,
  onRetrySession,
  formatProgress,
  passRule,
  poolSummaryLine,
  onSessionFinished,
  stageBossIdentity,
}: DictationProps) {
  const [index, setIndex] = useState(0);
  const [dictationInput, setDictationInput] = useState('');
  const [displayedChars, setDisplayedChars] = useState('');
  const [isDictationCorrectLocal, setIsDictationCorrectLocal] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(TOWER_DICTATION_QUESTION_SEC);
  const [doneStats, setDoneStats] = useState<{ correct: number; total: number } | null>(null);
  const [runCorrect, setRunCorrect] = useState(0);
  const [runAnswered, setRunAnswered] = useState(0);
  const correctRef = useRef(0);
  const correctKeysRef = useRef<string[]>([]);
  const recordedRef = useRef(false);
  const passRuleRef = useRef(passRule);
  passRuleRef.current = passRule;
  const speechSessionRef = useRef(0);
  const lastAutoDictKeyRef = useRef('');
  const displayedCharsRef = useRef('');
  const dictationInputStateRef = useRef('');
  const lastWrongAudioAtRef = useRef(0);
  const dictationInputRef = useRef<TextInput>(null);
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  const questionStartMsRef = useRef(0);
  const timeoutHandledRef = useRef(false);

  const entry = words[index];

  useEffect(() => {
    lastAutoDictKeyRef.current = '';
  }, [words]);

  useEffect(() => {
    setIndex(0);
    setDoneStats(null);
    correctRef.current = 0;
    correctKeysRef.current = [];
    recordedRef.current = false;
    setRunCorrect(0);
    setRunAnswered(0);
  }, [words]);

  useEffect(() => {
    setDictationInput('');
    setDisplayedChars('');
    displayedCharsRef.current = '';
    dictationInputStateRef.current = '';
    lastWrongAudioAtRef.current = 0;
    setIsDictationCorrectLocal(false);
    setAnswered(false);
    setIsPlayingAudio(false);
    lastAutoDictKeyRef.current = '';
    questionStartMsRef.current = Date.now();
    timeoutHandledRef.current = false;
    setTimeRemaining(TOWER_DICTATION_QUESTION_SEC);
  }, [index, words]);

  useEffect(() => {
    if (!doneStats || !passRuleRef.current.isPassed(doneStats.correct, doneStats.total)) return;
    if (recordedRef.current) return;
    recordedRef.current = true;
    passRuleRef.current.onRecordPass().catch((e) => console.warn('[Tower] record pass', e));
  }, [doneStats]);

  useEffect(() => {
    if (!doneStats) return;
    onSessionFinished?.({ correctKeys: [...correctKeysRef.current] });
  }, [doneStats, onSessionFinished]);

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

  useEffect(() => {
    if (index >= words.length) return;
    const e = words[index];
    if (!e) return;
    const w = e.word.trim();
    if (!w) return;
    const key = `dict:${index}:${w}`;
    if (lastAutoDictKeyRef.current === key) return;
    lastAutoDictKeyRef.current = key;
    void playDictationAudio(w);
  }, [index, words, playDictationAudio]);

  useEffect(() => {
    if (!entry || index >= words.length || answered) return;
    const tick = () => {
      if (answeredRef.current) return;
      const elapsed = Math.floor((Date.now() - questionStartMsRef.current) / 1000);
      const rem = Math.max(0, TOWER_DICTATION_QUESTION_SEC - elapsed);
      setTimeRemaining(rem);
      if (rem > 0 || timeoutHandledRef.current) return;
      timeoutHandledRef.current = true;
      setIsDictationCorrectLocal(false);
      setAnswered(true);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [index, entry?.word, words.length, entry, answered]);

  const handleDictationInputChange = useCallback(
    (text: string) => {
      if (!entry || answered) return;
      applyDictationMatchInputChange(text, answered, {
        correctWord: entry.word,
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
    [entry, answered, playDictationAudio]
  );

  const speak = () => {
    if (!entry) return;
    void playDictationAudio(entry.word);
  };

  const next = () => {
    if (!answered || !entry) return;
    if (isDictationCorrectLocal) {
      correctRef.current += 1;
      correctKeysRef.current.push(getTowerSessionItemKey(towerType, levelCode, entry));
    }
    const nc = correctRef.current;
    const na = index + 1;
    setRunCorrect(nc);
    setRunAnswered(na);
    if (index + 1 < words.length) {
      setIndex((i) => i + 1);
    } else {
      setDoneStats({ correct: nc, total: words.length });
      setIndex(words.length);
    }
  };

  if (words.length === 0) {
    return (
      <View style={[styles.pad, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← {TOWER_TYPE_LABELS[towerType]}</Text>
        </Pressable>
        <Text style={styles.emptyTitle}>No words</Text>
        <Text style={styles.emptyBody}>No dictation words in this pool for {levelCode}.</Text>
      </View>
    );
  }

  if (index >= words.length && doneStats) {
    const passed = passRuleRef.current.isPassed(doneStats.correct, doneStats.total);
    const pct = Math.round((doneStats.correct / doneStats.total) * 100);
    return (
      <View style={[styles.pad, styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <Text style={[styles.doneTitle, !passed && styles.doneTitleFail]}>
          {passed ? passRuleRef.current.passTitle : passRuleRef.current.failTitle}
        </Text>
        <Text style={styles.doneSub}>
          {doneStats.correct} / {doneStats.total} correct ({pct}%)
        </Text>
        <Text style={styles.doneRule}>{passRuleRef.current.resultRuleLine(doneStats.total)}</Text>
        {passed && passRuleRef.current.successHint ? (
          <Text style={styles.unlockHint}>{passRuleRef.current.successHint}</Text>
        ) : null}
        <View style={styles.resultBtnRow}>
          {!passed ? (
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onRetrySession}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          ) : null}
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onBack}>
            <Text style={styles.btnText}>← Back to tower</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const scoreCorrect = answered ? runCorrect + (isDictationCorrectLocal ? 1 : 0) : runCorrect;
  const scoreAnswered = answered ? runAnswered + 1 : runAnswered;
  const timerUrgent = timeRemaining <= 8 && timeRemaining > 0 && !answered;
  const dictWord = entry?.word?.trim() ?? '';

  const renderTowerDictCharSlotsLocal = (correctWord: string, displayedChars: string): ReactElement[] => {
    const correctWordLower = correctWord.toLowerCase();
    const displayedWithoutSpaces = displayedChars.replace(/\s/g, '');
    let displayedIndex = 0;
    const result: ReactElement[] = [];
    for (let i = 0; i < correctWordLower.length; i++) {
      if (correctWordLower[i] === ' ') {
        result.push(
          <Text key={i} style={styles.towerDictSlotEmpty}>
            {' '}
          </Text>
        );
      } else if (displayedIndex < displayedWithoutSpaces.length) {
        result.push(
          <Text key={i} style={styles.towerDictSlotFilled}>
            {displayedWithoutSpaces[displayedIndex]}
          </Text>
        );
        displayedIndex += 1;
      } else {
        result.push(
          <Text key={i} style={styles.towerDictSlotEmpty}>
            _
          </Text>
        );
      }
    }
    return result;
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: safeTop + 8, paddingBottom: safeBottom + 24, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.linkBack}>← Back</Text>
        </Pressable>
        <Text style={styles.progress}>{formatProgress(index, words.length)}</Text>
      </View>
      {stageBossIdentity ? <StageBossIdentityCard {...stageBossIdentity} /> : null}
      <Text style={styles.sessionRule}>{passRuleRef.current.sessionRuleLine(words.length)}</Text>
      {poolSummaryLine ? <Text style={styles.poolSummary}>{poolSummaryLine}</Text> : null}
      <Text style={[styles.dictTimerLine, timerUrgent && styles.dictTimerUrgent]}>
        Time {formatTowerDictTime(timeRemaining)} · {TOWER_DICTATION_QUESTION_SEC}s per word
      </Text>
      <Text style={styles.scoreLine}>
        Total correct: {scoreCorrect} / {scoreAnswered}
      </Text>

      <View style={styles.card}>
        <Text style={styles.hint}>
          One letter at a time (ranked / Guardian). Completes when correct; wrong letter replays audio (cooldown). Auto-plays on each word.
        </Text>
        <Pressable
          style={[styles.playBtn, isPlayingAudio && styles.playBtnDisabled]}
          onPress={speak}
          disabled={!dictWord || isPlayingAudio}
        >
          <Text style={styles.playBtnText}>🔊 Play word</Text>
        </Pressable>
        {entry?.definition ? <Text style={styles.dictDefLine}>{entry.definition}</Text> : null}
        <Text style={styles.towerDictCharRow}>{renderTowerDictCharSlotsLocal(entry?.word ?? '', displayedChars)}</Text>
        <TextInput
          ref={dictationInputRef}
          style={styles.towerDictInput}
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
            <Text style={[styles.dictResult, isDictationCorrectLocal ? styles.dictOk : styles.dictBad]}>
              {isDictationCorrectLocal ? 'Correct' : `Answer: ${entry?.word ?? ''}`}
            </Text>
            {entry?.definition ? <Text style={styles.defText}>{entry.definition}</Text> : null}
            <Pressable style={styles.nextBtn} onPress={next}>
              <Text style={styles.nextBtnText}>{index + 1 < words.length ? 'Next' : 'Finish'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  sessionRule: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: 'rgba(160, 174, 192, 0.95)',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  poolSummary: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: 'rgba(180, 198, 228, 0.92)',
    marginBottom: 6,
    letterSpacing: 0.15,
    fontVariant: ['tabular-nums'],
  },
  scoreLine: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: '700',
    color: '#DCC495',
    marginBottom: 12,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: 'rgba(10, 14, 22, 0.92)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.35)',
    padding: 18,
  },
  playBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(143, 182, 255, 0.45)',
    marginTop: 8,
    marginBottom: 10,
  },
  playBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '700',
    color: '#A4C4FF',
  },
  playBtnDisabled: {
    opacity: 0.45,
  },
  dictTimerLine: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  dictTimerUrgent: {
    color: '#F0A87A',
  },
  dictDefLine: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    marginBottom: 10,
  },
  towerDictCharRow: {
    fontFamily: FONT.display,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  towerDictSlotEmpty: {
    fontFamily: FONT.display,
    fontSize: 20,
    color: 'rgba(164, 176, 196, 0.55)',
  },
  towerDictSlotFilled: {
    fontFamily: FONT.display,
    fontSize: 20,
    color: COLORS.gold,
    fontWeight: '700',
  },
  towerDictInput: {
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
