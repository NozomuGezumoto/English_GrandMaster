import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput, Image, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef, useCallback, type ReactElement } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, functions } from '../../lib/firebase';
import { getAvatarUrl } from '../../lib/avatar-utils';
import { httpsCallable } from 'firebase/functions';
import { Match, Question, User as FirestoreUser, TierType } from '../../types/firestore';

const TIER_INFO: Record<TierType, { piece: string; label: string }> = {
  pawn: { piece: '♙', label: 'Pawn' },
  knight: { piece: '♘', label: 'Knight' },
  bishop: { piece: '♗', label: 'Bishop' },
  rook: { piece: '♖', label: 'Rook' },
  queen: { piece: '♕', label: 'Queen' },
  king: { piece: '♔', label: 'King' },
};

/** Firestore の Timestamp または { seconds, nanoseconds } をミリ秒に変換（カウントダウン用） */
function getTimestampMillis(t: unknown): number {
  if (!t || typeof t !== 'object') return 0;
  const a = t as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof a.toMillis === 'function') return a.toMillis();
  if (typeof a.seconds === 'number') return a.seconds * 1000 + ((a.nanoseconds ?? 0) / 1e6);
  return 0;
}

import { normalizeQuestion, getCorrectWord } from '../../lib/question-utils';
import { getQuestionById, isLocalQuestionId } from '../../lib/study-questions';
import { getListeningQuestionById, isListeningQuestionId, shuffleListeningChoices, shuffleListeningChoicesWithSeed } from '../../lib/listening-response-questions';
import { ensureAudioModeForSpeech, unlockAudioOnUserGesture, unlockAudioOnUserGestureAsync, unlockAudioOnUserGestureSync } from '../../lib/audio-mode';
import { COLORS } from '../../lib/theme';
import { playBattleSound } from '../../lib/battle-sound';
import { playClickSound, preloadClickSound } from '../../lib/click-sound';
import { preloadWinSound } from '../../lib/win-sound';
import * as Speech from 'expo-speech';

/** TTS phrase played when user checks "Enable sound" before listening. Change here to use a different cue (e.g. 'beep'). */
const PHASE_RESULT_UNLOCK_SPEECH = 'Get ready';

/** overall のときはインデックスから問題種別を算出。順序は 4択→リスニング→ディクテーション */
function getEffectiveQuestionType(match: Match, qIndex: number): 'choice' | 'dictation' | 'listening' {
  if (match.questionType !== 'overall') return match.questionType as 'choice' | 'dictation' | 'listening';
  const choiceCount = match.choiceCount ?? 10;
  const listeningCount = match.listeningCount ?? 10;
  const dictationCount = match.dictationCount ?? 5;
  if (qIndex < choiceCount) return 'choice';
  if (qIndex < choiceCount + listeningCount) return 'listening';
  return 'dictation';
}

export default function MatchScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [match, setMatch] = useState<Match | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  // ディクテーション用の状態
  const [dictationInput, setDictationInput] = useState<string>('');
  const [displayedChars, setDisplayedChars] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isDictationCorrectLocal, setIsDictationCorrectLocal] = useState<boolean>(false); // ローカルで正解フラグを保持
  const dictationInputRef = useRef<TextInput>(null);
  const prevQuestionIndexRef = useRef<number>(-1);
  const questionStartTimeRef = useRef<number>(0); // 現在の問題の開始時刻
  const timeoutHandledRef = useRef<boolean>(false); // タイムアウト処理が実行されたかどうか
  // 実機での状態同期を確実にするためのref
  const displayedCharsRef = useRef<string>('');
  const dictationInputStateRef = useRef<string>('');
  const lastWrongAudioAtRef = useRef<number>(0); // 間違えたときの音声再生のクールダウン用（3秒）
  const [myUser, setMyUser] = useState<{ displayName: string; avatarUrl?: string } | null>(null);
  const [opponentUser, setOpponentUser] = useState<{ displayName: string; avatarUrl?: string } | null>(null);
  // ランクマッチ：マッチング成功時の演出用（相手情報表示）
  const [showOpponentFoundScreen, setShowOpponentFoundScreen] = useState(false);
  const [opponentFoundData, setOpponentFoundData] = useState<{ displayName: string; avatarUrl?: string; rating: number; tier?: TierType } | null>(null);
  const opponentScreenDismissedRef = useRef(false);
  const [opponentScreenDismissed, setOpponentScreenDismissed] = useState(false);
  const opponentDataFetchedRef = useRef(false);
  /** 両者が「準備完了」を押すまでゲーム開始しない：準備完了送信中 */
  const [readySubmitting, setReadySubmitting] = useState(false);
  /** Begin Battle 押下で startGameCountdown を呼ぶ送信中 */
  const [beginBattleSubmitting, setBeginBattleSubmitting] = useState(false);
  /** ゲーム開始・フェーズ切り替えのカウントダウン用（1秒ごとに再描画） */
  const [countdownTick, setCountdownTick] = useState(0);
  // 両者回答済みから最低1秒経ってから次問題表示（2問目以降でサーバー遅延が効かない対策）
  const bothAnsweredAtRef = useRef<number>(0);
  const lastQIndexBothAnsweredRef = useRef<number>(-1);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 4択でサーバーから返す正解の choiceIndex（answerIndex をクライアントに渡さないため） */
  const [correctChoiceByQIndex, setCorrectChoiceByQIndex] = useState<Record<number, number>>({});
  /** サーバーから返った正誤（correctChoiceIndex が来ない場合の表示用） */
  const [serverIsCorrectByQIndex, setServerIsCorrectByQIndex] = useState<Record<number, boolean>>({});
  /** GrandMaster(overall): セグメント結果「4択の勝者」「リスニングの勝者」を見たあと次へ進むための dismiss 済みインデックス */
  const [dismissedPhaseResultAt, setDismissedPhaseResultAt] = useState<number | null>(null);
  /** セグメント勝者画面で Continue を押したか。押したらローカル 3 秒カウントダウン開始 */
  const [phaseResultAcknowledgedAt, setPhaseResultAcknowledgedAt] = useState<number | null>(null);
  const phaseCountdownStartsAtRef = useRef<number>(0);
  /** セグメント結果で Continue 送信中（両者押すまでカウント開始しない） */
  const [phaseContinueSubmitting, setPhaseContinueSubmitting] = useState(false);
  /** いま表示中のフェーズ結果の dismissIndex（携帯で勝者画面を飛ばさないよう、フェーズが変わったら承認をリセット） */
  const lastPhaseResultDismissIndexRef = useRef<number>(-1);
  /** タイマー effect の依存を安定させるため（onSnapshot で match が変わるたびに effect が走ると PC でタイマーが進まない） */
  const handleAnswerRef = useRef<((choiceIndex: number, forceTimeout?: boolean) => Promise<void>) | null>(null);
  const handleDictationSubmitRef = useRef<((textAnswer: string) => Promise<void>) | null>(null);
  /** 相手画面を閉じたあと初回だけ問題をロードしたか（2問目以降は onSnapshot 側でロードする） */
  const firstQuestionLoadedRef = useRef(false);
  /** リスニング/ディクテーションの音声を「画面切り替え後」に1回だけ再生するための qIndex */
  const lastAudioPlayedForQIndexRef = useRef<number>(-1);
  /** いま表示中の currentQuestion がどの qIndex 用か（再生する問題の一致判定用） */
  const currentQuestionForIndexRef = useRef<number>(-1);
  /** 相手発見画面で battle.mp3 を1回だけ再生したか */
  const battleSoundPlayedRef = useRef(false);
  /** 携帯でリスニング/ディクテーションの自動再生を許可したか（「音声を再生する」チェックのタップでのみ true にする） */
  const audioAcknowledgedForMatchRef = useRef(false);
  /** リスニング前の Continue で「音声を再生する」にチェックしたか（チェック必須で Continue を有効にする） */
  const [phaseResultAudioChecked, setPhaseResultAudioChecked] = useState(false);
  /** セグメント開始問題（リスニング1問目・ディクテーション1問目）でカウント終了時にタイマーをリセットしたか */
  const segmentStartTimerInitializedRef = useRef<number>(-1);
  /** リスニング1問目をカウント終了後にロードするため（onSnapshot ではロードしない） */
  const pendingFirstListeningLoadRef = useRef(false);
  /** ディクテーション1問目をカウント終了後にロードするため */
  const pendingFirstDictationLoadRef = useRef(false);
  /** AI対戦：モバイルでリスニング/ディクテーション時に「音声を有効化」をタップしたか（effect 再実行用） */
  const [aiSoundEnabledTrigger, setAiSoundEnabledTrigger] = useState(0);

  // GrandMaster: マッチが変わったらセグメント結果の dismiss 状態をリセット
  useEffect(() => {
    setDismissedPhaseResultAt(null);
  }, [id]);

  // Continue や「Play again」でクリック音を鳴らすため、マッチ画面でもプリロード
  useEffect(() => {
    if (id) preloadClickSound();
  }, [id]);

  // ゲーム開始・フェーズ切り替えのカウントダウン用：サーバー時刻基準で再描画
  useEffect(() => {
    if (!match) return;
    const toMillis = (t: unknown) => (t && typeof (t as { toMillis?: () => number }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : 0);
    const gameStartsAtMs = toMillis(match.gameStartsAt);
    const listeningStartsAtMs = toMillis(match.listeningPhaseStartsAt);
    const dictationStartsAtMs = toMillis(match.dictationPhaseStartsAt);
    const now = Date.now();
    const needTick = (gameStartsAtMs > now) || (listeningStartsAtMs > now) || (dictationStartsAtMs > now);
    if (!needTick) return;
    const interval = setInterval(() => setCountdownTick((c) => c + 1), 200);
    return () => clearInterval(interval);
  }, [match?.gameStartsAt, match?.listeningPhaseStartsAt, match?.dictationPhaseStartsAt, match]);

  // 相手発見画面で 3 秒カウントダウンが終わったら自動で閉じる
  useEffect(() => {
    if (!showOpponentFoundScreen || !match || (match.mode !== 'ranked' && match.mode !== 'friend')) return;
    const gameStartsAtMs = getTimestampMillis(match.gameStartsAt);
    if (gameStartsAtMs <= 0) return;
    if (gameStartsAtMs > Date.now()) return;
    opponentScreenDismissedRef.current = true;
    setOpponentScreenDismissed(true);
    setShowOpponentFoundScreen(false);
  }, [showOpponentFoundScreen, match?.id, match?.mode, match?.gameStartsAt, countdownTick]);

  // マッチング成立後・Ready 待ち画面で battle.mp3 を1回再生（プリロードはバトルタブのタップ時に実施）
  useEffect(() => {
    if (!showOpponentFoundScreen || !match || (match.mode !== 'ranked' && match.mode !== 'friend')) return;
    if (battleSoundPlayedRef.current) return;
    battleSoundPlayedRef.current = true;
    playBattleSound();
  }, [showOpponentFoundScreen, match?.id, match?.mode]);

  // When phase result screen type changes, update ref for "waiting for opponent" UI only.
  // Do NOT reset phaseResultAudioChecked here: one check should enable sound for the rest of the match.
  useEffect(() => {
    if (!match) return;
    const choiceCount = match.choiceCount ?? 10;
    const listeningCount = match.listeningCount ?? 10;
    const qIndexForPhase = match.currentQuestionIndex ?? 0;
    const showPhaseChoiceResult = match.questionType === 'overall' && match.status === 'playing' && qIndexForPhase === choiceCount && match.phaseChoiceWinnerUid != null && dismissedPhaseResultAt !== choiceCount;
    const showPhaseListeningResult = match.questionType === 'overall' && match.status === 'playing' && qIndexForPhase === choiceCount + listeningCount && match.phaseListeningWinnerUid != null && dismissedPhaseResultAt !== (choiceCount + listeningCount);
    if (!showPhaseChoiceResult && !showPhaseListeningResult) return;
    const dismissIndex = showPhaseChoiceResult ? choiceCount : choiceCount + listeningCount;
    if (lastPhaseResultDismissIndexRef.current !== dismissIndex) {
      lastPhaseResultDismissIndexRef.current = dismissIndex;
    }
  }, [match?.questionType, match?.status, match?.currentQuestionIndex, match?.phaseChoiceWinnerUid, match?.phaseListeningWinnerUid, dismissedPhaseResultAt, match?.choiceCount, match?.listeningCount]);

  // フェーズ切り替え：サーバーが設定したカウント終了時刻を過ぎたら次へ
  useEffect(() => {
    if (!match) return;
    const choiceCount = match.choiceCount ?? 10;
    const listeningCount = match.listeningCount ?? 10;
    const qIndexForPhase = match.currentQuestionIndex ?? 0;
    const showPhaseChoiceResult = match.questionType === 'overall' && match.status === 'playing' && qIndexForPhase === choiceCount && match.phaseChoiceWinnerUid != null && dismissedPhaseResultAt !== choiceCount;
    const showPhaseListeningResult = match.questionType === 'overall' && match.status === 'playing' && qIndexForPhase === choiceCount + listeningCount && match.phaseListeningWinnerUid != null && dismissedPhaseResultAt !== (choiceCount + listeningCount);
    const phaseStartsAtMs = showPhaseChoiceResult ? getTimestampMillis(match.listeningPhaseStartsAt) : showPhaseListeningResult ? getTimestampMillis(match.dictationPhaseStartsAt) : 0;
    if (phaseStartsAtMs <= 0) return;
    if (phaseStartsAtMs > Date.now()) return;
    if (showPhaseChoiceResult) setDismissedPhaseResultAt(choiceCount);
    else if (showPhaseListeningResult) setDismissedPhaseResultAt(choiceCount + listeningCount);
  }, [match, dismissedPhaseResultAt, countdownTick]);

  // セグメント開始時：カウントダウンが終わって画面が切り替わったタイミングでタイマーを 20 秒にリセット（snapshot で先に問題がロードされていてもカウント中は減らさない）
  useEffect(() => {
    if (!match || match.status !== 'playing') return;
    const choiceCount = match.choiceCount ?? 10;
    const listeningCount = match.listeningCount ?? 10;
    const qIndex = match.currentQuestionIndex ?? 0;
    const firstListeningQ = match.questionType === 'overall' && qIndex === choiceCount;
    const firstDictationQ = match.questionType === 'overall' && qIndex === choiceCount + listeningCount;
    if (firstListeningQ && dismissedPhaseResultAt === choiceCount && segmentStartTimerInitializedRef.current !== choiceCount) {
      segmentStartTimerInitializedRef.current = choiceCount;
      questionStartTimeRef.current = Date.now();
      setTimeRemaining(20);
      timeoutHandledRef.current = false;
    } else if (firstDictationQ && dismissedPhaseResultAt === choiceCount + listeningCount && segmentStartTimerInitializedRef.current !== choiceCount + listeningCount) {
      segmentStartTimerInitializedRef.current = choiceCount + listeningCount;
      questionStartTimeRef.current = Date.now();
      setTimeRemaining(20);
      timeoutHandledRef.current = false;
    } else if (!firstListeningQ && !firstDictationQ) {
      segmentStartTimerInitializedRef.current = -1;
    }
  }, [match?.status, match?.currentQuestionIndex, match?.questionType, match?.choiceCount, match?.listeningCount, dismissedPhaseResultAt]);

  // リスニング1問目をカウント終了後にロード（問題開始＝画面切り替えのタイミング）
  useEffect(() => {
    if (!match || match.status !== 'playing' || dismissedPhaseResultAt !== (match.choiceCount ?? 10)) return;
    if (!pendingFirstListeningLoadRef.current) return;
    const choiceCount = match.choiceCount ?? 10;
    const qIndex = choiceCount;
    if ((match.currentQuestionIndex ?? 0) !== qIndex) return;
    // 既にこの問題をロード済み（ユーザーが回答欄を押したあと onSnapshot で match が更新され pending が立つなど）なら再ロードしない
    if (currentQuestionForIndexRef.current === qIndex) {
      pendingFirstListeningLoadRef.current = false;
      return;
    }
    const questionIds = match.questionIds ?? [];
    if (qIndex >= questionIds.length) return;
    pendingFirstListeningLoadRef.current = false;
    const questionId = questionIds[qIndex];
    const normalized = getListeningQuestionById(questionId);
    if (!normalized) return;
    const shuffled = id != null ? shuffleListeningChoicesWithSeed(normalized, `${id}-${qIndex}`) : normalized;
    setCorrectChoiceByQIndex((prev) => ({ ...prev, [qIndex]: shuffled.answerIndex ?? 0 }));
    currentQuestionForIndexRef.current = qIndex;
    setCurrentQuestion(shuffled);
    prevQuestionIndexRef.current = qIndex;
    setAnswered(false);
    setSelectedChoice(null);
    const now = Date.now();
    questionStartTimeRef.current = now;
    setTimeRemaining(20);
    timeoutHandledRef.current = false;
    if (segmentStartTimerInitializedRef.current !== choiceCount) {
      segmentStartTimerInitializedRef.current = choiceCount;
    }
  }, [match?.status, match?.currentQuestionIndex, match?.questionIds, match?.choiceCount, dismissedPhaseResultAt, id]);

  // ディクテーション1問目をカウント終了後にロード（問題開始＝画面切り替えのタイミング）
  useEffect(() => {
    const choiceCount = match?.choiceCount ?? 10;
    const listeningCount = match?.listeningCount ?? 10;
    const dictationStart = choiceCount + listeningCount;
    if (!match || match.status !== 'playing' || dismissedPhaseResultAt !== dictationStart) return;
    if (!pendingFirstDictationLoadRef.current) return;
    const qIndex = dictationStart;
    if ((match.currentQuestionIndex ?? 0) !== qIndex) return;
    const questionIds = match.questionIds ?? [];
    if (qIndex >= questionIds.length) return;
    pendingFirstDictationLoadRef.current = false;
    (async () => {
      const questionId = questionIds[qIndex];
      let normalized: Question | null = null;
      if (isListeningQuestionId(questionId)) {
        normalized = getListeningQuestionById(questionId);
        if (normalized && id != null) normalized = shuffleListeningChoicesWithSeed(normalized, `${id}-${qIndex}`);
      } else if (isLocalQuestionId(questionId)) {
        normalized = getQuestionById(questionId);
      } else {
        const questionSnap = await getDoc(doc(db, 'questions', questionId));
        if (questionSnap.exists()) normalized = normalizeQuestion(questionSnap.data());
      }
      if (!normalized) return;
      currentQuestionForIndexRef.current = qIndex;
      setCurrentQuestion(normalized);
      prevQuestionIndexRef.current = qIndex;
      setAnswered(false);
      setSelectedChoice(null);
      displayedCharsRef.current = '';
      dictationInputStateRef.current = '';
      lastWrongAudioAtRef.current = 0;
      setDictationInput('');
      setDisplayedChars('');
      setIsDictationCorrectLocal(false);
      const now = Date.now();
      questionStartTimeRef.current = now;
      setTimeRemaining(20);
      timeoutHandledRef.current = false;
      if (segmentStartTimerInitializedRef.current !== dictationStart) {
        segmentStartTimerInitializedRef.current = dictationStart;
      }
    })();
  }, [match?.status, match?.currentQuestionIndex, match?.questionIds, match?.choiceCount, match?.listeningCount, dismissedPhaseResultAt, id]);
  const playDictationAudio = useCallback(async (word: string) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    return new Promise<void>(async (resolve) => {
      try {
        await ensureAudioModeForSpeech();
        if (__DEV__ && Platform.OS === 'web') {
          const ss = typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
          console.log('[Audio] Web playDictationAudio:', { word, speaking: ss?.speaking, pending: ss?.pending });
        }
        let startFired = false;
        Speech.speak(word, {
          language: 'en-US',
          onStart: () => {
            startFired = true;
            if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: dictation speak started');
          },
          onDone: () => {
            setIsPlayingAudio(false);
            resolve();
            if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: dictation speak done');
          },
          onError: (error) => {
            console.error('[Dictation] Speech error:', error);
            setIsPlayingAudio(false);
            resolve();
          },
        });
        if (__DEV__ && Platform.OS === 'web') {
          setTimeout(() => {
            if (!startFired) {
              console.warn('[Audio] Web: dictation onStart never fired within 2s - likely blocked or Chrome speech bug');
              setIsPlayingAudio(false);
              resolve();
            }
          }, 2000);
        }
      } catch (e) {
        setIsPlayingAudio(false);
        resolve();
      }
    });
  }, [isPlayingAudio]);

  // 自分と相手の表示名・アバターを取得
  useEffect(() => {
    if (!match || !auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const oppUid = match.players?.A === myUid ? match.players?.B : match.players?.A;
    const loadUsers = async () => {
      try {
        const myDoc = await getDoc(doc(db, 'users', myUid));
        const myData = myDoc.exists() ? (myDoc.data() as FirestoreUser) : null;
        const myAvatarUrl = myData ? await getAvatarUrl(myData) : null;
        setMyUser(myData ? { displayName: myData.displayName || 'You', avatarUrl: myAvatarUrl ?? undefined } : { displayName: 'You' });
        if (oppUid && oppUid !== 'ai') {
          const oppDoc = await getDoc(doc(db, 'users', oppUid));
          const oppData = oppDoc.exists() ? (oppDoc.data() as FirestoreUser) : null;
          const oppAvatarUrl = oppData ? await getAvatarUrl(oppData) : null;
          setOpponentUser(oppData ? { displayName: oppData.displayName || 'Opponent', avatarUrl: oppAvatarUrl ?? undefined } : { displayName: 'Opponent' });
        } else {
          setOpponentUser(oppUid === 'ai' ? { displayName: 'AI' } : { displayName: 'Opponent' });
        }
      } catch (e) {
        setMyUser({ displayName: 'You' });
        setOpponentUser(oppUid === 'ai' ? { displayName: 'AI' } : { displayName: 'Opponent' });
      }
    };
    loadUsers();
  }, [match?.players?.A, match?.players?.B]);

  // ランクマッチ・友達対戦：ゲーム開始カウントダウン中に初回問題をロード（カウント終了後すぐゲーム開始できるように）
  // 依存を match 全体にしない（onSnapshot のたびに effect が走ると音声がループする）
  useEffect(() => {
    if (!match || match.status !== 'playing') return;
    const gameStartsAtMs = getTimestampMillis(match.gameStartsAt);
    if (gameStartsAtMs <= 0) return;
    const questionIds = match.questionIds ?? [];
    if (questionIds.length === 0) return;
    const qIndex = match.currentQuestionIndex ?? 0;
    if (qIndex !== 0 || firstQuestionLoadedRef.current) return;
    firstQuestionLoadedRef.current = true;

    const loadFirstQuestion = async () => {
      const questionId = questionIds[qIndex];
      const effectiveType = getEffectiveQuestionType(match, qIndex);
      let normalized: Question | null = null;
      if (isListeningQuestionId(questionId)) {
        normalized = getListeningQuestionById(questionId);
        if (normalized && id != null) normalized = shuffleListeningChoicesWithSeed(normalized, `${id}-${qIndex}`);
        if (normalized) setCorrectChoiceByQIndex((prev) => ({ ...prev, [qIndex]: normalized!.answerIndex ?? 0 }));
      } else if (isLocalQuestionId(questionId)) {
        normalized = getQuestionById(questionId);
      } else if (effectiveType === 'choice' && id) {
        const getQuestion = httpsCallable(functions, 'getQuestionForMatch');
        const res = await getQuestion({ matchId: id, questionId });
        normalized = normalizeQuestion(res.data as Record<string, unknown>);
      } else {
        const questionSnap = await getDoc(doc(db, 'questions', questionId));
        if (questionSnap.exists()) normalized = normalizeQuestion(questionSnap.data());
      }
      if (normalized) {
          currentQuestionForIndexRef.current = qIndex;
          setCurrentQuestion(normalized);
          prevQuestionIndexRef.current = qIndex;
          questionStartTimeRef.current = Date.now();
          setTimeRemaining(20);
          timeoutHandledRef.current = false;
          if (effectiveType === 'dictation') {
            displayedCharsRef.current = '';
            dictationInputStateRef.current = '';
            lastWrongAudioAtRef.current = 0;
            setDictationInput('');
            setDisplayedChars('');
            setIsDictationCorrectLocal(false);
          }
      }
    };
    loadFirstQuestion();
  }, [match?.status, match?.gameStartsAt, match?.currentQuestionIndex, match?.questionType, match?.questionIds?.length, id]);

  // When match id changes, reset all refs and phase state (new game = unchecked sound again).
  useEffect(() => {
    firstQuestionLoadedRef.current = false;
    setPhaseResultAcknowledgedAt(null);
    setPhaseResultAudioChecked(false);
    lastAudioPlayedForQIndexRef.current = -1;
    currentQuestionForIndexRef.current = -1;
    audioAcknowledgedForMatchRef.current = false;
    battleSoundPlayedRef.current = false;
    pendingFirstListeningLoadRef.current = false;
    pendingFirstDictationLoadRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!id || !auth.currentUser) return;

    const matchRef = doc(db, 'matches', id);
    const unsubscribe = onSnapshot(
      matchRef,
      async (snapshot) => {
      if (!snapshot.exists()) {
        Alert.alert('Error', 'Match not found');
        router.back();
        return;
      }

      const matchData = snapshot.data() as Match;
      const prevQuestionIndex = prevQuestionIndexRef.current;
      const currentQIndex = matchData.currentQuestionIndex;
      
      // 問題が変わった場合は、即座にディクテーションの入力履歴をリセット
      const prevEffectiveType = prevQuestionIndex >= 0 ? getEffectiveQuestionType(matchData, prevQuestionIndex) : null;
      if (prevQuestionIndex !== -1 && prevQuestionIndex !== currentQIndex && prevEffectiveType === 'dictation') {
        console.log('[Question] Question changed, resetting dictation:', { prev: prevQuestionIndex, current: currentQIndex });
        displayedCharsRef.current = '';
        dictationInputStateRef.current = '';
        lastWrongAudioAtRef.current = 0;
        setDictationInput('');
        setDisplayedChars('');
        setAnswered(false);
        setIsDictationCorrectLocal(false);
      }
      
      setMatch(matchData);

      // ランクマッチの待機状態を処理
      if (matchData.status === 'waiting' && matchData.mode === 'ranked') {
        // ランクマッチの待機中は何もしない（マッチング完了を待つ）
        setLoading(false);
        return;
      }

      // ランクマッチ・友達対戦：マッチング成功時（status 'matched' または 'playing'）に「相手と戦います」演出画面を表示
      const questionIds = matchData.questionIds ?? [];
      const uid = auth.currentUser!.uid;
      const oppUid = matchData.players?.A === uid ? matchData.players?.B : matchData.players?.A;
      const showOpponentScreen = (matchData.mode === 'ranked' || matchData.mode === 'friend') && oppUid && oppUid !== 'ai';
      const isMatchedStatus = matchData.status === 'matched';
      if ((matchData.status === 'playing' || isMatchedStatus) && showOpponentScreen && !opponentScreenDismissedRef.current) {
        setShowOpponentFoundScreen(true);
        setLoading(false);
        if (!opponentDataFetchedRef.current) {
          opponentDataFetchedRef.current = true;
          getDoc(doc(db, 'users', oppUid)).then(async (oppDoc) => {
            if (oppDoc.exists()) {
              const d = oppDoc.data() as FirestoreUser;
              const avatarUrl = await getAvatarUrl(d);
              const isGM = matchData.questionType === 'overall';
              setOpponentFoundData({
                displayName: d.displayName || 'Opponent',
                avatarUrl: avatarUrl ?? undefined,
                rating: isGM ? (d.ratingOverall ?? d.rating ?? 1000) : (typeof d.rating === 'number' ? d.rating : 1000),
                tier: isGM ? (d.rankOverall?.tier ?? d.rank?.tier) : d.rank?.tier,
              });
            } else {
              setOpponentFoundData({ displayName: 'Opponent', rating: 1000 });
            }
          }).catch(() => {
            setOpponentFoundData({ displayName: 'Opponent', rating: 1000 });
          });
        }
        return;
      }

      // 問題を取得（currentQuestionIndexが変更されたとき、または初回）
      if (matchData.status === 'playing' && questionIds.length > 0) {
        const qIndex = currentQIndex;
        if (qIndex < questionIds.length) {
          // 問題インデックスが変更された場合、または問題が未設定の場合に再取得
          if (prevQuestionIndex !== qIndex || !currentQuestion) {
            // 両者回答済みから最低1秒経ってから次問題表示（2問目以降も必ず1秒クールタイム）
            // ただし overall のセグメント切り替え（4択→リスニング→ディクテーション）直後は即ロード
            const choiceCount = matchData.choiceCount ?? 10;
            const listeningCount = matchData.listeningCount ?? 10;
            const isSegmentTransition = matchData.questionType === 'overall' && (
              qIndex === choiceCount || qIndex === choiceCount + listeningCount
            );
            const elapsed = bothAnsweredAtRef.current > 0 ? Date.now() - bothAnsweredAtRef.current : 1000;
            const cooldownDelay = isSegmentTransition ? 0 : Math.max(0, 1000 - elapsed);
            // リスニング1問目・ディクテーション1問目はカウント終了後に effect でロード（ここではロードしない）
            if (isSegmentTransition && qIndex === choiceCount) {
              pendingFirstListeningLoadRef.current = true;
            } else if (isSegmentTransition && qIndex === choiceCount + listeningCount) {
              pendingFirstDictationLoadRef.current = true;
            } else if (cooldownDelay > 0) {
              if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
              prevQuestionIndexRef.current = qIndex; // 二重スケジュール防止
              cooldownTimeoutRef.current = setTimeout(async () => {
                cooldownTimeoutRef.current = null;
                const questionId = questionIds[qIndex];
                const effectiveType = getEffectiveQuestionType(matchData, qIndex);
                let normalized: Question | null = null;
                if (isListeningQuestionId(questionId)) {
                  normalized = getListeningQuestionById(questionId);
                  if (normalized && id != null) normalized = shuffleListeningChoicesWithSeed(normalized, `${id}-${qIndex}`);
                  if (normalized) setCorrectChoiceByQIndex((prev) => ({ ...prev, [qIndex]: normalized!.answerIndex ?? 0 }));
                } else if (isLocalQuestionId(questionId)) {
                  normalized = getQuestionById(questionId);
                } else if (effectiveType === 'choice' && id) {
                  const getQuestion = httpsCallable(functions, 'getQuestionForMatch');
                  const res = await getQuestion({ matchId: id, questionId });
                  normalized = normalizeQuestion(res.data as Record<string, unknown>);
                } else {
                  const questionSnap = await getDoc(doc(db, 'questions', questionId));
                  if (questionSnap.exists()) normalized = normalizeQuestion(questionSnap.data());
                }
                if (normalized) {
                  currentQuestionForIndexRef.current = qIndex;
                  setCurrentQuestion(normalized);
                }
                prevQuestionIndexRef.current = qIndex;
                setAnswered(false);
                setSelectedChoice(null);
                const newStartTime = Date.now();
                questionStartTimeRef.current = newStartTime;
                setTimeRemaining(20);
                timeoutHandledRef.current = false;
                if (effectiveType === 'dictation') {
                  displayedCharsRef.current = '';
                  dictationInputStateRef.current = '';
                  lastWrongAudioAtRef.current = 0;
                  setDictationInput('');
                  setDisplayedChars('');
                  setIsDictationCorrectLocal(false);
                }
                // 音声は画面切り替え後に再生（useEffect）
                console.log('[Question] New question started (after cooldown):', { questionIndex: qIndex, questionType: matchData.questionType, effectiveType });
              }, cooldownDelay);
              return;
            }
            // セグメント1問目はここではロードしない（effect でカウント終了後にロード）
            if (!pendingFirstListeningLoadRef.current && !pendingFirstDictationLoadRef.current) {
            console.log('Loading question:', qIndex, 'prev:', prevQuestionIndex);
            const questionId = questionIds[qIndex];
            const effectiveType = getEffectiveQuestionType(matchData, qIndex);
            let normalized: Question | null = null;
            if (isListeningQuestionId(questionId)) {
              normalized = getListeningQuestionById(questionId);
              if (normalized && id != null) normalized = shuffleListeningChoicesWithSeed(normalized, `${id}-${qIndex}`);
              if (normalized) setCorrectChoiceByQIndex((prev) => ({ ...prev, [qIndex]: normalized!.answerIndex ?? 0 }));
            } else if (isLocalQuestionId(questionId)) {
              normalized = getQuestionById(questionId);
            } else if (effectiveType === 'choice' && id) {
              const getQuestion = httpsCallable(functions, 'getQuestionForMatch');
              const res = await getQuestion({ matchId: id, questionId });
              normalized = normalizeQuestion(res.data as Record<string, unknown>);
            } else {
              const questionSnap = await getDoc(doc(db, 'questions', questionId));
              if (questionSnap.exists()) normalized = normalizeQuestion(questionSnap.data());
            }
            if (normalized) {
              currentQuestionForIndexRef.current = qIndex;
              setCurrentQuestion(normalized);
            }
            prevQuestionIndexRef.current = qIndex;
            if (prevQuestionIndex === -1 || prevQuestionIndex !== qIndex) {
              const newStartTime = Date.now();
              questionStartTimeRef.current = newStartTime;
              setTimeRemaining(20);
              timeoutHandledRef.current = false;
              setAnswered(false);
              setSelectedChoice(null);
              if (effectiveType === 'dictation') {
                displayedCharsRef.current = '';
                dictationInputStateRef.current = '';
                lastWrongAudioAtRef.current = 0;
                setDictationInput('');
                setDisplayedChars('');
                setIsDictationCorrectLocal(false);
              }
              // 音声は画面切り替え後に再生（useEffect）
              console.log('[Question] New question started:', {
                questionIndex: qIndex,
                prevIndex: prevQuestionIndex,
                startTime: newStartTime,
                questionType: matchData.questionType,
                effectiveType,
              });
            }
            }
          }
        }
      }

      // 既に回答済みかチェック
      const userAnswers = (matchData.answers ?? {})[uid] || {};
      const otherAnswers = (matchData.answers ?? {})[oppUid] || {};
      const currentAnswer = userAnswers[currentQIndex];
      if (currentAnswer) {
        setAnswered(true);
        // 両者回答済みになった時刻を記録（1秒クールタイム用、1問につき1回だけ）
        if (otherAnswers[currentQIndex] !== undefined && lastQIndexBothAnsweredRef.current !== currentQIndex) {
          lastQIndexBothAnsweredRef.current = currentQIndex;
          bothAnsweredAtRef.current = Date.now();
        }
        if (getEffectiveQuestionType(matchData, currentQIndex) === 'dictation') {
          const answerText = currentAnswer.textAnswer || '';
          dictationInputStateRef.current = answerText;
          setDictationInput(answerText);
          // ディクテーションの場合、正解の単語を表示
          if (currentQuestion) {
            const correctWord = getCorrectWord(currentQuestion).toLowerCase();
            displayedCharsRef.current = correctWord;
            setDisplayedChars(correctWord);
          }
        } else {
          setSelectedChoice(currentAnswer.choiceIndex ?? null);
        }
      } else {
        // 問題が変わった場合は回答状態をリセット（リスニング1問目などセグメント先頭は effect でロードするため、既にロード済みならリセットしない）
        const alreadyLoadedThisQuestion = currentQuestionForIndexRef.current === currentQIndex;
        if (prevQuestionIndex !== currentQIndex && !alreadyLoadedThisQuestion) {
          setAnswered(false);
          setSelectedChoice(null);
        // ディクテーションの入力履歴もリセット
        displayedCharsRef.current = '';
        dictationInputStateRef.current = '';
        lastWrongAudioAtRef.current = 0;
        setDictationInput('');
        setDisplayedChars('');
        setIsDictationCorrectLocal(false);
        timeoutHandledRef.current = false; // タイムアウト処理フラグをリセット
        }
      }

      // 残り時間の計算はタイマーのuseEffectで行うため、ここでは設定しない
      // onSnapshotのコールバックで設定すると、タイマーのuseEffectの値が上書きされる可能性がある

      // 終了チェック
      if (matchData.status === 'finished') {
        const isWinner = matchData.winnerUid === uid;
        if (isWinner && (matchData.mode === 'ranked' || matchData.mode === 'ai' || matchData.mode === 'friend')) {
          preloadWinSound(); // Preload so result screen can play on mobile
        }
        router.replace(`/result/${id}`);
        return;
      }

      setLoading(false);
    },
    (err) => {
      console.error('[Match] onSnapshot error:', err);
      setLoading(false);
      Alert.alert(
        'Connection Error',
        'Failed to load match. Check your network and try again.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
    );

    return () => unsubscribe();
  }, [id, playDictationAudio]);

  // Play listening/dictation audio once after screen is ready. On mobile, only after user checked "Enable sound". Keep effect simple: ensureAudioMode then speak.
  // ランクマ・友達対戦では gameStartsAt のカウントダウンが終わってから再生する（countdownTick で再実行される）
  useEffect(() => {
    if (!match || match.status !== 'playing' || !currentQuestion) return;
    const gameStartsAtMs = getTimestampMillis(match?.gameStartsAt);
    if (gameStartsAtMs > 0 && gameStartsAtMs > Date.now()) return; // カウントダウン中は再生しない
    const qIndex = match.currentQuestionIndex ?? 0;
    if (Platform.OS !== 'web' && !audioAcknowledgedForMatchRef.current) return;
    if (currentQuestionForIndexRef.current !== qIndex) return;
    if (lastAudioPlayedForQIndexRef.current === qIndex) return;

    const choiceCount = match.choiceCount ?? 10;
    const listeningCount = match.listeningCount ?? 10;
    const effectiveType = getEffectiveQuestionType(match, qIndex);

    const isSegmentStartListening = match.questionType === 'overall' && qIndex === choiceCount;
    const isSegmentStartDictation = match.questionType === 'overall' && qIndex === choiceCount + listeningCount;
    const screenReadyForListening = effectiveType === 'listening' && (!isSegmentStartListening || dismissedPhaseResultAt === choiceCount);
    const screenReadyForDictation = effectiveType === 'dictation' && (!isSegmentStartDictation || dismissedPhaseResultAt === choiceCount + listeningCount);

    if (screenReadyForListening && currentQuestion.prompt) {
      const promptText = typeof currentQuestion.prompt === 'string' ? currentQuestion.prompt.trim() : '';
      if (promptText) {
        lastAudioPlayedForQIndexRef.current = qIndex;
        Speech.stop();
        if (__DEV__ && Platform.OS === 'web') {
          const ss = typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
          console.log('[Audio] Web: attempting Speech.speak for listening', {
            qIndex,
            promptLength: promptText.length,
            speechSynthesisSpeaking: ss?.speaking,
            speechSynthesisPending: ss?.pending,
          });
        }
        ensureAudioModeForSpeech().then(() => {
          let startFired = false;
          Speech.speak(promptText, {
            language: 'en-US',
            onStart: () => {
              startFired = true;
              if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: listening speak started');
            },
            onError: (e) => {
              if (__DEV__ && Platform.OS === 'web') console.warn('[Audio] Web Speech.speak error:', e);
            },
            onDone: () => {
              if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: listening speak done');
            },
          });
          if (__DEV__ && Platform.OS === 'web') {
            setTimeout(() => {
              if (!startFired) {
                console.warn('[Audio] Web: onStart never fired within 2s - likely blocked (Chrome user-activation) or Chrome speech bug');
              }
            }, 2000);
          }
        });
      }
      return;
    }
    if (screenReadyForDictation) {
      const correctWord = getCorrectWord(currentQuestion);
      if (correctWord) {
        lastAudioPlayedForQIndexRef.current = qIndex;
        if (__DEV__ && Platform.OS === 'web') {
          const ss = typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
          console.log('[Audio] Web: attempting Speech.speak for dictation', {
            qIndex,
            word: correctWord,
            speechSynthesisSpeaking: ss?.speaking,
            speechSynthesisPending: ss?.pending,
          });
        }
        playDictationAudio(correctWord).then(() => {
          setTimeout(() => dictationInputRef.current?.focus(), 500);
        });
      }
    }
  }, [match?.status, match?.currentQuestionIndex, match?.gameStartsAt, match?.questionType, match?.choiceCount, match?.listeningCount, currentQuestion, dismissedPhaseResultAt, playDictationAudio, countdownTick, aiSoundEnabledTrigger]);

  // ディクテーション用の回答処理
  const handleDictationSubmit = useCallback(async (textAnswer: string) => {
    if (!match || !auth.currentUser || answered) return;
    
    setAnswered(true);
    // 入力フィールドの表示は既にsetDictationInputで設定されているため、ここでは更新しない
    // ローカルで正解フラグは既に設定されているため、ここでは更新しない

    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../lib/firebase');
      const submit = httpsCallable(functions, 'submitAnswer');
      
      // スペースを除去して送信（バックエンドでスペースを除去して比較するため）
      const textAnswerWithoutSpaces = textAnswer.replace(/\s/g, '').trim();
      
      const result = await submit({
        matchId: id,
        qIndex: match.currentQuestionIndex,
        textAnswer: textAnswerWithoutSpaces,
        timeRemaining: timeRemaining, // 残り時間を送信
      });
      
      console.log('[handleDictationSubmit] Answer submitted successfully:', result.data);
    } catch (error: any) {
      console.error('[handleDictationSubmit] Error submitting answer:', error);
      Alert.alert('Error', error.message || 'Failed to submit answer');
      setAnswered(false);
    }
  }, [match, answered, id, timeRemaining]);

  // handleAnswerをuseCallbackでメモ化
  const handleAnswer = useCallback(async (choiceIndex: number, forceTimeout: boolean = false) => {
    if (!match || !auth.currentUser) {
      console.log('[handleAnswer] Early return:', { match: !!match, auth: !!auth.currentUser });
      return;
    }
    
    // タイムアウトの場合は強制的に処理（answeredチェックをスキップ）
    if (!forceTimeout && answered) {
      console.log('[handleAnswer] Already answered, skipping');
      return;
    }

    console.log('[handleAnswer] Processing answer:', {
      choiceIndex,
      forceTimeout,
      questionIndex: match.currentQuestionIndex,
      answered,
      matchId: id
    });

    // レスポンス到着時には match.currentQuestionIndex が進んでいる可能性があるので、回答した問題の qIndex を固定
    const submittedQIndex = match.currentQuestionIndex;

    // タイムアウトの場合（choiceIndex === -1）は無効な選択肢として処理
    const isTimeout = choiceIndex === -1;
    const actualChoiceIndex = isTimeout ? 999 : choiceIndex;
    
    setSelectedChoice(isTimeout ? null : choiceIndex);
    setAnswered(true);

    try {
      console.log('[handleAnswer] Submitting answer:', { matchId: id, qIndex: submittedQIndex, choiceIndex: actualChoiceIndex, isTimeout, forceTimeout });
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../lib/firebase');
      const submit = httpsCallable(functions, 'submitAnswer');
      const questionId = match.questionIds?.[submittedQIndex];
      const payload: { matchId: string; qIndex: number; choiceIndex: number; correctChoiceIndex?: number; isTimeout?: boolean; timeRemaining?: number } = {
        matchId: id,
        qIndex: submittedQIndex,
        choiceIndex: actualChoiceIndex,
      };
      if (isTimeout) payload.isTimeout = true;
      if (!isTimeout && timeRemaining !== undefined) payload.timeRemaining = timeRemaining;
      if (isLocalQuestionId(questionId) && typeof currentQuestion?.answerIndex === 'number') {
        payload.correctChoiceIndex = currentQuestion.answerIndex;
      }
      if (isListeningQuestionId(questionId) && typeof currentQuestion?.answerIndex === 'number') {
        payload.correctChoiceIndex = currentQuestion.answerIndex;
      }
      const result = await submit(payload);
      
      console.log('[handleAnswer] Answer submitted successfully:', result.data);
      const data = result.data as { correctChoiceIndex?: number; isCorrect?: boolean };
      if (typeof data.correctChoiceIndex === 'number') {
        setCorrectChoiceByQIndex(prev => ({ ...prev, [submittedQIndex]: data.correctChoiceIndex! }));
      }
      if (typeof data.isCorrect === 'boolean') {
        setServerIsCorrectByQIndex(prev => ({ ...prev, [submittedQIndex]: data.isCorrect! }));
      }
    } catch (error: any) {
      console.error('[handleAnswer] Error submitting answer:', error);
      console.error('[handleAnswer] Error code:', error.code);
      console.error('[handleAnswer] Error message:', error.message);
      Alert.alert('Error', error.message || 'Failed to submit answer');
      setAnswered(false);
      setSelectedChoice(null);
    }
  }, [match, answered, id, currentQuestion, timeRemaining]);

  // タイマー effect で参照するため ref に保持（match の参照変動で effect が走らないようにする）
  useEffect(() => {
    handleAnswerRef.current = handleAnswer;
    handleDictationSubmitRef.current = handleDictationSubmit;
  }, [handleAnswer, handleDictationSubmit]);

  // タイマー更新とタイムアウト処理
  // 各問題は独立した20秒タイマー（余った時間は繰り越さない）
  // 各問題は「0:20」から「0:00」までカウントダウン
  // 依存は status と currentQuestionIndex のみにし、match 全体にしない（onSnapshot で match 参照が変わるたびに effect が走ると 20⇔19 で振れて音声がループする）
  useEffect(() => {
    if (!match || match.status !== 'playing') return;
    
    // questionStartTimeRefが設定されていない場合は初期化
    if (questionStartTimeRef.current === 0) {
      questionStartTimeRef.current = Date.now();
      setTimeRemaining(20);
    }

    // タイマーを即座に更新（初回と問題が変わったとき）
    const updateTimer = () => {
      const now = Date.now();
      const questionTime = 20; // 1問20秒（固定、繰り越しなし）
      const questionStartTime = questionStartTimeRef.current;
      
      // questionStartTimeが0の場合は初期化されていない
      if (questionStartTime === 0) {
        questionStartTimeRef.current = now;
        setTimeRemaining(questionTime);
        return questionTime;
      }
      
      const elapsed = Math.floor((now - questionStartTime) / 1000);
      const questionRemaining = Math.max(0, questionTime - elapsed);
      
      setTimeRemaining(questionRemaining);
      return questionRemaining;
    };

    // 初回更新
    let questionRemaining = updateTimer();

    const timer = setInterval(() => {
      questionRemaining = updateTimer();

      // 現在の問題のタイムアウトチェック
      // タイムアウト処理は1回だけ実行されるようにする
      if (questionRemaining === 0 && !answered && !timeoutHandledRef.current && match.status === 'playing') {
        // タイムアウト: 自動的に不正解として処理
        console.log('Question timeout, submitting incorrect answer for question', match.currentQuestionIndex);
        timeoutHandledRef.current = true; // フラグを設定して重複実行を防ぐ
        
        if (getEffectiveQuestionType(match, match.currentQuestionIndex ?? 0) === 'dictation') {
          // ディクテーションの場合、空文字列を送信（timeRemainingは0）
          setIsDictationCorrectLocal(false); // タイムアウト時は不正解
          handleDictationSubmitRef.current?.('').catch((error) => {
            console.error('Error handling dictation timeout:', error);
          });
        } else {
          // 4択問題の場合
          handleAnswerRef.current?.(-1, true).catch((error) => {
            console.error('Error handling timeout:', error);
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [match?.status, match?.currentQuestionIndex, match?.questionType, answered]);

  // アンマウント時に1秒クールタイム用タイマーをクリア
  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
    };
  }, []);

  // マッチ中にログアウト・認証切れになったらホームへ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        Alert.alert(
          'Signed out',
          'You have been signed out. Returning to home.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/battle') }]
        );
      }
    });
    return unsubscribe;
  }, [router]);

  // ディクテーション用の入力処理（useCallbackでメモ化して実機での動作を安定化）
  // フックの順序を保つため、早期リターンの前に配置
  const handleDictationInputChange = useCallback((text: string) => {
    if (!currentQuestion || answered) return;
    
    // 入力からスペースを除去（ユーザーが入力した文字のみを取得）
    const textWithoutSpaces = text.replace(/\s/g, '').toLowerCase();
    const correctWord = getCorrectWord(currentQuestion).toLowerCase();
    const correctWordWithoutSpaces = correctWord.replace(/\s/g, '');
    
    // 表示済み文字からスペースを除去して比較（refから最新の値を取得して実機での状態同期を確実にする）
    const currentDisplayedChars = displayedCharsRef.current || '';
    const displayedWithoutSpaces = currentDisplayedChars.replace(/\s/g, '');
    const displayedLength = displayedWithoutSpaces.length;
    
    // 全ての文字を入力し終わったかチェック
    if (textWithoutSpaces.length >= correctWordWithoutSpaces.length) {
      // 全ての文字を入力し終わった場合、最終的な一致をチェック
      // 最後の文字まで入力した時点で、正解の単語と一致していれば必ず正解として処理
      if (textWithoutSpaces === correctWordWithoutSpaces) {
        // 正解：正解の単語のスペース位置を考慮して表示文字を構築
        let newDisplayed = '';
        let correctIndex = 0;
        for (let i = 0; i < correctWordWithoutSpaces.length; i++) {
          // 正解の単語で次の文字の位置を探す（スペースをスキップ）
          while (correctIndex < correctWord.length && correctWord[correctIndex] === ' ') {
            newDisplayed += ' ';
            correctIndex++;
          }
          if (correctIndex < correctWord.length) {
            newDisplayed += correctWordWithoutSpaces[i];
            correctIndex++;
          }
        }
        // refも更新（実機での状態同期を確実にする）
        displayedCharsRef.current = newDisplayed;
        dictationInputStateRef.current = newDisplayed;
        setDisplayedChars(newDisplayed);
        setDictationInput(newDisplayed); // スペースを含む完全な文字列を設定
        // ローカルで正解フラグを設定（バックエンドの回答を待たずに即座に「正解」を表示）
        setIsDictationCorrectLocal(true);
        // 正解として送信（スペースを含む完全な文字列を渡す。handleDictationSubmit内でスペースを除去して送信）
        handleDictationSubmit(newDisplayed);
        return;
      } else {
        // 全ての文字を入力したが一致しない場合、入力を続けられるようにする
        // 不正解を表示せず、ユーザーが修正できるようにする
        // 入力フィールドはそのままにして、表示も更新しない（正解になるまで待つ）
        return;
      }
    }
    
    if (textWithoutSpaces.length < displayedLength) {
      // 文字が削除された場合：正解の単語のスペース位置を考慮して表示文字を再構築
      let newDisplayed = '';
      let correctIndex = 0;
      for (let i = 0; i < textWithoutSpaces.length; i++) {
        // 正解の単語で次の文字の位置を探す（スペースをスキップ）
        while (correctIndex < correctWord.length && correctWord[correctIndex] === ' ') {
          newDisplayed += ' ';
          correctIndex++;
        }
        if (correctIndex < correctWord.length) {
          newDisplayed += textWithoutSpaces[i];
          correctIndex++;
        }
      }
      // refも更新（実機での状態同期を確実にする）
      displayedCharsRef.current = newDisplayed;
      dictationInputStateRef.current = newDisplayed;
      setDictationInput(newDisplayed);
      setDisplayedChars(newDisplayed);
      return;
    }
    
    const newInput = textWithoutSpaces.slice(displayedLength);
    if (newInput.length === 0) {
      return;
    }
    
    // 新しい入力文字列を1文字ずつ処理（refから最新の値を取得）
    const currentDisplayedWithoutSpaces = displayedCharsRef.current.replace(/\s/g, '');
    let processedInput = currentDisplayedWithoutSpaces;
    let newDisplayed = '';
    let correctIndex = 0;
    let processedLength = currentDisplayedWithoutSpaces.length;
    
    // 新しい入力文字を1文字ずつチェックして処理
    for (let inputIdx = 0; inputIdx < newInput.length; inputIdx++) {
      const nextInputChar = newInput[inputIdx];
      const nextCorrectChar = correctWordWithoutSpaces[processedLength];
      
      if (nextInputChar === nextCorrectChar) {
        // 正解の文字：正解の単語のスペース位置を考慮して追加
        // まず、現在の位置までの文字列を構築（スペースを含む）
        let tempDisplayed = '';
        let tempCorrectIndex = 0;
        const tempProcessedLength = processedLength + 1;
        
        for (let i = 0; i < tempProcessedLength; i++) {
          // 正解の単語で次の文字の位置を探す（スペースをスキップ）
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
        
        // 今入力した文字の直後にスペースがあるかチェック
        let charCount = 0;
        for (let i = 0; i < correctWord.length; i++) {
          if (correctWord[i] !== ' ') {
            charCount++;
            if (charCount === tempProcessedLength) {
              // 今入力した文字の位置を確認
              if (i + 1 < correctWord.length && correctWord[i + 1] === ' ') {
                // 次の位置がスペースの場合、自動的にスペースを挿入
                tempDisplayed += ' ';
              }
              break;
            }
          }
        }
        
        newDisplayed = tempDisplayed;
        processedInput += nextInputChar;
        processedLength++;
        
        // 全ての文字を入力し終わったかチェック
        if (processedLength === correctWordWithoutSpaces.length) {
          // 最後の文字まで入力した時点で、正解の単語と一致していれば正解として送信
          const finalDisplayedWithoutSpaces = newDisplayed.replace(/\s/g, '');
          if (finalDisplayedWithoutSpaces === correctWordWithoutSpaces) {
            // refも更新（実機での状態同期を確実にする）
            displayedCharsRef.current = newDisplayed;
            dictationInputStateRef.current = newDisplayed;
            setDisplayedChars(newDisplayed);
            setDictationInput(newDisplayed);
            // ローカルで正解フラグを設定（バックエンドの回答を待たずに即座に「正解」を表示）
            setIsDictationCorrectLocal(true);
            // スペースを含む完全な文字列を渡す。handleDictationSubmit内でスペースを除去して送信
            handleDictationSubmit(newDisplayed);
            return;
          }
        }
      } else {
        // 間違った文字：音声再生（3秒クールダウン後なら再生、その後3秒休憩）
        const now = Date.now();
        if (now - lastWrongAudioAtRef.current >= 3000) {
          lastWrongAudioAtRef.current = now;
        const wordToPlay = getCorrectWord(currentQuestion);
        if (wordToPlay) playDictationAudio(wordToPlay);
        }
        break;
      }
    }
    
    // 処理した分だけ更新
    if (newDisplayed.length > 0) {
      // refも更新（実機での状態同期を確実にする）
      displayedCharsRef.current = newDisplayed;
      dictationInputStateRef.current = newDisplayed;
      setDisplayedChars(newDisplayed);
      setDictationInput(newDisplayed);
    }
  }, [currentQuestion, answered, handleDictationSubmit, playDictationAudio]);

  const handleNext = () => {
    // 次の問題への遷移は、match.currentQuestionIndexの更新を監視するuseEffectで自動的に行われる
    // この関数は、UIの状態をリセットするだけ（実際の遷移はFirestoreの更新で行われる）
    setSelectedChoice(null);
    setAnswered(false);
    displayedCharsRef.current = '';
    dictationInputStateRef.current = '';
    lastWrongAudioAtRef.current = 0;
    setDictationInput('');
    setDisplayedChars('');
    setIsDictationCorrectLocal(false);
  };


  if (!id) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.loadingText}>Invalid match</Text>
        <TouchableOpacity style={styles.nextButton} onPress={() => router.back()}>
          <Text style={styles.nextButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || !match) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const uid = auth.currentUser?.uid || '';
  const opponentUid = match.players?.A === uid ? match.players?.B : match.players?.A;
  const myName = myUser?.displayName ?? 'You';
  const oppName = opponentUid === 'ai' ? 'AI' : (opponentUser?.displayName ?? 'Opponent');

  if (match.status === 'waiting') {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        {match.mode === 'ranked' ? (
          <>
            <Text style={styles.waitingText}>Ranked Match</Text>
            <Text style={styles.waitingSubtext}>Finding an opponent...</Text>
            <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 20 }} />
          </>
        ) : (
          <>
            <Text style={styles.waitingText}>Waiting for opponent...</Text>
            {match.roomCode && (
              <View style={styles.roomCodeContainer}>
                <Text style={styles.roomCodeLabel}>Room code</Text>
                <Text style={styles.roomCode}>{match.roomCode}</Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  // ランクマッチ・友達対戦：マッチング成功時の演出（GrandMaster は別レイアウトで豪華に）
  if (showOpponentFoundScreen && (match.mode === 'ranked' || match.mode === 'friend')) {
    // 両者 Ready → Begin Battle 押下 → この 3 秒カウントダウン → ゲーム開始
    const gameStartsAtMsHere = getTimestampMillis(match.gameStartsAt);
    if (match.status === 'playing' && gameStartsAtMsHere > 0 && gameStartsAtMsHere > Date.now()) {
      const remaining = Math.max(0, Math.ceil((gameStartsAtMsHere - Date.now()) / 1000));
      const label = remaining > 0 ? String(remaining) : 'Go!';
      return (
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>Starting in</Text>
            <Text style={styles.countdownNumber}>{label}</Text>
          </View>
        </View>
      );
    }

    const handleStartBattle = () => {
      unlockAudioOnUserGesture();
      opponentScreenDismissedRef.current = true;
      setOpponentScreenDismissed(true);
      setShowOpponentFoundScreen(false);
    };
    const isMatched = match.status === 'matched';
    const iAmA = match.players?.A === uid;
    const iHavePressedReady = iAmA ? match.readyA === true : match.readyB === true;
    const iHavePressedBeginBattle = iAmA ? match.beginBattleA === true : match.beginBattleB === true;
    const handleReady = async () => {
      if (readySubmitting || iHavePressedReady) return;
      setReadySubmitting(true);
      try {
        const setMatchReady = httpsCallable(functions, 'setMatchReady');
        await setMatchReady({ matchId: id });
      } catch (e) {
        console.error('setMatchReady error:', e);
      } finally {
        setReadySubmitting(false);
      }
    };
    /** Begin Battle 押下: 未設定なら startGameCountdown を呼ぶ（カウントダウン後に useEffect で閉じる） */
    const handleBeginBattle = async () => {
      if (match.status === 'playing' && gameStartsAtMsHere <= 0) {
        await unlockAudioOnUserGestureAsync();
        setBeginBattleSubmitting(true);
        try {
          const startGameCountdownFn = httpsCallable(functions, 'startGameCountdown');
          await startGameCountdownFn({ matchId: id });
        } catch (e) {
          console.error('startGameCountdown error:', e);
        } finally {
          setBeginBattleSubmitting(false);
        }
        return;
      }
      handleStartBattle();
    };
    const isGrandMaster = match.questionType === 'overall';

    if (isGrandMaster) {
      return (
        <View style={styles.gmMatchContainer}>
          <View style={styles.gmMatchGlow} />
          <View style={styles.gmMatchCard}>
            <Text style={styles.gmMatchCrown}>👑</Text>
            <Text style={styles.gmMatchBadge}>GrandMaster</Text>
            <Text style={styles.gmMatchTitle}>Match Established</Text>
            <Text style={styles.gmMatchSubtitle}>
              {isMatched ? 'Both players must press Ready to start.' : 'Your opponent awaits. Dominate all phases.'}
            </Text>
            {opponentFoundData ? (
              <View style={styles.gmOpponentBlock}>
                <View style={styles.gmOpponentAvatarRing}>
                  {opponentFoundData.avatarUrl ? (
                    <Image source={{ uri: opponentFoundData.avatarUrl }} style={styles.gmOpponentAvatar} />
                  ) : (
                    <View style={[styles.gmOpponentAvatar, styles.gmOpponentAvatarPlaceholder]}>
                      <Text style={styles.gmOpponentAvatarText}>
                        {opponentFoundData.displayName.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.gmOpponentName}>{opponentFoundData.displayName}</Text>
                <View style={styles.gmOpponentStats}>
                  <View style={styles.gmOpponentStat}>
                    <Text style={styles.gmOpponentStatLabel}>Rating</Text>
                    <Text style={styles.gmOpponentStatValue}>{opponentFoundData.rating}</Text>
                  </View>
                  {opponentFoundData.tier && (
                    <View style={styles.gmOpponentStat}>
                      <Text style={styles.gmOpponentTierPiece}>{TIER_INFO[opponentFoundData.tier]?.piece ?? '♙'}</Text>
                      <Text style={styles.gmOpponentStatLabel}>{TIER_INFO[opponentFoundData.tier]?.label ?? opponentFoundData.tier}</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <ActivityIndicator size="large" color={COLORS.gold} style={{ marginVertical: 32 }} />
            )}
            <TouchableOpacity
              style={styles.phaseResultAudioCheckRow}
              onPress={() => {
                if (phaseResultAudioChecked) return;
                Speech.speak(PHASE_RESULT_UNLOCK_SPEECH, { language: 'en-US', rate: 1.0 });
                setPhaseResultAudioChecked(true);
                audioAcknowledgedForMatchRef.current = true;
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.phaseResultCheckbox, phaseResultAudioChecked && styles.phaseResultCheckboxChecked]}>
                {phaseResultAudioChecked && <Text style={styles.phaseResultCheckmark}>✓</Text>}
              </View>
              <Text style={styles.phaseResultAudioCheckLabel}>Enable sound (for whole match)</Text>
            </TouchableOpacity>
            <View style={styles.gmMatchActions}>
              {isMatched ? (
                iHavePressedReady ? (
                  <Text style={styles.gmMatchWaitingText}>Waiting for opponent to be ready...</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.gmMatchButton}
                    onPress={handleReady}
                    disabled={!opponentFoundData || readySubmitting}
                  >
                    <Text style={styles.gmMatchButtonText}>{readySubmitting ? '...' : 'Ready'}</Text>
                  </TouchableOpacity>
                )
              ) : (
                iHavePressedBeginBattle ? (
                  <Text style={styles.gmMatchWaitingText}>Waiting for opponent to press Begin Battle...</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.gmMatchButton}
                    onPress={handleBeginBattle}
                    disabled={!opponentFoundData || beginBattleSubmitting}
                  >
                    <Text style={styles.gmMatchButtonText}>{beginBattleSubmitting ? '...' : 'Begin Battle'}</Text>
                  </TouchableOpacity>
                )
              )}
              <TouchableOpacity style={styles.gmMatchCancelButton} onPress={() => router.back()}>
                <Text style={styles.gmMatchCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <View style={styles.opponentFoundCard}>
          <Text style={styles.opponentFoundTitle}>Match Found!</Text>
          <Text style={styles.opponentFoundSubtitle}>You will battle this opponent</Text>
          {opponentFoundData ? (
            <>
              {opponentFoundData.avatarUrl ? (
                <Image source={{ uri: opponentFoundData.avatarUrl }} style={styles.opponentFoundAvatar} />
              ) : (
                <View style={[styles.opponentFoundAvatar, styles.opponentFoundAvatarPlaceholder]}>
                  <Text style={styles.opponentFoundAvatarText}>
                    {opponentFoundData.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.opponentFoundName}>{opponentFoundData.displayName}</Text>
              <View style={styles.opponentFoundStatsRow}>
                <View style={styles.opponentFoundRatingRow}>
                  <Text style={styles.opponentFoundRatingLabel}>Rating</Text>
                  <Text style={styles.opponentFoundRating}>{opponentFoundData.rating}</Text>
                </View>
                {opponentFoundData.tier && (
                  <View style={styles.opponentFoundTierRow}>
                    <Text style={styles.opponentFoundTierPiece}>
                      {TIER_INFO[opponentFoundData.tier]?.piece ?? '♙'}
                    </Text>
                    <Text style={styles.opponentFoundTierLabel}>
                      {TIER_INFO[opponentFoundData.tier]?.label ?? opponentFoundData.tier}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <ActivityIndicator size="large" color={COLORS.gold} style={{ marginVertical: 24 }} />
          )}
          <TouchableOpacity
            style={styles.phaseResultAudioCheckRow}
            onPress={() => {
              if (phaseResultAudioChecked) return;
              Speech.speak(PHASE_RESULT_UNLOCK_SPEECH, { language: 'en-US', rate: 1.0 });
              setPhaseResultAudioChecked(true);
              audioAcknowledgedForMatchRef.current = true;
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.phaseResultCheckbox, phaseResultAudioChecked && styles.phaseResultCheckboxChecked]}>
              {phaseResultAudioChecked && <Text style={styles.phaseResultCheckmark}>✓</Text>}
            </View>
            <Text style={styles.phaseResultAudioCheckLabel}>Enable sound (for whole match)</Text>
          </TouchableOpacity>
          <View style={styles.opponentFoundButtons}>
            {isMatched ? (
              iHavePressedReady ? (
                <Text style={styles.opponentFoundWaitingText}>Waiting for opponent to be ready...</Text>
              ) : (
                <TouchableOpacity
                  style={styles.opponentFoundButton}
                  onPress={handleReady}
                  disabled={!opponentFoundData || readySubmitting}
                >
                  <Text style={styles.opponentFoundButtonText}>{readySubmitting ? '...' : 'Ready'}</Text>
                </TouchableOpacity>
              )
            ) : (
              iHavePressedBeginBattle ? (
                <Text style={styles.opponentFoundWaitingText}>Waiting for opponent to press Begin Battle...</Text>
              ) : (
                <TouchableOpacity
                  style={styles.opponentFoundButton}
                  onPress={handleBeginBattle}
                  disabled={!opponentFoundData || beginBattleSubmitting}
                >
                  <Text style={styles.opponentFoundButtonText}>{beginBattleSubmitting ? '...' : 'Battle!'}</Text>
                </TouchableOpacity>
              )
            )}
            <TouchableOpacity
              style={styles.opponentFoundCancelButton}
              onPress={() => router.back()}
            >
              <Text style={styles.opponentFoundCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ゲーム開始前の 3 秒カウントダウン（Begin Battle を押した直後にも残り時間があれば表示）
  const gameStartsAtMs = getTimestampMillis(match?.gameStartsAt);
  const showGameStartCountdown = match?.status === 'playing' && gameStartsAtMs > 0 && gameStartsAtMs > Date.now();
  if (showGameStartCountdown) {
    const remaining = Math.max(0, Math.ceil((gameStartsAtMs - Date.now()) / 1000));
    const label = remaining > 0 ? String(remaining) : 'Go!';
    return (
      <View style={styles.countdownOverlay}>
        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>Starting in</Text>
          <Text style={styles.countdownNumber}>{label}</Text>
        </View>
      </View>
    );
  }

  if (!currentQuestion) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.loadingText}>Loading question...</Text>
      </View>
    );
  }

  // AI対戦・モバイルのみ：リスニング/ディクテーション時は音声有効化が必要（相手画面がないため）。Webは自動再生のまま
  if (match?.mode === 'ai' && Platform.OS !== 'web' && !audioAcknowledgedForMatchRef.current && match?.status === 'playing') {
    const qIdx = match.currentQuestionIndex ?? 0;
    const effType = getEffectiveQuestionType(match, qIdx);
    if (effType === 'listening' || effType === 'dictation') {
      return (
        <TouchableOpacity
          style={styles.countdownOverlay}
          activeOpacity={1}
          onPress={() => {
            Speech.speak(PHASE_RESULT_UNLOCK_SPEECH, { language: 'en-US', rate: 1.0 });
            audioAcknowledgedForMatchRef.current = true;
            setAiSoundEnabledTrigger((t) => t + 1);
          }}
        >
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>Enable sound</Text>
            <Text style={styles.countdownNumber}>Tap to start</Text>
          </View>
        </TouchableOpacity>
      );
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const correctChoiceIndex = match ? (correctChoiceByQIndex[match.currentQuestionIndex] ?? currentQuestion?.answerIndex) : undefined;
  // 正誤表示: (1) correctChoiceIndex と一致 (2) レスポンスで受け取った serverIsCorrect (3) Firestore の answers[uid][qIndex].isCorrect（サーバーが書き込んだ値・後から答えた端末でも確実）
  const serverWrittenIsCorrect = match && uid ? match.answers?.[uid]?.[match.currentQuestionIndex]?.isCorrect : undefined;
  const qIdx = match?.currentQuestionIndex ?? -1;
  const serverIsCorrectVal = serverIsCorrectByQIndex[qIdx];
  const isCorrect = answered && selectedChoice !== null && (
    (typeof correctChoiceIndex === 'number' && correctChoiceIndex === selectedChoice) ||
    serverIsCorrectVal === true ||
    serverWrittenIsCorrect === true
  );
  // incorrect はサーバーが明示的に不正解と返したときのみ表示（応答待ちで誤って incorrect を出さない）
  const hasDefinitiveWrong = serverWrittenIsCorrect === false || serverIsCorrectVal === false;

  // GrandMaster(overall): 4択→リスニング→ディクテーションの区切りでセグメント勝者を表示（先に勝者→Continue→3秒カウントダウン→次フェーズ）
  const choiceCount = match?.choiceCount ?? 10;
  const listeningCount = match?.listeningCount ?? 10;
  const qIndexForPhase = match?.currentQuestionIndex ?? 0;
  const showPhaseChoiceResult = match?.questionType === 'overall' && match?.status === 'playing' && qIndexForPhase === choiceCount && match?.phaseChoiceWinnerUid != null && dismissedPhaseResultAt !== choiceCount;
  const showPhaseListeningResult = match?.questionType === 'overall' && match?.status === 'playing' && qIndexForPhase === choiceCount + listeningCount && match?.phaseListeningWinnerUid != null && dismissedPhaseResultAt !== (choiceCount + listeningCount);
  void countdownTick;

  if (showPhaseChoiceResult || showPhaseListeningResult) {
    const dismissIndex = showPhaseChoiceResult ? choiceCount : choiceCount + listeningCount;
    const nextPhaseLabel = showPhaseChoiceResult ? 'Next: Listening' : 'Next: Dictation';
    const phaseStartsAtMs = showPhaseChoiceResult ? getTimestampMillis(match?.listeningPhaseStartsAt) : getTimestampMillis(match?.dictationPhaseStartsAt);
    const iAmA = match?.players?.A === uid;
    const iHavePressedPhaseContinue = showPhaseChoiceResult
      ? (iAmA ? match?.phaseChoiceContinueA === true : match?.phaseChoiceContinueB === true)
      : (iAmA ? match?.phaseListeningContinueA === true : match?.phaseListeningContinueB === true);
    const countdownActive = phaseStartsAtMs > 0 && phaseStartsAtMs > Date.now();
    const countdownEnded = phaseStartsAtMs > 0 && phaseStartsAtMs <= Date.now();

    if (countdownEnded) {
      // カウント終了は useEffect で dismissedPhaseResultAt を設定して次へ
    } else if (countdownActive) {
      const phaseCountdownRemaining = Math.max(0, Math.ceil((phaseStartsAtMs - Date.now()) / 1000));
      const countdownDisplay = phaseCountdownRemaining > 0 ? String(phaseCountdownRemaining) : 'Go!';
      return (
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>{nextPhaseLabel}</Text>
            <Text style={styles.countdownNumber}>{countdownDisplay}</Text>
          </View>
        </View>
      );
    } else if (iHavePressedPhaseContinue) {
      return (
        <View style={styles.phaseResultContainer}>
          <View style={styles.phaseResultGlow} />
          <View style={styles.phaseResultCard}>
            <Text style={styles.phaseResultBadge}>{showPhaseChoiceResult ? '4-CHOICE' : 'LISTENING'}</Text>
            <Text style={styles.phaseResultPhaseLabel}>{showPhaseChoiceResult ? '4-Choice' : 'Listening'} phase</Text>
            <View style={styles.phaseResultWinnerBlock}>
              <Text style={styles.phaseResultWinnerName}>Waiting for opponent to press Continue...</Text>
            </View>
          </View>
        </View>
      );
    } else {
      const phaseLabel = showPhaseChoiceResult ? '4-Choice' : 'Listening';
      const phaseBadge = showPhaseChoiceResult ? '4-CHOICE' : 'LISTENING';
      const winnerUid = (showPhaseChoiceResult ? match!.phaseChoiceWinnerUid : match!.phaseListeningWinnerUid) as string | null | undefined;
      const isYou = winnerUid === uid;
      const isDraw = !winnerUid;
      const resultLabel = isDraw ? 'Draw' : isYou ? 'You win!' : 'You lose!';
      const handleContinue = async () => {
        unlockAudioOnUserGestureSync();
        await unlockAudioOnUserGestureAsync();
        setPhaseContinueSubmitting(true);
        try {
          const continuePhaseResultFn = httpsCallable(functions, 'continuePhaseResult');
          await continuePhaseResultFn({ matchId: id, phase: showPhaseChoiceResult ? 'choice' : 'listening' });
        } catch (e) {
          console.error('continuePhaseResult error:', e);
        } finally {
          setPhaseContinueSubmitting(false);
        }
      };
      return (
        <View style={styles.phaseResultContainer}>
          <View style={styles.phaseResultGlow} />
          <View style={styles.phaseResultCard}>
            <Text style={styles.phaseResultBadge}>{phaseBadge}</Text>
            <Text style={styles.phaseResultPhaseLabel}>{phaseLabel} phase</Text>
            <View style={[styles.phaseResultWinnerBlock, isYou && styles.phaseResultWinnerBlockYou]}>
              {isYou && <Text style={styles.phaseResultCrown}>👑</Text>}
              <Text style={[styles.phaseResultWinnerName, isYou && styles.phaseResultWinnerNameYou]}>{resultLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.phaseResultContinueButton}
              onPress={handleContinue}
              disabled={phaseContinueSubmitting}
              activeOpacity={0.85}
            >
              <Text style={[styles.phaseResultContinueText, phaseContinueSubmitting && styles.phaseResultContinueTextDisabled]}>
                {phaseContinueSubmitting ? '...' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
  }

  const renderPlayerSide = (
    uidKey: string,
    name: string,
    avatarUrl?: string,
    value: string | number = '',
    isLeading?: boolean
  ) => (
    <View style={styles.playerSide} key={uidKey}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.playerAvatar} />
      ) : (
        <View style={[styles.playerAvatar, styles.playerAvatarPlaceholder]}>
          <Text style={styles.playerAvatarText}>{name.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={[styles.playerName, isLeading && styles.dictationScoreLeading]} numberOfLines={1}>
        {name}
      </Text>
      {value !== '' && <Text style={[styles.playerValue, isLeading && styles.dictationScoreLeading]}>{value}</Text>}
    </View>
  );

  const effectiveType = match ? getEffectiveQuestionType(match, match.currentQuestionIndex ?? 0) : 'choice';
  // ディクテーションモードのレンダリング
  if (effectiveType === 'dictation') {
    const correctWord = getCorrectWord(currentQuestion);
    const userAnswer = match.answers?.[uid]?.[match.currentQuestionIndex];
    const opponentAnswer = match.answers?.[opponentUid]?.[match.currentQuestionIndex];
    const isDictationCorrect = isDictationCorrectLocal || (userAnswer?.isCorrect || false);
    const myTotalScore = Number((match.scores?.[uid] ?? 0).toFixed(3));
    const oppTotalScore = Number((match.scores?.[opponentUid] ?? 0).toFixed(3));
    const myQuestionScore = userAnswer?.finalScore != null ? Number(userAnswer.finalScore.toFixed(3)) : null;
    const oppQuestionScore = opponentAnswer?.finalScore != null ? Number(opponentAnswer.finalScore.toFixed(3)) : null;
    const myDisplayName = myUser?.displayName ?? 'You';
    const oppDisplayName = opponentUid === 'ai' ? 'AI' : (opponentUser?.displayName ?? 'Opponent');

    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.questionNumber}>
            Question {match.currentQuestionIndex + 1} / {(match.questionIds?.length ?? 0)}
          </Text>
          <Text style={styles.timer}>{formatTime(timeRemaining)}</Text>
        </View>
        {/* ディクテーション: 自分 vs 相手（名前・アバター・スコア） */}
        <View style={styles.dictationScoreRow}>
          {renderPlayerSide(uid, myDisplayName, myUser?.avatarUrl, String(myTotalScore), myTotalScore >= oppTotalScore)}
          <Text style={styles.dictationScoreVs}>—</Text>
          {renderPlayerSide(opponentUid || 'opp', oppDisplayName, opponentUid !== 'ai' ? opponentUser?.avatarUrl : undefined, String(oppTotalScore), oppTotalScore > myTotalScore)}
        </View>
        {/* ライフ表示はディクテーションでは行わない（スコア制のため） */}

        {/* 再再生ボタン */}
        <TouchableOpacity
          style={styles.replayButton}
          onPress={() => playDictationAudio(correctWord)}
          disabled={isPlayingAudio}
        >
          <Text style={styles.replayButtonText}>🔊 Play again</Text>
        </TouchableOpacity>

        {/* 表示エリア */}
        <View style={styles.dictationDisplayArea}>
          <Text style={styles.dictationDisplayText}>
            {(() => {
              // 正解の単語のスペース位置を考慮して表示
              const correctWordLower = correctWord.toLowerCase();
              const displayedWithoutSpaces = displayedChars.replace(/\s/g, '');
              const correctWordWithoutSpaces = correctWordLower.replace(/\s/g, '');
              let displayedIndex = 0;
              const result: ReactElement[] = [];
              
              for (let i = 0; i < correctWordLower.length; i++) {
                if (correctWordLower[i] === ' ') {
                  // スペースの位置
                  result.push(
                    <Text key={i} style={styles.dictationPlaceholder}>
                      {' '}
                    </Text>
                  );
                } else {
                  // 文字の位置
                  if (displayedIndex < displayedWithoutSpaces.length) {
                    // 既に入力済みの文字
                    result.push(
                      <Text key={i} style={styles.dictationDisplayChar}>
                        {displayedWithoutSpaces[displayedIndex]}
                      </Text>
                    );
                    displayedIndex++;
                  } else {
                    // まだ入力されていない文字
                    result.push(
                      <Text key={i} style={styles.dictationPlaceholder}>
                        _
                      </Text>
                    );
                  }
                }
              }
              
              return result;
            })()}
          </Text>
        </View>

        {/* 入力フィールド */}
        <TextInput
          ref={dictationInputRef}
          style={styles.dictationInput}
          value={dictationInput}
          onChangeText={handleDictationInputChange}
          placeholder="Type here"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!answered}
        />

        {/* 回答結果（今問のスコアも表示） */}
        {answered && (
          <View style={styles.dictationResult}>
            <Text style={[styles.dictationResultText, isDictationCorrect && styles.dictationResultCorrect]}>
              {isDictationCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </Text>
            {(myQuestionScore != null || oppQuestionScore != null) && (
              <View style={styles.dictationQuestionScores}>
                <Text style={styles.dictationQuestionScoresLabel}>This question score</Text>
                <Text style={styles.dictationQuestionScoresValues}>
                  {myDisplayName} {myQuestionScore ?? '—'}  :  {oppDisplayName} {oppQuestionScore ?? '—'}
                </Text>
              </View>
            )}
            <Text style={styles.dictationAnswerText}>
              Correct: {correctWord}
            </Text>
            {userAnswer?.textAnswer && (
              <Text style={styles.dictationAnswerText}>
                {myDisplayName}'s answer: {userAnswer.textAnswer}
              </Text>
            )}
          </View>
        )}

        {/* 次の問題ボタン */}
        {answered && match.currentQuestionIndex < (match.questionIds?.length ?? 1) - 1 && (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Next question</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 4択問題モードのレンダリング
  const myLife4 = match.lives?.[uid] ?? 3;
  const oppLife4 = match.lives?.[opponentUid] ?? 3;

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.questionNumber}>
          Question {match.currentQuestionIndex + 1} / {(match.questionIds?.length ?? 0)}
        </Text>
        <Text style={styles.timer}>{formatTime(timeRemaining)}</Text>
      </View>
      {match.lives != null && match.questionType !== 'dictation' && (
        <View style={styles.livesRow}>
          <View style={styles.playerSide}>
            {myUser?.avatarUrl ? (
              <Image source={{ uri: myUser.avatarUrl }} style={styles.playerAvatarSmall} />
            ) : (
              <View style={[styles.playerAvatarSmall, styles.playerAvatarPlaceholder]}>
                <Text style={styles.playerAvatarTextSmall}>{myName.slice(0, 1)}</Text>
              </View>
            )}
            <Text style={styles.livesText}>{myName} <Text style={styles.livesHeart}>{'♥'.repeat(myLife4)}</Text></Text>
          </View>
          <View style={styles.playerSide}>
            {opponentUid !== 'ai' && opponentUser?.avatarUrl ? (
              <Image source={{ uri: opponentUser.avatarUrl }} style={styles.playerAvatarSmall} />
            ) : (
              <View style={[styles.playerAvatarSmall, styles.playerAvatarPlaceholder]}>
                <Text style={styles.playerAvatarTextSmall}>{oppName.slice(0, 1)}</Text>
              </View>
            )}
            <Text style={styles.livesText}>{oppName} <Text style={styles.livesHeart}>{'♥'.repeat(oppLife4)}</Text></Text>
          </View>
        </View>
      )}

      {/* 問題文（リスニング時は高さ固定で回答前後・他端末の回答有無で選択肢がずれないようにする） */}
      <View style={[styles.questionContainer, effectiveType === 'listening' && styles.questionContainerListening]}>
        {effectiveType === 'listening' && !answered ? (
          <Text style={styles.prompt}>Listen and choose the best response.</Text>
        ) : (
          <Text style={styles.prompt} numberOfLines={4} ellipsizeMode="tail">
            {currentQuestion.prompt ?? ''}
          </Text>
        )}
      </View>

      {/* Listening: replay button. On mobile, tap plays click then TTS so audio is allowed. */}
      {effectiveType === 'listening' && currentQuestion.prompt && (
        <TouchableOpacity
          style={styles.replayButton}
          onPress={() => {
            const promptText = typeof currentQuestion.prompt === 'string' ? currentQuestion.prompt.trim() : '';
            if (!promptText) return;
            Speech.stop();
            if (Platform.OS !== 'web') {
              playClickSound(); // Tap plays click then TTS so mobile allows playback
              unlockAudioOnUserGestureSync();
              ensureAudioModeForSpeech();
              Speech.speak(promptText, { language: 'en-US' });
            } else {
              Speech.speak(promptText, { language: 'en-US' });
            }
          }}
        >
          <Text style={styles.replayButtonText}>🔊 Play again</Text>
        </TouchableOpacity>
      )}

      {/* 選択肢 */}
      <View style={styles.choicesContainer}>
        {(Array.isArray(currentQuestion.choices) ? currentQuestion.choices : []).map((choice, index) => {
          const isSelected = selectedChoice === index;
          const showCorrect = answered && (
            (typeof correctChoiceIndex === 'number' && index === correctChoiceIndex) ||
            (typeof correctChoiceIndex !== 'number' && serverIsCorrectByQIndex[match.currentQuestionIndex] === true && index === selectedChoice) ||
            (serverWrittenIsCorrect === true && index === selectedChoice)
          );
          const showIncorrect = answered && isSelected && hasDefinitiveWrong;

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.choice,
                isSelected && styles.choiceSelected,
                showCorrect && styles.choiceCorrect,
                showIncorrect && styles.choiceIncorrect,
                answered && !isSelected && styles.choiceDisabled,
              ]}
              onPress={() => handleAnswer(index, false)}
              disabled={answered}
            >
              <Text
                style={[
                  styles.choiceText,
                  isSelected && styles.choiceTextSelected,
                  showCorrect && styles.choiceTextCorrect,
                  showIncorrect && styles.choiceTextIncorrect,
                ]}
              >
                {String.fromCharCode(65 + index)}. {choice}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 解説・次へボタン用のスペースを常に同じ高さで確保し、先に回答した端末に依存せず選択肢の位置を固定 */}
      <View style={styles.afterChoicesArea}>
        {answered && (
          <>
            <View style={styles.explanationContainer}>
              <Text style={styles.explanationLabel}>
                {isCorrect ? '✓ Correct!' : hasDefinitiveWrong ? '✗ Incorrect' : '...'}
              </Text>
              <ScrollView style={styles.explanationScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text style={styles.explanation}>{currentQuestion.explanation ?? ''}</Text>
              </ScrollView>
            </View>
            {match.currentQuestionIndex < (match.questionIds?.length ?? 1) - 1 && (
              <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                <Text style={styles.nextButtonText}>Next question</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.gold,
    textAlign: 'center',
    marginTop: 40,
  },
  waitingSubtext: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  roomCodeContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  roomCodeLabel: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  roomCode: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: COLORS.gold,
  },
  opponentFoundCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  opponentFoundTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 8,
  },
  opponentFoundSubtitle: {
    fontSize: 16,
    color: COLORS.muted,
    marginBottom: 28,
  },
  opponentFoundAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  opponentFoundAvatarPlaceholder: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opponentFoundAvatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.muted,
  },
  opponentFoundName: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  opponentFoundStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 32,
  },
  opponentFoundRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  opponentFoundRatingLabel: {
    fontSize: 14,
    color: COLORS.muted,
  },
  opponentFoundRating: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  opponentFoundTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  opponentFoundTierPiece: {
    fontSize: 22,
    color: COLORS.gold,
  },
  opponentFoundTierLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  opponentFoundButtons: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  opponentFoundButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  opponentFoundButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: 'bold',
  },
  opponentFoundCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  opponentFoundCancelButtonText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  opponentFoundWaitingText: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 12,
  },
  // GrandMaster マッチ成立演出（豪華版）
  gmMatchContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  gmMatchGlow: {
    position: 'absolute',
    top: '20%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(198, 167, 94, 0.08)',
  },
  gmMatchCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A1814',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  gmMatchBadge: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.gold,
    marginBottom: 8,
  },
  gmMatchCrown: {
    fontSize: 36,
    marginBottom: 4,
  },
  gmMatchTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  gmMatchSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 24,
  },
  gmOpponentAvatarRing: {
    marginBottom: 12,
    padding: 4,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.6)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  gmOpponentBlock: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
    paddingHorizontal: 24,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.3)',
  },
  gmOpponentAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  gmOpponentAvatarPlaceholder: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  gmOpponentAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.gold,
  },
  gmOpponentName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  gmOpponentStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  gmOpponentStat: {
    alignItems: 'center',
  },
  gmOpponentStatLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  gmOpponentStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gold,
  },
  gmOpponentTierPiece: {
    fontSize: 24,
    color: COLORS.gold,
  },
  gmMatchActions: {
    width: '100%',
    gap: 12,
  },
  gmMatchButton: {
    backgroundColor: '#2A2218',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  gmMatchButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  gmMatchCancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  gmMatchWaitingText: {
    fontSize: 15,
    color: COLORS.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  gmMatchCancelText: {
    fontSize: 14,
    color: COLORS.muted,
  },
  phaseResultContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  phaseResultGlow: {
    position: 'absolute',
    top: '18%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(198, 167, 94, 0.06)',
  },
  phaseResultCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1814',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  phaseResultBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: COLORS.gold,
    marginBottom: 4,
  },
  phaseResultPhaseLabel: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 20,
  },
  phaseResultWinnerBlock: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.25)',
  },
  phaseResultWinnerBlockYou: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  phaseResultAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  phaseResultAvatarPlaceholder: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  phaseResultAvatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.gold,
  },
  phaseResultCrown: {
    fontSize: 28,
    marginBottom: 4,
  },
  phaseResultWinnerName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  phaseResultWinnerNameYou: {
    color: COLORS.gold,
  },
  phaseResultWinsLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.muted,
  },
  phaseResultDrawIcon: {
    fontSize: 32,
    color: COLORS.muted,
    marginBottom: 6,
  },
  phaseResultDrawText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.muted,
  },
  phaseResultSoundRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  phaseResultSoundLabel: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  phaseResultContinueButton: {
    width: '100%',
    backgroundColor: '#2A2218',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  phaseResultContinueButtonDisabled: {
    opacity: 0.5,
    borderColor: COLORS.muted,
  },
  phaseResultContinueText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  phaseResultContinueTextDisabled: {
    color: COLORS.muted,
  },
  phaseResultAudioNotice: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 12,
    textAlign: 'center',
  },
  phaseResultAudioCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  phaseResultCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gold,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseResultCheckboxChecked: {
    backgroundColor: COLORS.gold,
  },
  phaseResultCheckmark: {
    color: '#1A1814',
    fontSize: 14,
    fontWeight: '800',
  },
  phaseResultAudioCheckLabel: {
    fontSize: 15,
    color: COLORS.text,
  },
  phaseResultCountdownBlock: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
  },
  phaseResultCountdownLabel: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  phaseResultCountdownNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.gold,
  },
  countdownOverlay: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  countdownCard: {
    backgroundColor: '#1A1814',
    borderRadius: 20,
    paddingVertical: 40,
    paddingHorizontal: 48,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  countdownLabel: {
    fontSize: 16,
    color: COLORS.muted,
    marginBottom: 12,
  },
  countdownNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: COLORS.gold,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  questionNumber: {
    fontSize: 16,
    color: COLORS.muted,
  },
  timer: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.incorrect,
  },
  livesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  livesText: {
    fontSize: 16,
    color: COLORS.text,
  },
  livesHeart: {
    color: '#E53935',
  },
  dictationScoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    gap: 12,
  },
  dictationScoreLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  dictationScoreLeading: {
    color: COLORS.gold,
  },
  dictationScoreVs: {
    fontSize: 16,
    color: COLORS.muted,
  },
  playerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.border,
  },
  playerAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
  },
  playerAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.muted,
  },
  playerAvatarTextSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    maxWidth: 100,
  },
  playerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  questionContainer: {
    marginBottom: 32,
  },
  /** リスニング時は問題文エリアの高さを固定し、回答前後・他端末の回答有無で選択肢の位置がずれないようにする */
  questionContainerListening: {
    height: 88,
    justifyContent: 'center',
  },
  prompt: {
    fontSize: 18,
    lineHeight: 28,
    color: COLORS.text,
  },
  choicesContainer: {
    gap: 12,
    marginBottom: 24,
  },
  /** 解説・次へボタンの領域。高さを固定し、回答の有無・どちらの端末が先に回答しても選択肢の位置がずれないようにする */
  afterChoicesArea: {
    height: 200,
  },
  choice: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  choiceSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.primaryHover,
  },
  choiceCorrect: {
    borderColor: COLORS.correct,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  choiceIncorrect: {
    borderColor: COLORS.incorrect,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
  },
  choiceDisabled: {
    opacity: 0.5,
  },
  choiceText: {
    fontSize: 16,
    color: COLORS.text,
  },
  choiceTextSelected: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  choiceTextCorrect: {
    color: COLORS.correct,
    fontWeight: '600',
  },
  choiceTextIncorrect: {
    color: COLORS.incorrect,
    fontWeight: '600',
  },
  explanationContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    maxHeight: 100,
  },
  explanationScroll: {
    flexGrow: 0,
  },
  explanationLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: COLORS.text,
  },
  explanation: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 20,
  },
  nextButton: {
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  nextButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  replayButton: {
    alignSelf: 'flex-end',
    padding: 12,
    marginBottom: 20,
  },
  replayButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  dictationDisplayArea: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  dictationDisplayText: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: 4,
    textAlign: 'center',
    color: COLORS.text,
  },
  dictationDisplayChar: {
    color: COLORS.correct,
  },
  dictationPlaceholder: {
    color: COLORS.border,
  },
  dictationInput: {
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  dictationResult: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  dictationResultText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.incorrect,
    marginBottom: 8,
  },
  dictationResultCorrect: {
    color: COLORS.correct,
  },
  dictationQuestionScores: {
    marginTop: 8,
    marginBottom: 4,
  },
  dictationQuestionScoresLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  },
  dictationQuestionScoresValues: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  dictationAnswerText: {
    fontSize: 16,
    color: COLORS.muted,
    marginTop: 4,
  },
});

