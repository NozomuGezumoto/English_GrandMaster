import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth, functions, httpsCallable } from '../../lib/firebase';
import { getAvatarUrl } from '../../lib/avatar-utils';
import { Match, Question, User as FirestoreUser } from '../../types/firestore';
import { normalizeQuestion } from '../../lib/question-utils';
import { getQuestionById, isLocalQuestionId } from '../../lib/study-questions';
import { getListeningQuestionById, isListeningQuestionId } from '../../lib/listening-response-questions';
import { COLORS } from '../../lib/theme';
import { AI_AVATAR_SOURCE } from '../../lib/ai-avatar';
import { playWinSound } from '../../lib/win-sound';

const RESULT_WIN_BACKGROUND = require('../../assets/result.png');

function roundAvatarStyle(px: number) {
  return {
    width: px,
    height: px,
    borderRadius: px / 2,
    backgroundColor: COLORS.border,
  };
}

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'Inter, system-ui, sans-serif' }),
};

/**
 * リザルト用バッジ：重ねがけタイトル
 * `winPalette: 'champion'` は参照モックの金 WIN（グラデ感・黄縁）
 */
function StackedBattleTitle({
  label,
  variant,
  fontSize,
  winPalette = 'duel',
}: {
  label: string;
  variant: 'win' | 'lose' | 'draw';
  fontSize: number;
  /** duel: 赤 WIN / champion: 金〜オレンジ WIN */
  winPalette?: 'duel' | 'champion';
}) {
  const championWin = variant === 'win' && winPalette === 'champion';
  const fill = championWin
    ? '#D9A23A'
    : variant === 'win'
      ? '#D81E35'
      : variant === 'lose'
        ? '#1E56C9'
        : 'rgba(198, 167, 94, 0.96)';
  const outline = championWin ? '#FFF4C8' : '#F0C84A';
  const depth = championWin ? '#4a3006' : '#3d2808';
  const offsets: [number, number][] = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
    [-3, 0],
    [3, 0],
    [0, -3],
    [0, 3],
  ];
  const lh = Math.round(fontSize * 1.08);
  const base = {
    fontSize,
    lineHeight: lh,
    fontWeight: '900' as const,
    fontFamily: FONT.body,
    letterSpacing: variant === 'draw' ? 1.2 : 1.6,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    includeFontPadding: false as const,
  };

  const outlineLayer = (key: string, color: string, dx: number, dy: number, opacity = 1) => (
    <View key={key} style={[StyleSheet.absoluteFillObject, stackedTitleStyles.layer]} pointerEvents="none">
      <Text style={[base, { color, opacity, transform: [{ translateX: dx }, { translateY: dy }] }]}>{label}</Text>
    </View>
  );

  return (
    <View style={stackedTitleStyles.wrap}>
      <Text style={[base, { opacity: 0 }]}>{label}</Text>
      {offsets.map(([dx, dy], i) => outlineLayer(`o-${i}`, outline, dx, dy))}
      {!championWin
        ? offsets.slice(0, 8).map(([dx, dy], i) => outlineLayer(`d-${i}`, depth, dx * 0.42, dy * 0.42, 0.5))
        : null}
      {variant !== 'draw'
        ? outlineLayer(
            'gloss',
            championWin ? 'rgba(255, 248, 220, 0.38)' : 'rgba(255,255,255,0.28)',
            -0.75,
            -2,
          )
        : null}
      <View style={[StyleSheet.absoluteFillObject, stackedTitleStyles.layer]} pointerEvents="none">
        <Text style={[base, { color: fill }]}>{label}</Text>
      </View>
    </View>
  );
}

const stackedTitleStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function ResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: layoutWindowWidth, height: layoutWindowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [match, setMatch] = useState<Match | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUser, setMyUser] = useState<{ displayName: string; avatarUrl?: string; rating?: number; ratingChange?: number } | null>(null);
  const [opponentUser, setOpponentUser] = useState<{ displayName: string; avatarUrl?: string } | null>(null);
  const todayStatsRecordedRef = useRef(false);
  const winSoundPlayedRef = useRef(false);

  useEffect(() => {
    winSoundPlayedRef.current = false;
  }, [id]);

  // Play win sound once when victory (ranked / ai / friend), only after result screen is fully loaded (画面表示と同時)
  useEffect(() => {
    if (loading || !match) return;
    const isRankedOrAiOrFriend = match.mode === 'ranked' || match.mode === 'ai' || match.mode === 'friend';
    if (!isRankedOrAiOrFriend) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const isWinner = match.winnerUid === uid;
    if (!isWinner || winSoundPlayedRef.current) return;
    winSoundPlayedRef.current = true;
    playWinSound();
  }, [loading, match?.mode, match?.winnerUid]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const loadResult = async () => {
      try {
        const matchRef = doc(db, 'matches', id);
        const matchDoc = await getDoc(matchRef);

        if (!matchDoc.exists()) {
          router.back();
          return;
        }

        const matchData = matchDoc.data() as Match;
        setMatch(matchData);

        const uid = auth.currentUser?.uid ?? null;
        if (matchData.status === 'finished' && uid && !todayStatsRecordedRef.current) {
          todayStatsRecordedRef.current = true;
          try {
            const recordMatchComplete = httpsCallable(functions, 'recordMatchComplete');
            await recordMatchComplete({ matchId: id });
          } catch (e) {
            console.warn('[Result] recordMatchComplete:', e);
          }
        }

        const oppUid = matchData.players.A === uid ? matchData.players.B : matchData.players.A;
        if (uid) {
          const myDoc = await getDoc(doc(db, 'users', uid));
          const myData = myDoc.exists() ? (myDoc.data() as FirestoreUser) : null;
          const myAvatarUrl = myData ? await getAvatarUrl(myData) : null;
          setMyUser(myData
            ? {
                displayName: myData.displayName || 'You',
                avatarUrl: myAvatarUrl ?? undefined,
                rating: myData.rating ?? myData.ratingOverall,
                ratingChange: myData.ratingChange,
              }
            : { displayName: 'You' });
        }
        if (oppUid && oppUid !== 'ai') {
          const oppDoc = await getDoc(doc(db, 'users', oppUid));
          const oppData = oppDoc.exists() ? (oppDoc.data() as FirestoreUser) : null;
          const oppAvatarUrl = oppData ? await getAvatarUrl(oppData) : null;
          setOpponentUser(oppData ? { displayName: oppData.displayName || 'Opponent', avatarUrl: oppAvatarUrl ?? undefined } : { displayName: 'Opponent' });
        } else {
          setOpponentUser(oppUid === 'ai' ? { displayName: 'AI' } : { displayName: 'Opponent' });
        }

        const qIds = matchData.questionIds ?? [];
        const questionPromises = qIds.map((qId) =>
          isListeningQuestionId(qId)
            ? Promise.resolve(getListeningQuestionById(qId))
            : isLocalQuestionId(qId)
              ? Promise.resolve(getQuestionById(qId))
              : getDoc(doc(db, 'questions', qId)).then((d) => (d.exists() ? normalizeQuestion(d.data()) : null))
        );
        const questionResults = await Promise.all(questionPromises);
        const questionsData = questionResults.filter((q): q is Question => q != null);
        setQuestions(questionsData);
      } catch (error) {
        console.error('Error loading result:', error);
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [id]);

  if (!id) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.loadingText}>Invalid match</Text>
        <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || !match) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const uid = auth.currentUser?.uid;
  if (!uid) {
    router.back();
    return null;
  }

  const opponentUid = match.players?.A === uid ? match.players?.B : match.players?.A;
  const userLife = match.lives?.[uid] ?? 0;
  const opponentLife = match.lives?.[opponentUid] ?? 0;
  const userScore = Number(((match.scores ?? {})[uid] || 0).toFixed(3));
  const opponentScore = Number(((match.scores ?? {})[opponentUid] || 0).toFixed(3));
  const isWinner = match.winnerUid === uid;
  const isDraw = match.winnerUid === null;
  const myName = myUser?.displayName ?? 'You';
  const oppName = opponentUid === 'ai' ? 'AI' : (opponentUser?.displayName ?? 'Opponent');

  const userAnswers = (match.answers ?? {})[uid] || {};
  const wrongQuestions: { question: Question; userAnswer: number; correctAnswer: number }[] = [];

  questions.forEach((question, index) => {
    const answer = userAnswers[index];
    if (answer && !answer.isCorrect) {
      wrongQuestions.push({
        question,
        userAnswer: answer.choiceIndex ?? -1,
        correctAnswer: question.answerIndex ?? 0,
      });
    }
  });

  const renderResultLifeHearts = (lives: number, total: number, iconFontSize: number, dimmed?: boolean) => {
    const lh = Math.round(iconFontSize * 1.32);
    return (
      <View style={[styles.heartsRow, { gap: Math.max(4, Math.round(iconFontSize * 0.26)) }]}>
        {Array.from({ length: total }, (_, i) => {
          const active = i < lives;
          const heartStyle = dimmed
            ? active
              ? styles.heartIconDimmedActive
              : styles.heartIconDimmedInactive
            : active
              ? styles.heartIconActive
              : styles.heartIconInactive;
          return (
            <Text
              key={i}
              style={[styles.heartIcon, heartStyle, { fontSize: iconFontSize, lineHeight: lh }]}
            >
              {active ? '♥' : '♡'}
            </Text>
          );
        })}
      </View>
    );
  };

  const headerContentWidth = Math.max(240, layoutWindowWidth - 40);
  /** Scoreboard 行（content の paddingHorizontal 20×2 と一致） */
  const scoreboardInnerWidth = Math.max(200, layoutWindowWidth - 40);
  /** スクロール上部の見えている領域の高さ（高さ基準スケール用） */
  const scoreboardViewportH = Math.max(280, layoutWindowHeight - safeTop - insets.bottom);
  /** 幅と高さのバランス（横長端末では高さ、縦長では幅が効く） */
  const scoreboardLayoutMin = Math.min(scoreboardInnerWidth, scoreboardViewportH);
  /** 狭い画面では左右スロットを少し広げ、極端な縮みを防ぐ */
  const duelistSlotMaxWidthPct =
    scoreboardInnerWidth < 300 ? 48 : scoreboardInnerWidth < 360 ? 44 : scoreboardInnerWidth < 420 ? 40 : 38;
  const scoreboardRowGap = Math.max(4, Math.min(10, Math.round(scoreboardLayoutMin * 0.018)));
  const battleEmblemMinW = Math.round(Math.max(60, Math.min(84, scoreboardLayoutMin * 0.22)));
  const battleEmblemMaxW = Math.round(Math.min(120, Math.max(72, scoreboardLayoutMin * 0.32)));
  /** 列幅上限（リング・パディング分を差し引き） */
  const duelAvatarMaxFromSlot = scoreboardInnerWidth * (duelistSlotMaxWidthPct / 100) * 0.86;
  /** 高さ基準の円アイコン径（横長では viewport 高さで抑え、列幅と min で合わせる） */
  const matchDuelAvatarPx = Math.round(
    Math.min(
      204,
      Math.max(56, Math.min(scoreboardViewportH * 0.118, duelAvatarMaxFromSlot, headerContentWidth * 0.28)),
    ),
  );
  const matchDuelAvatarInitialFontSize = Math.max(16, Math.round(matchDuelAvatarPx * 0.34));
  const matchDuelNameFontSize = Math.max(14, Math.round(matchDuelAvatarPx * 0.132));
  const showLivesInPlaque = match.lives != null && match.questionType !== 'dictation';
  const sideOutcomeFontSize = Math.max(
    15,
    Math.min(28, Math.round(Math.min(layoutWindowWidth * 0.058, scoreboardViewportH * 0.042))),
  );
  const battleResultHeadingFontSize = Math.max(
    13,
    Math.min(23, Math.round(Math.min(layoutWindowWidth * 0.05, scoreboardViewportH * 0.036))),
  );
  /** WIN / LOSE / DRAW でバッジ領域の高さを揃え、下のアバター開始位置を左右一致させる */
  const outcomeBadgeSlotMinHeight = Math.max(44, Math.round(sideOutcomeFontSize * 2.85));
  const outcomeBadgeSlotStyle = { minHeight: outcomeBadgeSlotMinHeight };
  const leftWon = isDraw ? null : isWinner;
  const rightWon = isDraw ? null : !isWinner;
  /** 左右同一：勝者も敗者も同じ円径・名前・プレースホルダー・ハート基準 */
  const matchDuelAvatarRound = roundAvatarStyle(matchDuelAvatarPx);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        <View style={styles.duelStageColumn}>
          <Text style={styles.scoreBoardLabel}>Scoreboard</Text>
          <View style={styles.matchIconsPlaque}>
              <View style={[styles.matchIconsFace, { gap: scoreboardRowGap }]}>
                <View style={[styles.towerDuelistSlot, { maxWidth: `${duelistSlotMaxWidthPct}%` }]}>
                  <View
                    style={[
                      styles.resultPlayerColumn,
                      isDraw && styles.resultPlayerColumnDraw,
                      leftWon === true && styles.resultPlayerColumnWin,
                      leftWon === false && styles.resultPlayerColumnLoss,
                    ]}
                  >
                    {leftWon === true ? (
                      <>
                        <View style={styles.resultWinBgBase} pointerEvents="none" />
                        <View style={styles.resultWinBgImageWrap} pointerEvents="none">
                          <Image source={RESULT_WIN_BACKGROUND} style={styles.resultWinBgImageFill} resizeMode="cover" />
                        </View>
                        <View style={styles.resultWinBgScrim} pointerEvents="none" />
                      </>
                    ) : null}
                    <View style={styles.resultPlayerColumnContent}>
                    <View style={styles.resultOutcomeBadgeSection}>
                      <View style={[styles.outcomeBadgeUniformSlot, outcomeBadgeSlotStyle]}>
                        {isDraw ? (
                          <StackedBattleTitle label="DRAW" variant="draw" fontSize={sideOutcomeFontSize} />
                        ) : leftWon === true ? (
                          <View style={styles.championWinBadgeHalo}>
                            <StackedBattleTitle label="WIN" variant="win" winPalette="champion" fontSize={sideOutcomeFontSize} />
                          </View>
                        ) : (
                          <StackedBattleTitle label="LOSE" variant="lose" fontSize={sideOutcomeFontSize} />
                        )}
                      </View>
                    </View>
                    <View style={styles.towerDuelistStack}>
                      <View
                        style={[
                          styles.towerAvatarRingBlue,
                          leftWon === false && styles.towerAvatarRingMuted,
                          leftWon === true && styles.towerAvatarRingChampion,
                        ]}
                      >
                        {myUser?.avatarUrl ? (
                          <Image source={{ uri: myUser.avatarUrl }} style={matchDuelAvatarRound} resizeMode="cover" />
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
                            leftWon === false && styles.towerDuelistNameDimmed,
                            leftWon === true && styles.towerDuelistNameChampion,
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
                      {showLivesInPlaque ? (
                        <View style={styles.towerHeartsBelowName}>
                          {renderResultLifeHearts(userLife, 3, matchDuelNameFontSize, leftWon === false)}
                        </View>
                      ) : null}
                      <Text
                        style={[
                          showLivesInPlaque ? styles.resultDuelScoreLine : styles.resultDuelScoreLineLarge,
                          leftWon === false && styles.resultDuelScoreDimmed,
                          leftWon === true && styles.resultDuelScoreChampion,
                        ]}
                        numberOfLines={1}
                      >
                        Score {userScore}
                      </Text>
                      {match.mode === 'ranked' && myUser?.ratingChange != null && myUser.ratingChange !== 0 && (
                        <Text
                          style={[
                            styles.scoreRatingChange,
                            myUser.ratingChange > 0 ? styles.scoreRatingUp : styles.scoreRatingDown,
                            leftWon === true && styles.scoreRatingOnWinPlaque,
                          ]}
                        >
                          {myUser.ratingChange > 0 ? '↑' : '↓'} {Math.abs(myUser.ratingChange)}
                        </Text>
                      )}
                    </View>
                    </View>
                  </View>
                </View>
                <View
                  style={[styles.resultCenterEmblem, { minWidth: battleEmblemMinW, maxWidth: battleEmblemMaxW }]}
                  pointerEvents="none"
                >
                  <Text style={[styles.battleResultHeading, { fontSize: battleResultHeadingFontSize, lineHeight: Math.round(battleResultHeadingFontSize * 1.35) }]}>
                    BATTLE{'\n'}RESULT
                  </Text>
                </View>
                <View style={[styles.towerDuelistSlot, { maxWidth: `${duelistSlotMaxWidthPct}%` }]}>
                  <View
                    style={[
                      styles.resultPlayerColumn,
                      isDraw && styles.resultPlayerColumnDraw,
                      rightWon === true && styles.resultPlayerColumnWin,
                      rightWon === false && styles.resultPlayerColumnLoss,
                    ]}
                  >
                    {rightWon === true ? (
                      <>
                        <View style={styles.resultWinBgBase} pointerEvents="none" />
                        <View style={styles.resultWinBgImageWrap} pointerEvents="none">
                          <Image source={RESULT_WIN_BACKGROUND} style={styles.resultWinBgImageFill} resizeMode="cover" />
                        </View>
                        <View style={styles.resultWinBgScrim} pointerEvents="none" />
                      </>
                    ) : null}
                    <View style={styles.resultPlayerColumnContent}>
                    <View style={styles.resultOutcomeBadgeSection}>
                      <View style={[styles.outcomeBadgeUniformSlot, outcomeBadgeSlotStyle]}>
                        {isDraw ? (
                          <StackedBattleTitle label="DRAW" variant="draw" fontSize={sideOutcomeFontSize} />
                        ) : rightWon === true ? (
                          <View style={styles.championWinBadgeHalo}>
                            <StackedBattleTitle label="WIN" variant="win" winPalette="champion" fontSize={sideOutcomeFontSize} />
                          </View>
                        ) : (
                          <StackedBattleTitle label="LOSE" variant="lose" fontSize={sideOutcomeFontSize} />
                        )}
                      </View>
                    </View>
                    <View style={styles.towerDuelistStack}>
                      <View
                        style={[
                          styles.towerAvatarRingEmber,
                          rightWon === false && styles.towerAvatarRingMuted,
                          rightWon === true && styles.towerAvatarRingChampion,
                        ]}
                      >
                        {opponentUid === 'ai' ? (
                          <Image source={AI_AVATAR_SOURCE} style={matchDuelAvatarRound} resizeMode="cover" />
                        ) : opponentUser?.avatarUrl ? (
                          <Image source={{ uri: opponentUser.avatarUrl }} style={matchDuelAvatarRound} resizeMode="cover" />
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
                            rightWon === false && styles.towerDuelistNameDimmed,
                            rightWon === true && styles.towerDuelistNameChampion,
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
                      {showLivesInPlaque ? (
                        <View style={styles.towerHeartsBelowName}>
                          {renderResultLifeHearts(opponentLife, 3, matchDuelNameFontSize, rightWon === false)}
                        </View>
                      ) : null}
                      <Text
                        style={[
                          showLivesInPlaque ? styles.resultDuelScoreLine : styles.resultDuelScoreLineLarge,
                          rightWon === false && styles.resultDuelScoreDimmed,
                          rightWon === true && styles.resultDuelScoreChampion,
                        ]}
                        numberOfLines={1}
                      >
                        Score {opponentScore}
                      </Text>
                    </View>
                    </View>
                  </View>
                </View>
              </View>
          </View>

          {match.questionType === 'overall' && (
            <View style={styles.boardPanelWrap}>
              <View style={styles.boardPanelOuter}>
                <View style={styles.boardPanelInner}>
                  <View style={styles.phaseBreakdownPanel}>
                    <View style={styles.phaseBreakdown}>
                      <Text style={styles.phaseBreakdownTitle}>GrandMaster — Phase results</Text>
                      {[
                        { key: 'choice', label: '4-Choice', winnerUid: match.phaseChoiceWinnerUid },
                        { key: 'listening', label: 'Listening', winnerUid: match.phaseListeningWinnerUid },
                        { key: 'dictation', label: 'Dictation', winnerUid: match.phaseDictationWinnerUid },
                      ].map(({ key, label, winnerUid }) => {
                        const iWon = winnerUid === uid;
                        const theyWon = winnerUid === opponentUid;
                        const draw = !winnerUid || (!iWon && !theyWon);
                        const status = draw ? 'DRAW' : iWon ? 'WIN' : 'LOSS';
                        return (
                          <View key={key} style={[styles.phaseRow, iWon && styles.phaseRowWin, theyWon && styles.phaseRowLoss]}>
                            <Text style={[styles.phaseRowIcon, iWon && styles.phaseRowIconWin, theyWon && styles.phaseRowIconLoss]}>
                              {draw ? '—' : iWon ? '✔' : '✗'}
                            </Text>
                            <Text style={styles.phaseRowLabel}>{label}</Text>
                            <Text
                              style={[
                                styles.phaseRowStatus,
                                iWon && styles.phaseRowStatusWin,
                                theyWon && styles.phaseRowStatusLoss,
                                draw && styles.phaseRowStatusDraw,
                              ]}
                            >
                              — {status}
                            </Text>
                          </View>
                        );
                      })}
                      <View
                        style={[
                          styles.phaseRow,
                          styles.phaseRowOverall,
                          isWinner && styles.phaseRowWin,
                          !isWinner && !isDraw && styles.phaseRowLoss,
                        ]}
                      >
                        <Text
                          style={[
                            styles.phaseRowIcon,
                            isWinner && styles.phaseRowIconWin,
                            !isWinner && !isDraw && styles.phaseRowIconLoss,
                          ]}
                        >
                          {isDraw ? '—' : isWinner ? '✔' : '✗'}
                        </Text>
                        <Text style={styles.phaseRowLabel}>Overall (rating)</Text>
                        <Text
                          style={[
                            styles.phaseRowStatus,
                            isWinner && styles.phaseRowStatusWin,
                            !isWinner && !isDraw && styles.phaseRowStatusLoss,
                            isDraw && styles.phaseRowStatusDraw,
                          ]}
                        >
                          — {isDraw ? 'DRAW' : isWinner ? 'WIN' : 'LOSS'}
                        </Text>
                      </View>
                    </View>
                    {isWinner &&
                      (() => {
                        const wonChoice = match.phaseChoiceWinnerUid === uid;
                        const wonListening = match.phaseListeningWinnerUid === uid;
                        const wonDictation = match.phaseDictationWinnerUid === uid;
                        const wonAllPhases = wonChoice && wonListening && wonDictation;
                        return wonAllPhases ? (
                          <View style={styles.championBlock}>
                            <Text style={styles.championCrown}>👑</Text>
                            <Text style={styles.championTitle}>You dominated all phases</Text>
                            <Text style={styles.championSub}>GrandMaster victory</Text>
                          </View>
                        ) : null;
                      })()}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* 間違えた問題の復習 */}
        {wrongQuestions.length > 0 && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewTitle}>
              Wrong answers ({wrongQuestions.length})
            </Text>
            {wrongQuestions.map((item, index) => (
              <View key={index} style={styles.reviewItem}>
                <Text style={styles.reviewPrompt}>{item.question.prompt ?? ''}</Text>
                <View style={styles.reviewAnswers}>
                  <View style={styles.reviewAnswerRow}>
                    <Text style={styles.reviewAnswerLabel}>
                      {myName}
                      {"'s answer:"}
                    </Text>
                    <Text style={styles.reviewAnswerWrong}>
                      {String.fromCharCode(65 + item.userAnswer)}.{' '}
                      {(Array.isArray(item.question.choices) ? item.question.choices[item.userAnswer] : '') ?? ''}
                    </Text>
                  </View>
                  <View style={styles.reviewAnswerRow}>
                    <Text style={styles.reviewAnswerLabel}>Correct:</Text>
                    <Text style={styles.reviewAnswerCorrect}>
                      {String.fromCharCode(65 + item.correctAnswer)}.{' '}
                      {(Array.isArray(item.question.choices) ? item.question.choices[item.correctAnswer] : '') ?? ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reviewExplanation}>
                  {item.question.explanation ?? ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ホームに戻る */}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'web' ? 72 : 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  duelStageColumn: {
    zIndex: 1,
    marginBottom: 8,
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  boardPanelWrap: {
    marginTop: 14,
    position: 'relative',
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  boardPanelOuter: {
    position: 'relative',
    width: '100%',
    padding: 10,
    paddingBottom: 10,
    backgroundColor: '#121D2C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.48)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 7,
  },
  boardPanelInner: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#0A1017',
  },
  phaseBreakdownPanel: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  matchIconsPlaque: {
    marginBottom: 5,
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  matchIconsFace: {
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    overflow: 'visible',
  },
  resultOutcomeBadgeSection: {
    marginBottom: 8,
    alignItems: 'center',
  },
  /** 左右同じ minHeight でバッジブロックの縦幅を揃える（LOSE 直置き vs WIN ラッパーの差を吸収） */
  outcomeBadgeUniformSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 参照モック寄り：WIN 文字周りの金系ブルーム（elevation は Android のレイアウトずれ防止のため抑える） */
  championWinBadgeHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(255, 205, 120, 0.55)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.85,
    shadowRadius: 16,
    elevation: 14,
  },
  resultPlayerColumn: {
    position: 'relative',
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 0,
    alignItems: 'center',
    /** 親の stretch を継承し、カード幅＝スロット幅（背景・枠と中身のずれ防止） */
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  /** cover 時の角丸クリップ内のベース色（画像が届かない端でのチラ見え防止） */
  resultWinBgBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: '#0e0c0a',
    zIndex: 0,
  },
  /** Web 等で Image が intrinsic 幅のまま左寄せになるのを防ぐ（ラッパーで 100%×100% を強制） */
  resultWinBgImageWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 0,
  },
  resultWinBgImageFill: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' as 'cover' } : {}),
  },
  /** 背景の上：一枚のヴェールのみ（下半分だけ濃くすると境界で横線っぽく見えるためやめる） */
  resultWinBgScrim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(7, 5, 3, 0.44)',
    zIndex: 1,
  },
  resultPlayerColumnContent: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    minWidth: 0,
    width: '100%',
    alignItems: 'center',
  },
  resultPlayerColumnWin: {
    backgroundColor: 'rgba(18, 14, 10, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(236, 210, 140, 0.78)',
    shadowColor: 'rgba(255, 215, 140, 0.55)',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.72,
    shadowRadius: 20,
    elevation: 0,
  },
  resultPlayerColumnLoss: {
    backgroundColor: 'rgba(3, 5, 9, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(58, 70, 88, 0.34)',
    opacity: 0.82,
  },
  resultPlayerColumnDraw: {
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  towerAvatarRingMuted: {
    borderColor: 'rgba(100, 116, 140, 0.35)',
    backgroundColor: 'rgba(12, 16, 24, 0.75)',
    opacity: 0.88,
  },
  /** 勝者：参照モックのクール系リム＋発光 */
  towerAvatarRingChampion: {
    borderColor: 'rgba(120, 195, 255, 0.62)',
    shadowColor: 'rgba(80, 160, 255, 0.5)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 0,
  },
  towerDuelistNameDimmed: {
    color: 'rgba(176, 190, 214, 0.72)',
  },
  /** 勝者：明るい金背景でも読めるよう淡い文字＋濃い縁取り相当のシャドウ */
  towerDuelistNameChampion: {
    color: '#FFF9F0',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.92)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  resultDuelScoreDimmed: {
    color: 'rgba(148, 162, 188, 0.55)',
  },
  /** 勝者：金テキストは背景と同色になりやすいので明るいクリーム＋暗シャドウ */
  resultDuelScoreChampion: {
    color: '#FFF4E0',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.88)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  battleResultHeading: {
    fontWeight: '800',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: COLORS.gold,
    fontFamily: FONT.body,
  },
  resultCenterEmblem: {
    flexShrink: 0,
    flexGrow: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    overflow: 'visible',
    paddingHorizontal: 2,
    zIndex: 1,
  },
  /** 左右プレイヤースロット（maxWidth は画面幅に応じた % をインラインで付与） */
  towerDuelistSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 48,
    minHeight: 0,
    alignSelf: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  towerDuelistStack: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
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
  towerAvatarRingBlue: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(143, 182, 255, 0.4)',
    backgroundColor: 'rgba(16, 23, 36, 0.85)',
  },
  towerAvatarRingEmber: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(220, 140, 125, 0.38)',
    backgroundColor: 'rgba(16, 23, 36, 0.85)',
  },
  towerDuelistName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: FONT.body,
    letterSpacing: 0.2,
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
  heartIconDimmedActive: {
    color: 'rgba(248, 113, 113, 0.55)',
  },
  heartIconDimmedInactive: {
    color: 'rgba(88, 96, 112, 0.28)',
  },
  playerAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarTextSmall: {
    fontSize: 21,
    fontWeight: '600',
    color: COLORS.muted,
    fontFamily: FONT.body,
  },
  resultDuelScoreLine: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gold,
    fontFamily: FONT.body,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  resultDuelScoreLineLarge: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.gold,
    fontFamily: FONT.body,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.35,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 40,
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
    fontFamily: FONT.body,
  },
  phaseBreakdown: {
    marginTop: 14,
    marginBottom: 0,
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(26, 24, 20, 0.95)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.4)',
  },
  phaseBreakdownTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.gold,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: FONT.body,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  phaseRowWin: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.correct,
  },
  phaseRowLoss: {
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.incorrect,
  },
  phaseRowOverall: {
    marginTop: 4,
    marginBottom: 0,
    paddingVertical: 8,
    backgroundColor: 'rgba(198, 167, 94, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
  },
  phaseRowIcon: {
    fontSize: 16,
    fontWeight: '800',
    width: 24,
    textAlign: 'center',
    color: COLORS.muted,
    fontFamily: FONT.body,
  },
  phaseRowIconWin: {
    color: COLORS.correct,
  },
  phaseRowIconLoss: {
    color: COLORS.incorrect,
  },
  phaseRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: FONT.body,
  },
  phaseRowStatus: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: COLORS.muted,
    fontFamily: FONT.body,
  },
  phaseRowStatusWin: {
    color: COLORS.correct,
  },
  phaseRowStatusLoss: {
    color: COLORS.incorrect,
  },
  phaseRowStatusDraw: {
    color: COLORS.muted,
  },
  championBlock: {
    marginTop: 12,
    marginBottom: 0,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(198, 167, 94, 0.15)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.5)',
  },
  championCrown: {
    fontSize: 28,
    marginBottom: 4,
  },
  championTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 2,
    fontFamily: FONT.body,
  },
  championSub: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 0.5,
    fontFamily: FONT.body,
  },
  scoreBoardLabel: {
    fontSize: 13,
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 6,
    alignSelf: 'flex-start',
    fontFamily: FONT.body,
  },
  scoreRatingChange: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
    fontFamily: FONT.body,
  },
  scoreRatingUp: {
    color: COLORS.correct,
  },
  scoreRatingDown: {
    color: COLORS.incorrect,
  },
  scoreRatingOnWinPlaque: {
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reviewSection: {
    marginTop: 22,
  },
  reviewTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontFamily: FONT.body,
  },
  reviewItem: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#101722',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A52',
  },
  reviewPrompt: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONT.body,
  },
  reviewAnswers: {
    marginBottom: 8,
    gap: 6,
  },
  reviewAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewAnswerLabel: {
    fontSize: 13,
    color: COLORS.muted,
    fontFamily: FONT.body,
  },
  reviewAnswerWrong: {
    fontSize: 13,
    color: COLORS.incorrect,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  reviewAnswerCorrect: {
    fontSize: 13,
    color: COLORS.correct,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  reviewExplanation: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
    fontFamily: FONT.body,
  },
  homeButton: {
    marginTop: 20,
    marginBottom: 24,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: '#1E2D44',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  homeButtonText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONT.body,
  },
});


