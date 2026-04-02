import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  ScrollView,
  Platform,
  Dimensions,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
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
import { applyDictationMatchInputChange } from '../../lib/dictation-match-input';
import { getQuestionById, isLocalQuestionId } from '../../lib/study-questions';
import { getListeningQuestionById, isListeningQuestionId, shuffleListeningChoices, shuffleListeningChoicesWithSeed } from '../../lib/listening-response-questions';
import { ensureAudioModeForSpeech, unlockAudioOnUserGesture, unlockAudioOnUserGestureAsync, unlockAudioOnUserGestureSync } from '../../lib/audio-mode';
import { COLORS } from '../../lib/theme';
import { AI_AVATAR_SOURCE } from '../../lib/ai-avatar';
import { playBattleSound } from '../../lib/battle-sound';
import { addStudyTimeToday } from '../../lib/study-time-today';
import { playClickSound, preloadClickSound } from '../../lib/click-sound';
import { preloadWinSound } from '../../lib/win-sound';
import * as Speech from 'expo-speech';
import { pickRandomAiBattleBackground } from '../../lib/battle-ai-backgrounds';
import { pickRandomRankedBattleBackground } from '../../lib/battle-ranked-backgrounds';
import { pickRandomFriendBattleBackground } from '../../lib/battle-friend-backgrounds';
import { useMatchHeroBackgroundSetter } from './MatchHeroBackground';

/** ホーム（battle）と同じ競技ロビー用タイポグラフィ */
const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'Inter, system-ui, sans-serif' }),
  numeric: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
};

/** 1 問あたりの制限時間（秒）。タイマー演出の正規化に使用 */
const MATCH_QUESTION_TIME_SEC = 20;

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
  const { width: layoutWindowWidth, height: layoutWindowHeight } = useWindowDimensions();
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
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  /** いま表示中のフェーズ結果の dismissIndex（携帯で勝者画面を飛ばさないよう、フェーズが変わったら承認をリセット） */
  const lastPhaseResultDismissIndexRef = useRef<number>(-1);
  /** タイマー effect の依存を安定させるため（onSnapshot で match が変わるたびに effect が走ると PC でタイマーが進まない） */
  const handleAnswerRef = useRef<((choiceIndex: number, forceTimeout?: boolean) => Promise<void>) | null>(null);
  const handleDictationSubmitRef = useRef<((textAnswer: string) => Promise<void>) | null>(null);
  /** 相手画面を閉じたあと初回だけ問題をロードしたか（2問目以降は onSnapshot 側でロードする） */
  const firstQuestionLoadedRef = useRef(false);
  /** リスニング/ディクテーションの音声を「画面切り替え後」に1回だけ再生するためのキー（qIndex+本文） */
  const lastAudioPlayedKeyRef = useRef<string>('');
  /** いま画面に確定表示されている問題の音声キー（遅延再生の競合防止） */
  const currentDisplayedAudioKeyRef = useRef<string>('');
  /** 直近の音声再生セッション。新しい再生開始時に更新し、古いコールバックを無効化する */
  const speechSessionRef = useRef<number>(0);
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
  /** 対戦の学習時間を記録済みの qIndex（1問1回だけ） */
  const battleTimeRecordedForQIndexRef = useRef<Set<number>>(new Set());
  /** aborted 通知を重複表示しない */
  const abortedNotifiedRef = useRef(false);

  const setMatchHeroBackground = useMatchHeroBackgroundSetter();
  /** AI / ランクマ / フレンドごとにマッチ ID 単位で 1 回だけランダム背景 */
  const matchHeroBgAppliedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    const setter = setMatchHeroBackground;
    if (!setter) return;
    const mid = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
    const mode = match?.mode;
    const useHero = mode === 'ai' || mode === 'ranked' || mode === 'friend';
    if (!mid || !useHero) {
      matchHeroBgAppliedForIdRef.current = null;
      setter(undefined);
      return;
    }
    if (matchHeroBgAppliedForIdRef.current !== mid) {
      matchHeroBgAppliedForIdRef.current = mid;
      const src =
        mode === 'ai'
          ? pickRandomAiBattleBackground()
          : mode === 'ranked'
            ? pickRandomRankedBattleBackground()
            : pickRandomFriendBattleBackground();
      setter(src);
    }
  }, [id, match?.id, match?.mode, setMatchHeroBackground]);

  useEffect(() => {
    const setter = setMatchHeroBackground;
    return () => {
      matchHeroBgAppliedForIdRef.current = null;
      setter?.(undefined);
    };
  }, [setMatchHeroBackground]);

  // GrandMaster: マッチが変わったらセグメント結果の dismiss 状態をリセット
  useEffect(() => {
    setDismissedPhaseResultAt(null);
    battleTimeRecordedForQIndexRef.current = new Set();
    abortedNotifiedRef.current = false;
  }, [id]);

  // Continue や「Play again」でクリック音を鳴らすため、マッチ画面でもプリロード
  useEffect(() => {
    if (id) preloadClickSound();
  }, [id]);

  // 問題切替・画面遷移時は必ず既存のTTSを止め、古いコールバックを無効化
  useEffect(() => {
    speechSessionRef.current += 1;
    Speech.stop();
  }, [id, match?.status, match?.currentQuestionIndex]);

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
        if (__DEV__ && Platform.OS === 'web') {
          const ss = typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
          console.log('[Audio] Web playDictationAudio:', { word, speaking: ss?.speaking, pending: ss?.pending });
        }
        let startFired = false;
        Speech.speak(word, {
          language: 'en-US',
          onStart: () => {
            if (sessionId !== speechSessionRef.current) return;
            startFired = true;
            if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: dictation speak started');
          },
          onDone: () => {
            if (sessionId !== speechSessionRef.current) return;
            setIsPlayingAudio(false);
            resolve();
            if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: dictation speak done');
          },
          onError: (error) => {
            if (sessionId !== speechSessionRef.current) return;
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
    lastAudioPlayedKeyRef.current = '';
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
      if (matchData.status === 'aborted') {
        if (!abortedNotifiedRef.current) {
          abortedNotifiedRef.current = true;
          const abortedBy = (matchData as Match & { abortedBy?: string }).abortedBy;
          const byMe = abortedBy != null && abortedBy === uid;
          Alert.alert(
            'Match cancelled',
            byMe ? 'Match cancelled.' : 'Opponent cancelled the match.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
        }
        setLoading(false);
        return;
      }
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
    if (!match || match.status !== 'playing' || !currentQuestion) {
      currentDisplayedAudioKeyRef.current = '';
      return;
    }
    const qIndex = match.currentQuestionIndex ?? 0;
    const effectiveType = getEffectiveQuestionType(match, qIndex);
    const listeningPrompt =
      effectiveType === 'listening' && typeof currentQuestion.prompt === 'string'
        ? currentQuestion.prompt.trim()
        : '';
    const dictationWord = effectiveType === 'dictation' ? getCorrectWord(currentQuestion) : '';
    currentDisplayedAudioKeyRef.current = effectiveType === 'listening'
      ? `listening:${qIndex}:${listeningPrompt}`
      : `dictation:${qIndex}:${dictationWord}`;
  }, [match?.status, match?.currentQuestionIndex, match?.questionType, match?.choiceCount, match?.listeningCount, currentQuestion]);

  useEffect(() => {
    let cancelled = false;
    if (!match || match.status !== 'playing' || !currentQuestion) return;
    const gameStartsAtMs = getTimestampMillis(match?.gameStartsAt);
    if (gameStartsAtMs > 0 && gameStartsAtMs > Date.now()) return; // カウントダウン中は再生しない
    const qIndex = match.currentQuestionIndex ?? 0;
    if (Platform.OS !== 'web' && !audioAcknowledgedForMatchRef.current) return;
    if (currentQuestionForIndexRef.current !== qIndex) return;

    const choiceCount = match.choiceCount ?? 10;
    const listeningCount = match.listeningCount ?? 10;
    const effectiveType = getEffectiveQuestionType(match, qIndex);
    const listeningPrompt =
      effectiveType === 'listening' && typeof currentQuestion.prompt === 'string'
        ? currentQuestion.prompt.trim()
        : '';
    const dictationWord = effectiveType === 'dictation' ? getCorrectWord(currentQuestion) : '';
    const audioKey = effectiveType === 'listening'
      ? `listening:${qIndex}:${listeningPrompt}`
      : `dictation:${qIndex}:${dictationWord}`;
    if (lastAudioPlayedKeyRef.current === audioKey) return;
    // 表示確定済みの問題と一致しない音声は再生しない（古い非同期処理の再生防止）
    if (currentDisplayedAudioKeyRef.current !== audioKey) return;

    const isSegmentStartListening = match.questionType === 'overall' && qIndex === choiceCount;
    const isSegmentStartDictation = match.questionType === 'overall' && qIndex === choiceCount + listeningCount;
    const screenReadyForListening = effectiveType === 'listening' && (!isSegmentStartListening || dismissedPhaseResultAt === choiceCount);
    const screenReadyForDictation = effectiveType === 'dictation' && (!isSegmentStartDictation || dismissedPhaseResultAt === choiceCount + listeningCount);

    if (screenReadyForListening && currentQuestion.prompt) {
      const promptText = listeningPrompt;
      if (promptText) {
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
          if (cancelled) return;
          // 問題が差し替わった後の遅延再生を防ぐ
          if (currentQuestionForIndexRef.current !== qIndex) return;
          if (currentDisplayedAudioKeyRef.current !== audioKey) return;
          if (lastAudioPlayedKeyRef.current === audioKey) return;
          const sessionId = ++speechSessionRef.current;
          lastAudioPlayedKeyRef.current = audioKey;
          let startFired = false;
          Speech.stop();
          console.log('[Audio][auto][listening] speak start', { qIndex, audioKey, promptLength: promptText.length });
          Speech.speak(promptText, {
            language: 'en-US',
            onStart: () => {
              if (sessionId !== speechSessionRef.current) return;
              startFired = true;
              console.log('[Audio][auto][listening] onStart', { qIndex, audioKey });
              if (__DEV__ && Platform.OS === 'web') console.log('[Audio] Web: listening speak started');
            },
            onError: (e) => {
              if (sessionId !== speechSessionRef.current) return;
              console.warn('[Audio][auto][listening] onError', { qIndex, audioKey, error: e });
              if (__DEV__ && Platform.OS === 'web') console.warn('[Audio] Web Speech.speak error:', e);
            },
            onDone: () => {
              if (sessionId !== speechSessionRef.current) return;
              console.log('[Audio][auto][listening] onDone', { qIndex, audioKey });
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
      const correctWord = dictationWord;
      if (correctWord) {
        if (cancelled) return;
        if (currentQuestionForIndexRef.current !== qIndex) return;
        if (currentDisplayedAudioKeyRef.current !== audioKey) return;
        if (lastAudioPlayedKeyRef.current === audioKey) return;
        lastAudioPlayedKeyRef.current = audioKey;
        if (__DEV__ && Platform.OS === 'web') {
          const ss = typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
          console.log('[Audio] Web: attempting Speech.speak for dictation', {
            qIndex,
            word: correctWord,
            speechSynthesisSpeaking: ss?.speaking,
            speechSynthesisPending: ss?.pending,
          });
        }
        console.log('[Audio][auto][dictation] speak start', { qIndex, audioKey, wordLength: correctWord.length });
        playDictationAudio(correctWord).then(() => {
          if (cancelled) return;
          console.log('[Audio][auto][dictation] speak done', { qIndex, audioKey });
          setTimeout(() => dictationInputRef.current?.focus(), 500);
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [match?.status, match?.currentQuestionIndex, match?.gameStartsAt, match?.questionType, match?.choiceCount, match?.listeningCount, currentQuestion, dismissedPhaseResultAt, playDictationAudio, countdownTick, aiSoundEnabledTrigger]);

  // ディクテーション用の回答処理
  const handleDictationSubmit = useCallback(async (textAnswer: string) => {
    if (!match || !auth.currentUser || answered) return;
    
    const qIndex = match.currentQuestionIndex ?? 0;
    if (!battleTimeRecordedForQIndexRef.current.has(qIndex)) {
      battleTimeRecordedForQIndexRef.current.add(qIndex);
      const elapsedSec = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
      if (elapsedSec > 0) addStudyTimeToday('battle', elapsedSec);
    }
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
    const submittedQIndex = match.currentQuestionIndex ?? 0;
    if (!battleTimeRecordedForQIndexRef.current.has(submittedQIndex)) {
      battleTimeRecordedForQIndexRef.current.add(submittedQIndex);
      const elapsedSec = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
      if (elapsedSec > 0) addStudyTimeToday('battle', elapsedSec);
    }

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

  const handleCancelMatch = useCallback(async () => {
    if (cancelSubmitting) return;
    setCancelSubmitting(true);
    try {
      if (id && (match?.status === 'waiting' || match?.status === 'matched')) {
        const abort = httpsCallable(functions, 'abortMatch');
        const res = await abort({ matchId: id });
        console.log('[Match] abortMatch success:', res.data);
        router.back();
        return;
      }
      router.back();
    } catch (e) {
      console.warn('[Match] abortMatch warning:', e);
      Alert.alert('Cancel failed', 'Failed to cancel match. Please try again.');
      setCancelSubmitting(false);
    }
  }, [cancelSubmitting, id, match?.status, router]);

  // ディクテーション用の入力処理（useCallbackでメモ化して実機での動作を安定化）
  // フックの順序を保つため、早期リターンの前に配置
  const handleDictationInputChange = useCallback(
    (text: string) => {
      if (!currentQuestion || answered) return;
      applyDictationMatchInputChange(text, answered, {
        correctWord: getCorrectWord(currentQuestion),
        displayedCharsRef,
        dictationInputStateRef,
        lastWrongAudioAtRef,
        setDisplayedChars,
        setDictationInput,
        setIsDictationCorrectLocal,
        playDictationAudio,
        onCorrectComplete: handleDictationSubmit,
      });
    },
    [currentQuestion, answered, handleDictationSubmit, playDictationAudio]
  );

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
        <TouchableOpacity style={styles.nextButton} onPress={handleCancelMatch} disabled={cancelSubmitting}>
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
                unlockAudioOnUserGestureSync();
                unlockAudioOnUserGestureAsync();
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
              <TouchableOpacity style={styles.gmMatchCancelButton} onPress={handleCancelMatch} disabled={cancelSubmitting}>
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
              unlockAudioOnUserGestureSync();
              unlockAudioOnUserGestureAsync();
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
              onPress={handleCancelMatch}
              disabled={cancelSubmitting}
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
            unlockAudioOnUserGestureSync();
            unlockAudioOnUserGestureAsync();
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
    isLeading?: boolean,
    align: 'left' | 'right' = 'left',
    avatarAsset?: ImageSourcePropType
  ) => (
    <View style={[styles.playerSide, align === 'right' && styles.playerSideRight]} key={uidKey}>
      {avatarAsset != null ? (
        avatarAsset === AI_AVATAR_SOURCE ? (
          <Image source={AI_AVATAR_SOURCE} style={styles.playerAvatar} resizeMode="cover" />
        ) : (
          <Image source={avatarAsset} style={styles.playerAvatar} resizeMode="cover" />
        )
      ) : avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.playerAvatar} />
      ) : (
        <View style={[styles.playerAvatar, styles.playerAvatarPlaceholder]}>
          <Text style={styles.playerAvatarText}>{name.slice(0, 1)}</Text>
        </View>
      )}
      <View style={[styles.playerMeta, align === 'right' && styles.playerMetaRight]}>
        <Text style={[styles.playerName, isLeading && styles.dictationScoreLeading]} numberOfLines={1}>
          {name}
        </Text>
        {value !== '' && <Text style={[styles.playerValue, isLeading && styles.dictationScoreLeading]}>{value}</Text>}
      </View>
    </View>
  );

  const renderLifeHearts = (lives: number, total = 3, iconFontSize = 18) => {
    const lh = Math.round(iconFontSize * 1.32);
    return (
      <View style={[styles.heartsRow, { gap: Math.max(4, Math.round(iconFontSize * 0.26)) }]}>
        {Array.from({ length: total }, (_, i) => {
          const active = i < lives;
          return (
            <Text
              key={i}
              style={[
                styles.heartIcon,
                active ? styles.heartIconActive : styles.heartIconInactive,
                { fontSize: iconFontSize, lineHeight: lh },
              ]}
            >
              {active ? '♥' : '♡'}
            </Text>
          );
        })}
      </View>
    );
  };

  const effectiveType = match ? getEffectiveQuestionType(match, match.currentQuestionIndex ?? 0) : 'choice';

  const myLife4 = match.lives?.[uid] ?? 3;
  const oppLife4 = match.lives?.[opponentUid] ?? 3;

  const timerUrgent = timeRemaining <= 8 && timeRemaining > 0 && !answered;
  const timerDrainFlex = Math.max(0, MATCH_QUESTION_TIME_SEC - timeRemaining);

  /**
   * 対戦ヘッダー：親幅（container の padding を除く）に追従。固定 px 幅は持たない。
   * 円アイコンは表示領域の高さを基準にし、列幅（max 42%）と幅比率で上限をかける。
   */
  const headerContentWidth = Math.max(260, layoutWindowWidth - 28);
  const matchHeaderViewportH = Math.max(280, layoutWindowHeight - safeTop - insets.bottom);
  /** 携帯縦：4択が一画面に収まるようヘッダー・問題・選択肢を詰める */
  const compactBattleLayout = layoutWindowHeight < 820 || layoutWindowWidth < 440;
  const matchDuelAvatarMaxFromSlot = headerContentWidth * 0.42 * 0.86;
  const avHFactor = compactBattleLayout ? 0.086 : 0.118;
  const avMax = compactBattleLayout ? 128 : 196;
  const avMin = compactBattleLayout ? 44 : 56;
  const avWidthCap = compactBattleLayout ? 0.2 : 0.26;
  const matchDuelAvatarPx = Math.round(
    Math.min(
      avMax,
      Math.max(
        avMin,
        Math.min(matchHeaderViewportH * avHFactor, matchDuelAvatarMaxFromSlot, headerContentWidth * avWidthCap),
      ),
    ),
  );
  const matchVsVisualScale =
    layoutWindowWidth < 340 ? 5.25 : layoutWindowWidth < 400 ? 6.25 : layoutWindowWidth < 520 ? 7.25 : 8.5;
  const matchVsScaleEffective = matchVsVisualScale * (compactBattleLayout ? 0.72 : 1);
  /** 携帯縦：問題カード内の flexGrow 中央寄せが余白を食い、選択肢が画面外＋はみ出し先が白背景になるのを防ぐ */
  const matchScrollBottomPad =
    Math.max(insets.bottom, 12) + (Platform.OS === 'web' ? 36 : 16) + (compactBattleLayout ? 12 : 0);
  /** 未回答時は最小限にして A〜D を優先（回答後は解説で伸びる・ScrollView で閲覧可） */
  const afterChoicesReserveH = compactBattleLayout ? 48 : 200;
  const questionBlockMinH =
    effectiveType === 'listening'
      ? compactBattleLayout
        ? 112
        : 204
      : effectiveType === 'dictation'
        ? compactBattleLayout
          ? 120
          : 212
        : compactBattleLayout
          ? 124
          : 220;
  const matchDuelAvatarRound = {
    width: matchDuelAvatarPx,
    height: matchDuelAvatarPx,
    borderRadius: matchDuelAvatarPx / 2,
    backgroundColor: COLORS.border,
  };
  const matchDuelAvatarInitialFontSize = Math.max(compactBattleLayout ? 14 : 16, Math.round(matchDuelAvatarPx * 0.34));
  const matchDuelNameFontSize = Math.max(compactBattleLayout ? 11 : 14, Math.round(matchDuelAvatarPx * 0.125));

  const dictationCorrectWord = effectiveType === 'dictation' ? getCorrectWord(currentQuestion) : '';
  const dictationUserAnswer =
    effectiveType === 'dictation' ? match.answers?.[uid]?.[match.currentQuestionIndex] : undefined;
  const dictationOppAnswer =
    effectiveType === 'dictation' ? match.answers?.[opponentUid]?.[match.currentQuestionIndex] : undefined;
  const isDictationCorrectResult =
    effectiveType === 'dictation' && (isDictationCorrectLocal || (dictationUserAnswer?.isCorrect ?? false));
  const dictationMyQScore =
    effectiveType === 'dictation' && dictationUserAnswer?.finalScore != null
      ? Number(dictationUserAnswer.finalScore.toFixed(3))
      : null;
  const dictationOppQScore =
    effectiveType === 'dictation' && dictationOppAnswer?.finalScore != null
      ? Number(dictationOppAnswer.finalScore.toFixed(3))
      : null;

  return (
    <View style={[styles.container, { paddingTop: safeTop, paddingBottom: compactBattleLayout ? 8 : 20 }]}>
      <ScrollView
        style={styles.matchPlayingScroll}
        contentContainerStyle={[styles.matchPlayingScrollContent, { paddingBottom: matchScrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={Platform.OS !== 'web'}
      >
      <View style={[styles.duelStageColumn, compactBattleLayout && styles.duelStageColumnCompact]}>
        {/* 1. アイコン帯：円の下に名前→ハート（VS 中央）— ディクテ含む全モード共通 */}
        <View style={[styles.matchIconsPlaque, compactBattleLayout && styles.matchIconsPlaqueCompact]}>
            <View style={styles.matchIconsRim}>
              <View style={[styles.matchIconsFace, compactBattleLayout && styles.matchIconsFaceCompact]}>
                <View style={styles.towerDuelistLeft}>
                  <View style={[styles.towerDuelistStack, compactBattleLayout && styles.towerDuelistStackCompact]}>
                    <View style={[styles.towerAvatarRingBlue, compactBattleLayout && styles.towerAvatarRingCompact]}>
                      {myUser?.avatarUrl ? (
                        <Image source={{ uri: myUser.avatarUrl }} style={[matchDuelAvatarRound]} resizeMode="cover" />
                      ) : (
                        <View style={[matchDuelAvatarRound, styles.playerAvatarPlaceholder]}>
                          <Text style={[styles.playerAvatarTextSmall, { fontSize: matchDuelAvatarInitialFontSize }]}>
                            {myName.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.towerDuelistNameUnder}>
                      <Text
                        style={[
                          styles.towerDuelistName,
                          styles.towerDuelistNameBelowAvatar,
                          {
                            fontSize: matchDuelNameFontSize,
                            lineHeight: Math.round(matchDuelNameFontSize * 1.32),
                          },
                        ]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {myName}
                      </Text>
                    </View>
                    {match.lives != null ? (
                      <View style={styles.towerHeartsBelowName}>
                        {renderLifeHearts(myLife4, 3, matchDuelNameFontSize)}
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.altarVsEmblem} pointerEvents="none">
                  <View style={[styles.altarVsEmblemInner, { transform: [{ scale: matchVsScaleEffective }] }]}>
                    <Text style={styles.altarVsEmblemText}>VS</Text>
                  </View>
                </View>
                <View style={styles.towerDuelistRight}>
                  <View style={[styles.towerDuelistStack, compactBattleLayout && styles.towerDuelistStackCompact]}>
                    <View style={[styles.towerAvatarRingEmber, compactBattleLayout && styles.towerAvatarRingCompact]}>
                      {opponentUid === 'ai' ? (
                        <Image source={AI_AVATAR_SOURCE} style={[matchDuelAvatarRound]} resizeMode="cover" />
                      ) : opponentUser?.avatarUrl ? (
                        <Image
                          source={{ uri: opponentUser.avatarUrl }}
                          style={[matchDuelAvatarRound]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[matchDuelAvatarRound, styles.playerAvatarPlaceholder]}>
                          <Text style={[styles.playerAvatarTextSmall, { fontSize: matchDuelAvatarInitialFontSize }]}>
                            {oppName.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.towerDuelistNameUnder}>
                      <Text
                        style={[
                          styles.towerDuelistName,
                          styles.towerDuelistNameBelowAvatar,
                          {
                            fontSize: matchDuelNameFontSize,
                            lineHeight: Math.round(matchDuelNameFontSize * 1.32),
                          },
                        ]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {oppName}
                      </Text>
                    </View>
                    {match.lives != null ? (
                      <View style={styles.towerHeartsBelowName}>
                        {renderLifeHearts(oppLife4, 3, matchDuelNameFontSize)}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </View>

        <View style={[styles.boardPanelWrap, compactBattleLayout && styles.boardPanelWrapCompact]}>
          <View style={[styles.boardPanelOuter, compactBattleLayout && styles.boardPanelOuterCompact]}>
            <View style={styles.boardPanelInner}>
              <View
                style={[
                  styles.questionContainer,
                  effectiveType === 'listening' && styles.questionContainerListening,
                  effectiveType === 'dictation' && styles.questionContainerDictation,
                  { minHeight: questionBlockMinH },
                ]}
              >
                <View
                  style={[styles.boardPanelRegisterLine, compactBattleLayout && styles.boardPanelRegisterLineCompact]}
                  pointerEvents="none"
                />
                <View style={[styles.boardProgressCorner, compactBattleLayout && styles.boardProgressCornerCompact]} pointerEvents="none">
                  <Text
                    style={[styles.boardProgressValue, compactBattleLayout && styles.boardProgressValueCompact]}
                    numberOfLines={1}
                  >
                    QUESTION {match.currentQuestionIndex + 1} / {(match.questionIds?.length ?? 0)}
                  </Text>
                </View>
                <View style={[styles.battlefieldContent, compactBattleLayout && styles.battlefieldContentCompact]}>
                  <View style={[styles.promptScrim, compactBattleLayout && styles.promptScrimCompact]}>
                    {effectiveType === 'dictation' ? (
                      <View style={styles.dictationInCardColumn}>
                        {!!currentQuestion.prompt && (
                          <Text style={styles.dictationInstructionText} numberOfLines={4}>
                            {currentQuestion.prompt}
                          </Text>
                        )}
                        <Text style={styles.dictationDisplayTextInCard}>
                          {(() => {
                            const correctWord = dictationCorrectWord;
                            const correctWordLower = correctWord.toLowerCase();
                            const displayedWithoutSpaces = displayedChars.replace(/\s/g, '');
                            let displayedIndex = 0;
                            const result: ReactElement[] = [];
                            for (let i = 0; i < correctWordLower.length; i++) {
                              if (correctWordLower[i] === ' ') {
                                result.push(
                                  <Text key={i} style={styles.dictationPlaceholderInCard}>
                                    {' '}
                                  </Text>,
                                );
                              } else if (displayedIndex < displayedWithoutSpaces.length) {
                                result.push(
                                  <Text key={i} style={styles.dictationDisplayCharInCard}>
                                    {displayedWithoutSpaces[displayedIndex]}
                                  </Text>,
                                );
                                displayedIndex++;
                              } else {
                                result.push(
                                  <Text key={i} style={styles.dictationPlaceholderInCard}>
                                    _
                                  </Text>,
                                );
                              }
                            }
                            return result;
                          })()}
                        </Text>
                      </View>
                    ) : effectiveType === 'listening' && !answered ? (
                      <Text style={[styles.promptListeningCue, compactBattleLayout && styles.promptListeningCueCompact]}>
                        Listen and choose the best response.
                      </Text>
                    ) : (
                      <Text
                        style={[
                          styles.prompt,
                          !answered && styles.promptLive,
                          compactBattleLayout && styles.promptCompact,
                        ]}
                        numberOfLines={6}
                        ellipsizeMode="tail"
                      >
                        {currentQuestion.prompt ?? ''}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.boardTimeFooter, compactBattleLayout && styles.boardTimeFooterCompact]}>
                <View style={[styles.boardTimeFooterHeader, compactBattleLayout && styles.boardTimeFooterHeaderCompact]}>
                  <Text
                    style={[
                      styles.matchLimitBarTimer,
                      compactBattleLayout && styles.matchLimitBarTimerCompact,
                      timerUrgent && styles.altarHudTimerUrgent,
                    ]}
                  >
                    {formatTime(timeRemaining)}
                  </Text>
                </View>
                <View style={[styles.matchLimitBarTrack, compactBattleLayout && styles.matchLimitBarTrackCompact]} pointerEvents="none">
                  <View
                    style={[
                      styles.matchLimitBarRemain,
                      { flex: Math.max(0.001, timeRemaining) },
                      timerUrgent && styles.matchLimitBarRemainUrgent,
                    ]}
                  />
                  <View style={[styles.matchLimitBarSpent, { flex: Math.max(0.001, timerDrainFlex) }]} />
                </View>
              </View>
            </View>
          </View>
        </View>
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

      {effectiveType === 'dictation' && !!dictationCorrectWord && (
        <TouchableOpacity
          style={styles.replayButton}
          onPress={() => playDictationAudio(dictationCorrectWord)}
          disabled={isPlayingAudio}
        >
          <Text style={styles.replayButtonText}>🔊 Play again</Text>
        </TouchableOpacity>
      )}

      {effectiveType === 'dictation' && (
        <TextInput
          ref={dictationInputRef}
          style={styles.dictationInputMatch}
          value={dictationInput}
          onChangeText={handleDictationInputChange}
          placeholder="Type here"
          placeholderTextColor="rgba(164, 176, 196, 0.55)"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!answered}
        />
      )}

      {/* 選択肢（4択・リスニング） */}
      {effectiveType !== 'dictation' && (
      <View style={[styles.choicesContainer, compactBattleLayout && styles.choicesContainerCompact]}>
        {(Array.isArray(currentQuestion.choices) ? currentQuestion.choices : []).map((choice, index) => {
          const isSelected = selectedChoice === index;
          const showCorrect = answered && (
            (typeof correctChoiceIndex === 'number' && index === correctChoiceIndex) ||
            (typeof correctChoiceIndex !== 'number' && serverIsCorrectByQIndex[match.currentQuestionIndex] === true && index === selectedChoice) ||
            (serverWrittenIsCorrect === true && index === selectedChoice)
          );
          const showIncorrect = answered && isSelected && hasDefinitiveWrong;

          return (
            <Pressable
              key={index}
              disabled={answered}
              onPress={() => handleAnswer(index, false)}
              android_ripple={{ color: 'rgba(255,255,255,0.07)' }}
              style={({ pressed }) => [
                styles.altarCommandPlate,
                compactBattleLayout && styles.altarCommandPlateCompact,
                styles.choiceTowerStripe,
                isSelected && !answered && styles.choiceSelectedLocked,
                showCorrect && styles.choiceCorrect,
                showIncorrect && styles.choiceIncorrect,
                answered && !isSelected && styles.choiceDisabled,
                pressed &&
                  !answered &&
                  (isSelected ? styles.choicePressedCommitted : styles.choicePressed),
              ]}
            >
              <View style={[styles.altarCommandRow, compactBattleLayout && styles.altarCommandRowCompact]}>
                <View
                  style={[
                    styles.altarCommandShield,
                    compactBattleLayout && styles.altarCommandShieldCompact,
                    styles.choiceBadgeLetter,
                    isSelected && styles.choiceLetterBadgeSelected,
                    showCorrect && styles.choiceLetterBadgeCorrect,
                    showIncorrect && styles.choiceLetterBadgeIncorrect,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceLetter,
                      compactBattleLayout && styles.choiceLetterCompact,
                      isSelected && styles.choiceTextSelected,
                      showCorrect && styles.choiceTextCorrect,
                      showIncorrect && styles.choiceTextIncorrect,
                    ]}
                  >
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <View style={[styles.altarCommandBody, compactBattleLayout && styles.altarCommandBodyCompact]}>
                  <Text
                    style={[
                      styles.choiceText,
                      compactBattleLayout && styles.choiceTextCompact,
                      isSelected && styles.choiceTextSelected,
                      showCorrect && styles.choiceTextCorrect,
                      showIncorrect && styles.choiceTextIncorrect,
                    ]}
                  >
                    {choice}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      )}

      {/* 解説・次へボタン用のスペースを常に同じ高さで確保し、先に回答した端末に依存せず選択肢の位置を固定 */}
      <View style={[styles.afterChoicesArea, { height: afterChoicesReserveH }]}>
        {answered && effectiveType === 'dictation' && (
          <>
            <View style={[styles.explanationContainer, styles.dictationResultMatch]}>
              <Text
                style={[
                  styles.explanationLabel,
                  isDictationCorrectResult && styles.dictationResultCorrectLabel,
                  !isDictationCorrectResult && hasDefinitiveWrong && styles.dictationResultIncorrectLabel,
                ]}
              >
                {isDictationCorrectResult ? '✓ Correct!' : hasDefinitiveWrong ? '✗ Incorrect' : '...'}
              </Text>
              {(dictationMyQScore != null || dictationOppQScore != null) && (
                <View style={styles.dictationQuestionScores}>
                  <Text style={styles.dictationQuestionScoresLabel}>Round scores</Text>
                  <Text style={styles.dictationQuestionScoresValues}>
                    {myName}: {dictationMyQScore != null ? dictationMyQScore : '—'} · {oppName}:{' '}
                    {dictationOppQScore != null ? dictationOppQScore : '—'}
                  </Text>
                </View>
              )}
              <ScrollView style={styles.explanationScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text style={styles.explanation}>
                  <Text style={styles.dictationResultAnswerLead}>Answer: </Text>
                  {dictationCorrectWord}
                </Text>
                {!!dictationUserAnswer?.textAnswer && (
                  <Text style={styles.dictationAnswerText}>
                    {myName}
                    {"'s answer: "}
                    {dictationUserAnswer.textAnswer}
                  </Text>
                )}
              </ScrollView>
            </View>
            {match.currentQuestionIndex < (match.questionIds?.length ?? 1) - 1 && (
              <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                <Text style={styles.nextButtonText}>Next question</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {answered && effectiveType !== 'dictation' && (
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
    position: 'relative',
    minWidth: 0,
    maxWidth: '100%',
  },
  /** モバイル Web：縦はみ出しで半透明ボタンが body の白に乗るのを防ぐ（中でスクロール） */
  matchPlayingScroll: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    backgroundColor: 'transparent',
  },
  matchPlayingScrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  /** メイン列（choice / listening） */
  duelStageColumn: {
    zIndex: 1,
    marginBottom: 8,
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  duelStageColumnCompact: {
    marginBottom: 4,
  },
  /** 問題パネル左上の進捗 */
  boardProgressCorner: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 4,
    maxWidth: '62%',
  },
  boardProgressCornerCompact: {
    top: 7,
    left: 8,
    maxWidth: '70%',
  },
  /** 問題文（prompt）と同じタイポスケール */
  boardProgressValue: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.4,
    fontFamily: FONT.display,
    fontVariant: ['tabular-nums'],
  },
  boardProgressValueCompact: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.25,
  },
  /** 問題カード下端と一体の TIME 帯（独立枠なし） */
  boardTimeFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(198, 167, 94, 0.28)',
    backgroundColor: 'rgba(23, 35, 52, 0.45)',
    paddingBottom: 11,
  },
  boardTimeFooterCompact: {
    paddingBottom: 5,
  },
  boardTimeFooterHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  boardTimeFooterHeaderCompact: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 3,
  },
  matchLimitBarTimer: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.4,
    fontFamily: FONT.display,
    fontVariant: ['tabular-nums'],
  },
  matchLimitBarTimerCompact: {
    fontSize: 17,
    letterSpacing: 0.28,
  },
  matchLimitBarTrack: {
    height: 11,
    flexDirection: 'row',
    borderRadius: 5,
    overflow: 'hidden',
    marginHorizontal: 14,
    backgroundColor: 'rgba(6, 10, 18, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.3)',
  },
  matchLimitBarTrackCompact: {
    height: 8,
    marginHorizontal: 10,
  },
  matchLimitBarRemain: {
    backgroundColor: 'rgba(198, 167, 94, 0.74)',
  },
  matchLimitBarRemainUrgent: {
    backgroundColor: 'rgba(190, 155, 95, 0.82)',
  },
  matchLimitBarSpent: {
    backgroundColor: 'rgba(18, 26, 40, 0.62)',
  },
  /** 残りわずか：金系に寄せた警告（暖オレンジは抑える） */
  altarHudTimerUrgent: {
    color: 'rgba(224, 198, 138, 0.98)',
  },
  /** 上段：アイコン／名前対峙 — 問題カード列と同じ親幅にストレッチ */
  matchIconsPlaque: {
    marginBottom: 5,
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  matchIconsPlaqueCompact: {
    marginBottom: 2,
  },
  /** 背景は matchIconsFace のみ（リムは枠＋隙間用で塗らない＝二重にならない） */
  matchIconsRim: {
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
    padding: 1,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.28)',
  },
  matchIconsFace: {
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: '2.5%',
    backgroundColor: 'rgba(23, 35, 52, 0.46)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#243349',
    borderLeftColor: 'rgba(143, 182, 255, 0.18)',
    borderRightColor: 'rgba(210, 120, 105, 0.18)',
    overflow: 'visible',
  },
  matchIconsFaceCompact: {
    paddingVertical: 4,
    paddingHorizontal: '2%',
    gap: 2,
  },
  /** 中央カラム：レイアウト上の最小幅を確保し、左右 flex:1 が潰れないようにする（scale は JSX で可変） */
  altarVsEmblem: {
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 48,
    maxWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    paddingHorizontal: 2,
  },
  altarVsEmblemInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  altarVsEmblemText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.35,
    fontFamily: FONT.display,
  },
  towerDuelistLeft: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    maxWidth: '42%',
  },
  towerDuelistRight: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    maxWidth: '42%',
  },
  /** 円アイコン＋名下＋ハートの縦積み */
  towerDuelistStack: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  towerDuelistStackCompact: {
    gap: 3,
  },
  towerAvatarRingCompact: {
    padding: 1,
    borderWidth: 1.2,
  },
  towerDuelistNameUnder: {
    alignSelf: 'stretch',
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  towerDuelistNameBelowAvatar: {
    textAlign: 'center',
    width: '100%',
  },
  towerHeartsBelowName: {
    alignItems: 'center',
  },
  /** 帯の matchIconsFace が既に1枚塗っているのでリングは縁だけ（内側の二重塗りにしない） */
  towerAvatarRingBlue: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(143, 182, 255, 0.4)',
    backgroundColor: 'transparent',
  },
  towerAvatarRingEmber: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(220, 140, 125, 0.38)',
    backgroundColor: 'transparent',
  },
  towerDuelistName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: FONT.body,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(2, 6, 14, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  /** 競技盤面の中心：塔・神殿の比喩は使わず、金枠＋濃紺面で主役を問題文に */
  boardPanelWrap: {
    marginTop: 6,
    position: 'relative',
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  boardPanelWrapCompact: {
    marginTop: 2,
  },
  /** 問題＋タイム帯の塗りはここだけ（inner は透明で二重にしない） */
  boardPanelOuter: {
    position: 'relative',
    width: '100%',
    padding: 10,
    paddingBottom: 10,
    backgroundColor: 'rgba(23, 35, 52, 0.48)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.48)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
  },
  boardPanelOuterCompact: {
    padding: 6,
    paddingBottom: 6,
    borderRadius: 12,
    shadowRadius: 12,
  },
  boardPanelInner: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  /** 盤面上辺の登録線（儀式感は線の精度で） */
  boardPanelRegisterLine: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(198, 167, 94, 0.32)',
    zIndex: 2,
  },
  boardPanelRegisterLineCompact: {
    top: 28,
    left: 10,
    right: 10,
  },
  hudCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.32)',
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
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
    backgroundColor: 'rgba(7, 11, 18, 0.78)',
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBottom: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(42, 61, 90, 0.55)',
    paddingTop: 8,
  },
  questionNumber: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 0.65,
    fontWeight: '600',
    fontFamily: FONT.body,
    textTransform: 'uppercase',
  },
  timer: {
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.35,
    fontFamily: FONT.display,
    fontVariant: ['tabular-nums'],
  },
  livesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    gap: 8,
  },
  livesText: {
    fontSize: 19,
    color: 'rgba(228, 238, 255, 0.95)',
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  playerNameInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  heartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  heartIcon: {
    textAlign: 'center',
    includeFontPadding: false,
  },
  heartIconActive: {
    color: COLORS.incorrect,
  },
  heartIconInactive: {
    color: 'rgba(164, 176, 196, 0.35)',
  },
  dictationScoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 8,
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
  duelDividerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    width: 56,
    gap: 5,
  },
  duelBandVsCompact: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 1.8,
    fontFamily: FONT.display,
  },
  duelBandLine: {
    flex: 1,
    height: 1,
    maxHeight: 1,
  },
  duelBandLineYou: {
    backgroundColor: 'rgba(143, 182, 255, 0.2)',
  },
  duelBandLineOpp: {
    backgroundColor: 'rgba(220, 130, 118, 0.14)',
  },
  /** 問題文：内側は落ち着いた面＋余白（ホームのカード内側に寄せる） */
  promptScrim: {
    position: 'relative',
    zIndex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  /** 左上の進捗・区切り線は absolute のため、中央寄せの基準が上に寄る。上 padding で見かけの帯に合わせる */
  battlefieldContent: {
    position: 'relative',
    zIndex: 3,
    flexGrow: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingTop: 52,
    paddingBottom: 28,
    paddingHorizontal: 22,
  },
  /** 短いビューポート：中央寄せ用の flex 成長をやめ、タイマー直下の選択肢まで詰める */
  battlefieldContentCompact: {
    flexGrow: 0,
    justifyContent: 'flex-start',
    paddingTop: 22,
    paddingBottom: 6,
    paddingHorizontal: 10,
  },
  promptScrimCompact: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  playerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  playerSideRight: {
    justifyContent: 'flex-end',
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.border,
  },
  playerAvatarSmall: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
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
    fontSize: 21,
    fontWeight: '600',
    color: COLORS.muted,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E4EEFF',
  },
  playerMeta: {
    minWidth: 0,
    gap: 3,
  },
  playerMetaRight: {
    alignItems: 'flex-end',
  },
  playerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(223, 234, 255, 0.88)',
    fontFamily: FONT.display,
    fontVariant: ['tabular-nums'],
  },
  questionContainer: {
    marginBottom: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 220,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** リスニング時は問題文エリアの高さを固定し、回答前後・他端末の回答有無で選択肢の位置がずれないようにする */
  questionContainerListening: {
    minHeight: 204,
  },
  questionContainerDictation: {
    minHeight: 212,
  },
  dictationInCardColumn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dictationInstructionText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: FONT.body,
  },
  dictationDisplayTextInCard: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: FONT.display,
  },
  dictationDisplayCharInCard: {
    color: COLORS.correct,
    fontWeight: '800',
  },
  dictationPlaceholderInCard: {
    color: 'rgba(100, 116, 148, 0.55)',
    fontWeight: '700',
  },
  dictationInputMatch: {
    borderWidth: 1.5,
    borderColor: 'rgba(198, 167, 94, 0.55)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(23, 35, 52, 0.52)',
    color: COLORS.text,
    fontFamily: FONT.body,
  },
  dictationResultMatch: {
    maxHeight: 180,
  },
  dictationResultCorrectLabel: {
    color: COLORS.correct,
  },
  dictationResultIncorrectLabel: {
    color: COLORS.incorrect,
  },
  dictationResultAnswerLead: {
    fontWeight: '700',
    color: COLORS.gold,
  },
  /** タイム表示（matchLimitBarTimer）と同じ段のサイズ・ウエイト・字間・書体 */
  prompt: {
    fontSize: 23,
    lineHeight: 34,
    color: COLORS.text,
    letterSpacing: 0.4,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: FONT.display,
    textShadowColor: 'rgba(2, 6, 14, 0.72)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  /** 回答前：決断前の静かな主役感（装飾ではなく視線の重み） */
  promptLive: {
    textShadowColor: 'rgba(198, 167, 94, 0.26)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  promptCompact: {
    fontSize: 17,
    lineHeight: 24,
    textShadowRadius: 8,
  },
  promptListeningCueCompact: {
    fontSize: 13,
    lineHeight: 20,
  },
  promptListeningCue: {
    fontSize: 17,
    lineHeight: 28,
    color: COLORS.muted,
    letterSpacing: 0.4,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: FONT.body,
    textTransform: 'uppercase',
  },
  choicesContainer: {
    gap: 11,
    marginBottom: 14,
    zIndex: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  choicesContainerCompact: {
    gap: 5,
    marginBottom: 4,
  },
  /** 解説・次へボタンの領域。高さを固定し、回答の有無・どちらの端末が先に回答しても選択肢の位置がずれないようにする */
  afterChoicesArea: {
    height: 200,
  },
  /** 選択：決断の重みを優先。色帯は使わず縁と影で競技パネル感 */
  altarCommandPlate: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 62,
    justifyContent: 'center',
    borderColor: COLORS.border,
    borderTopColor: 'rgba(198, 167, 94, 0.2)',
    backgroundColor: 'rgba(23, 35, 52, 0.48)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  altarCommandPlateCompact: {
    minHeight: 44,
    borderRadius: 11,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  /** 選択肢左ストライプ：金系で統一 */
  choiceTowerStripe: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(198, 167, 94, 0.36)',
  },
  altarCommandRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 4,
  },
  altarCommandRowCompact: {
    paddingVertical: 1,
    paddingHorizontal: 8,
    gap: 2,
  },
  /** レタープレート：A–D は金系で統一（正誤時のみ緑/赤） */
  altarCommandShield: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1.65,
    flexShrink: 0,
  },
  altarCommandShieldCompact: {
    width: 40,
    borderRadius: 9,
    borderWidth: 1.35,
  },
  altarCommandBody: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingLeft: 4,
    minWidth: 0,
  },
  altarCommandBodyCompact: {
    paddingVertical: 2,
    paddingLeft: 2,
  },
  choiceBadgeLetter: {
    borderColor: 'rgba(198, 167, 94, 0.58)',
    backgroundColor: 'rgba(10, 14, 22, 0.45)',
  },
  choiceLetterBadgeSelected: {
    borderColor: 'rgba(198, 167, 94, 0.75)',
    backgroundColor: 'rgba(67, 51, 25, 0.48)',
  },
  choiceLetterBadgeCorrect: {
    borderColor: 'rgba(74, 222, 128, 0.7)',
    backgroundColor: 'rgba(16, 66, 44, 0.62)',
  },
  choiceLetterBadgeIncorrect: {
    borderColor: 'rgba(248, 113, 113, 0.7)',
    backgroundColor: 'rgba(88, 29, 29, 0.6)',
  },
  choiceLetter: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.4,
    fontFamily: FONT.display,
  },
  choiceLetterCompact: {
    fontSize: 17,
    letterSpacing: 0.25,
  },
  /** 回答確定前：金枠でホームの ranked 系の強調に揃える */
  choiceSelectedLocked: {
    borderColor: 'rgba(198, 167, 94, 0.75)',
    backgroundColor: 'rgba(30, 45, 68, 0.42)',
    borderWidth: 1.5,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(198, 167, 94, 0.65)',
  },
  choicePressed: {
    opacity: 0.98,
    borderColor: 'rgba(198, 167, 94, 0.62)',
    borderTopColor: 'rgba(198, 167, 94, 0.42)',
    transform: [{ scale: 0.987 }],
  },
  choicePressedCommitted: {
    transform: [{ scale: 0.996 }],
    opacity: 0.98,
  },
  choiceCorrect: {
    borderColor: 'rgba(74, 222, 128, 0.85)',
    backgroundColor: 'rgba(14, 52, 36, 0.42)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(74, 222, 128, 0.75)',
  },
  choiceIncorrect: {
    borderColor: 'rgba(248, 113, 113, 0.82)',
    backgroundColor: 'rgba(72, 24, 24, 0.38)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(251, 113, 133, 0.75)',
  },
  choiceDisabled: {
    opacity: 0.55,
  },
  choiceText: {
    flex: 1,
    fontSize: 23,
    color: COLORS.text,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: 0.14,
    fontFamily: FONT.body,
    textShadowColor: 'rgba(2, 6, 14, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  choiceTextCompact: {
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: 0.08,
  },
  choiceTextSelected: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  choiceTextCorrect: {
    color: COLORS.correct,
    fontWeight: '700',
  },
  choiceTextIncorrect: {
    color: COLORS.incorrect,
    fontWeight: '700',
  },
  explanationContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(16, 23, 34, 0.58)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 112,
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
    color: '#AEC0DD',
    lineHeight: 21,
  },
  nextButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(30, 45, 68, 0.58)',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.5)',
  },
  nextButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: FONT.body,
  },
  replayButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.4)',
    backgroundColor: 'rgba(16, 23, 34, 0.55)',
  },
  replayButtonText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: FONT.body,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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

