import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native';
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
import { playWinSound } from '../../lib/win-sound';

export default function ResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        {/* 結果表示 */}
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>
            {isDraw
              ? 'Draw!'
              : isWinner
              ? '🎉 Victory!'
              : '😢 Defeat'}
          </Text>
          {(() => {
            const reason = match.finishReason ?? (match.forfeit ? 'forfeit_consecutive' : 'score');
            const reasonText =
              reason === 'forfeit_consecutive'
                ? (isWinner ? 'Win by forfeit (opponent did not answer 2 times in a row)' : 'Loss by forfeit (you did not answer 2 times in a row)')
                : reason === 'lives'
                ? (isWinner ? 'Win (opponent ran out of lives)' : 'Loss (you ran out of lives)')
                : reason === 'draw'
                ? 'Draw (tied)'
                : (isWinner ? 'Win (higher score)' : 'Loss (lower score)');
            return (
              <Text style={styles.forfeitSubtitle}>
                {reasonText}
              </Text>
            );
          })()}
          {match.questionType === 'overall' && (
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
                    <Text style={[styles.phaseRowStatus, iWon && styles.phaseRowStatusWin, theyWon && styles.phaseRowStatusLoss, draw && styles.phaseRowStatusDraw]}>
                      — {status}
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.phaseRow, styles.phaseRowOverall, isWinner && styles.phaseRowWin, !isWinner && !isDraw && styles.phaseRowLoss]}>
                <Text style={[styles.phaseRowIcon, isWinner && styles.phaseRowIconWin, !isWinner && !isDraw && styles.phaseRowIconLoss]}>
                  {isDraw ? '—' : isWinner ? '✔' : '✗'}
                </Text>
                <Text style={styles.phaseRowLabel}>Overall (rating)</Text>
                <Text style={[styles.phaseRowStatus, isWinner && styles.phaseRowStatusWin, !isWinner && !isDraw && styles.phaseRowStatusLoss, isDraw && styles.phaseRowStatusDraw]}>
                  — {isDraw ? 'DRAW' : isWinner ? 'WIN' : 'LOSS'}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.scoreContainer}>
            <View style={styles.scoreBox}>
              {myUser?.avatarUrl ? (
                <Image source={{ uri: myUser.avatarUrl }} style={styles.resultAvatar} />
              ) : (
                <View style={[styles.resultAvatar, styles.resultAvatarPlaceholder]}>
                  <Text style={styles.resultAvatarText}>{myName.slice(0, 1)}</Text>
                </View>
              )}
              <Text style={styles.scoreLabel}>{myName}</Text>
              {match.lives != null && match.questionType !== 'dictation' ? (
                <>
                  <Text style={styles.scoreValue}>♥{userLife}</Text>
                  <Text style={styles.scoreSub}>Score {userScore}</Text>
                </>
              ) : (
                <Text style={styles.scoreValue}>{userScore}</Text>
              )}
              {match.mode === 'ranked' && myUser?.ratingChange != null && myUser.ratingChange !== 0 && (
                <Text style={[styles.scoreRatingChange, myUser.ratingChange > 0 ? styles.scoreRatingUp : styles.scoreRatingDown]}>
                  {myUser.ratingChange > 0 ? '↑' : '↓'} {Math.abs(myUser.ratingChange)}
                </Text>
              )}
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.scoreBox}>
              {opponentUid !== 'ai' && opponentUser?.avatarUrl ? (
                <Image source={{ uri: opponentUser.avatarUrl }} style={styles.resultAvatar} />
              ) : (
                <View style={[styles.resultAvatar, styles.resultAvatarPlaceholder]}>
                  <Text style={styles.resultAvatarText}>{oppName.slice(0, 1)}</Text>
                </View>
              )}
              <Text style={styles.scoreLabel}>{oppName}</Text>
              {match.lives != null && match.questionType !== 'dictation' ? (
                <>
                  <Text style={styles.scoreValue}>♥{opponentLife}</Text>
                  <Text style={styles.scoreSub}>Score {opponentScore}</Text>
                </>
              ) : (
                <Text style={styles.scoreValue}>{opponentScore}</Text>
              )}
            </View>
          </View>
          {match.questionType === 'overall' && isWinner && (() => {
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
                    <Text style={styles.reviewAnswerLabel}>{myName}'s answer:</Text>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  loadingText: {
    marginTop: 40,
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 4,
    color: COLORS.gold,
  },
  forfeitSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  phaseBreakdown: {
    marginBottom: 12,
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
  },
  phaseRowStatus: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: COLORS.muted,
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
    marginBottom: 12,
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
  },
  championSub: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreBox: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    minWidth: 90,
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  resultAvatarPlaceholder: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.muted,
  },
  scoreLabel: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  scoreSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  scoreRatingChange: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  scoreRatingUp: {
    color: COLORS.correct,
  },
  scoreRatingDown: {
    color: COLORS.incorrect,
  },
  vsText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.muted,
  },
  reviewSection: {
    marginTop: 20,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: COLORS.gold,
  },
  reviewItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  reviewPrompt: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 22,
    color: COLORS.text,
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
  },
  reviewAnswerWrong: {
    fontSize: 13,
    color: COLORS.incorrect,
    fontWeight: '600',
  },
  reviewAnswerCorrect: {
    fontSize: 13,
    color: COLORS.correct,
    fontWeight: '600',
  },
  reviewExplanation: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  homeButton: {
    marginTop: 20,
    marginBottom: 24,
    padding: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  homeButtonText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
});


