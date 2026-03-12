import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef, type ReactElement } from 'react';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db, auth, functions, httpsCallable } from '../../lib/firebase';
import { Match, Question } from '../../types/firestore';
import { ToeicLevel } from '../../types/firestore';
import { normalizeQuestion } from '../../lib/question-utils';
import { TOEIC_LEVELS, LEVEL_DISPLAY, getLevelRangeForToeic } from '../../lib/levels';
import { getQuestionsForToeicBand } from '../../lib/study-questions';
import { getListeningResponseQuestions, shuffleListeningChoices } from '../../lib/listening-response-questions';
import { addStudyWrongListening, addStudyWrongDictation, getStudyWrongDictation, getStudyWrongListening, clearStudyWrongDictation, clearStudyWrongListening, type StudyWrongListeningEntry, type StudyWrongDictationEntry } from '../../lib/study-wrong-answers';
import { getWordsForToeicBand, getTotalWordCount, type DictationEntry } from '../../lib/dictation-vocab';
import { getStudyCardCounts } from '../../lib/study-cards';
import { ensureAudioModeForSpeech } from '../../lib/audio-mode';
import { StudyCardsTopContent } from '../components/StudyCardsTopContent';
import { COLORS } from '../../lib/theme';
import * as Speech from 'expo-speech';

interface WrongQuestion {
  question: Question;
  userAnswer: number | null;
  correctAnswer: number;
  matchId: string;
  matchCreatedAt: Date;
  matchMode: string;
}

type StudyTab = 'choice' | 'dictation' | 'listening_quiz' | 'cards';
type ChoiceSubTab = 'list' | 'wrong'; // 問題一覧（回答非表示） / 間違った回答（解説付き）
type ListeningSubTab = 'list' | 'quiz' | 'wrong'; // 問題一覧（音声文のみ） / クイズ開始 / 間違った回答

const LIST_QUESTIONS_LIMIT_PER_LEVEL = 500;

export default function StudyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeTop = Math.max(4, insets.top - 8);
  const [activeTab, setActiveTab] = useState<StudyTab>('choice');
  const [choiceSubTab, setChoiceSubTab] = useState<ChoiceSubTab>('list');
  const [listLevel, setListLevel] = useState<ToeicLevel>(400);
  const [listQuestions, setListQuestions] = useState<Question[]>([]);
  const [listQuestionsLoading, setListQuestionsLoading] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Listening Quiz
  const [listeningQuizLevel, setListeningQuizLevel] = useState<ToeicLevel>(600);
  const [listeningQuizStarted, setListeningQuizStarted] = useState(false);
  const [listeningSubTab, setListeningSubTab] = useState<ListeningSubTab>('list');
  const [wrongListeningList, setWrongListeningList] = useState<StudyWrongListeningEntry[]>([]);
  const [listeningListQuestions, setListeningListQuestions] = useState<Question[]>([]);
  const [studyCardsCounts, setStudyCardsCounts] = useState<{
    total: number;
    learning: number;
    mastered: number;
    archived: number;
  } | null>(null);
  const [studyCardsLoading, setStudyCardsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'listening_quiz' || listeningQuizStarted) return;
    getStudyWrongListening().then(setWrongListeningList);
  }, [activeTab, listeningQuizStarted, listeningSubTab]);

  useEffect(() => {
    if (activeTab !== 'listening_quiz' || listeningSubTab !== 'list') return;
    const list = getListeningResponseQuestions(listeningQuizLevel);
    setListeningListQuestions(list);
  }, [activeTab, listeningSubTab, listeningQuizLevel]);

  // 問題一覧: アプリ内データを優先、なければ Firestore にフォールバック
  useEffect(() => {
    if (activeTab !== 'choice' || choiceSubTab !== 'list') return;
    setListQuestionsLoading(true);
    const loadAllQuestionsForLevel = async () => {
      try {
        const local = getQuestionsForToeicBand(listLevel);
        if (local.length > 0) {
          setListQuestions(local);
          setListQuestionsLoading(false);
          return;
        }
        const [minLv, maxLv] = getLevelRangeForToeic(listLevel);
        const questionsRef = collection(db, 'questions');
        const all: Question[] = [];
        for (let lv = minLv; lv <= maxLv; lv++) {
          const q = query(
            questionsRef,
            where('lang', '==', 'en'),
            where('exam', '==', 'toeic'),
            where('level', '==', lv),
            limit(LIST_QUESTIONS_LIMIT_PER_LEVEL)
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            const normalized = normalizeQuestion(d.data());
            if (normalized) all.push(normalized);
          });
        }
        setListQuestions(all);
      } catch (e) {
        console.error('[Study] Load list questions error:', e);
        setListQuestions([]);
      } finally {
        setListQuestionsLoading(false);
      }
    };
    loadAllQuestionsForLevel();
  }, [activeTab, choiceSubTab, listLevel]);

  useEffect(() => {
    if (activeTab !== 'cards') return;
    setStudyCardsLoading(true);
    getStudyCardCounts()
      .then(setStudyCardsCounts)
      .catch(() => setStudyCardsCounts({ total: 0, learning: 0, mastered: 0, archived: 0 }))
      .finally(() => setStudyCardsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const loadWrongQuestions = async () => {
      try {
        const uid = auth.currentUser!.uid;
        console.log('[Study] Loading wrong questions for user:', uid);

        // 過去のfinishedマッチを取得（ユーザーが参加しているもの）
        // FirestoreではOR条件が使えないため、players.Aとplayers.Bの両方でクエリを実行
        const matchesRef = collection(db, 'matches');
        
        // players.A === uid のマッチを取得
        const matchesQueryA = query(
          matchesRef,
          where('status', '==', 'finished'),
          where('players.A', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(10) // 多めに取得してフィルタリング
        );

        // players.B === uid のマッチを取得
        const matchesQueryB = query(
          matchesRef,
          where('status', '==', 'finished'),
          where('players.B', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const [matchesSnapshotA, matchesSnapshotB] = await Promise.all([
          getDocs(matchesQueryA),
          getDocs(matchesQueryB),
        ]);

        // マッチをマージして重複を除去
        const allMatches = new Map<string, { doc: any; data: Match }>();
        
        matchesSnapshotA.docs.forEach((doc) => {
          allMatches.set(doc.id, { doc, data: doc.data() as Match });
        });
        
        matchesSnapshotB.docs.forEach((doc) => {
          if (!allMatches.has(doc.id)) {
            allMatches.set(doc.id, { doc, data: doc.data() as Match });
          }
        });

        // createdAtでソートして最新3件を取得
        const sortedMatches = Array.from(allMatches.values())
          .sort((a, b) => {
            const aTime = (a.data.createdAt as any).toMillis();
            const bTime = (b.data.createdAt as any).toMillis();
            return bTime - aTime;
          })
          .slice(0, 3);

        console.log('[Study] Found matches:', sortedMatches.length);

        const allWrongQuestions: WrongQuestion[] = [];

        for (const { data: matchData, doc: matchDoc } of sortedMatches) {
          const matchId = matchDoc.id;

          // ユーザーの回答を取得
          const userAnswers = matchData.answers[uid] || {};
          
          // 問題を取得
          const qIds = matchData.questionIds ?? [];
          const questionPromises = qIds.map((qId) =>
            getDoc(doc(db, 'questions', qId))
          );
          const questionDocs = await Promise.all(questionPromises);

          // 間違った問題を抽出
          questionDocs.forEach((questionDoc, index) => {
            if (!questionDoc.exists()) return;

            const question = normalizeQuestion(questionDoc.data());
            if (!question) return;
            const answer = userAnswers[index];

            // 間違った問題（回答がない、またはisCorrectがfalse）
            if (!answer || !answer.isCorrect) {
              allWrongQuestions.push({
                question,
                userAnswer: answer?.choiceIndex ?? null,
                correctAnswer: question.answerIndex ?? 0,
                matchId,
                matchCreatedAt: (matchData.createdAt as any).toDate(),
                matchMode: matchData.mode,
              });
            }
          });
        }

        console.log('[Study] Total wrong questions:', allWrongQuestions.length);
        setWrongQuestions(allWrongQuestions);
      } catch (error) {
        console.error('[Study] Error loading wrong questions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWrongQuestions();
  }, []);

  // マッチごとにグループ化
  const questionsByMatch = wrongQuestions.reduce((acc, item) => {
    if (!acc[item.matchId]) {
      acc[item.matchId] = {
        matchId: item.matchId,
        matchCreatedAt: item.matchCreatedAt,
        matchMode: item.matchMode,
        questions: [],
      };
    }
    acc[item.matchId].questions.push(item);
    return acc;
  }, {} as Record<string, { matchId: string; matchCreatedAt: Date; matchMode: string; questions: WrongQuestion[] }>);

  const matchGroups = Object.values(questionsByMatch);

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      {/* タブ: 4択・復習 / ディクテーション */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'choice' && styles.tabActive]}
          onPress={() => setActiveTab('choice')}
        >
          <Text style={[styles.tabText, activeTab === 'choice' && styles.tabTextActive]}>
            4-choice / Review
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'dictation' && styles.tabActive]}
          onPress={() => setActiveTab('dictation')}
        >
          <Text style={[styles.tabText, activeTab === 'dictation' && styles.tabTextActive]}>
            Dictation
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'listening_quiz' && styles.tabActive]}
          onPress={() => setActiveTab('listening_quiz')}
        >
          <Text style={[styles.tabText, activeTab === 'listening_quiz' && styles.tabTextActive]}>
            Listening Quiz
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cards' && styles.tabActive]}
          onPress={() => setActiveTab('cards')}
        >
          <Text style={[styles.tabText, activeTab === 'cards' && styles.tabTextActive]}>
            Flashcards
          </Text>
        </TouchableOpacity>
      </View>

      {/* コンテンツエリア */}
      {activeTab === 'choice' ? (
        <ScrollView style={styles.content}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={COLORS.gold} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : wrongQuestions.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>No wrong answers yet</Text>
              <Text style={styles.emptySubtext}>Wrong answers from your last 3 battles will appear here</Text>
            </View>
          ) : (
            <>
              {/* サブタブ: 問題一覧 / 間違った回答 */}
              <View style={styles.subTabContainer}>
                <TouchableOpacity
                  style={[styles.subTab, choiceSubTab === 'list' && styles.subTabActive]}
                  onPress={() => setChoiceSubTab('list')}
                >
                  <Text style={[styles.subTabText, choiceSubTab === 'list' && styles.subTabTextActive]}>
                    Question list
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, choiceSubTab === 'wrong' && styles.subTabActive]}
                  onPress={() => setChoiceSubTab('wrong')}
                >
                  <Text style={[styles.subTabText, choiceSubTab === 'wrong' && styles.subTabTextActive]}>
                    Wrong answers
                  </Text>
                </TouchableOpacity>
              </View>

              {choiceSubTab === 'list' ? (
                /* 問題だけ一覧（選択レベルの全問題・回答は表示しない） */
                <View style={styles.questionListSection}>
                  <Text style={styles.levelLabel}>Level</Text>
                  <View style={styles.levelRow}>
                    {TOEIC_LEVELS.map((lv) => {
                      const { cefr, label } = LEVEL_DISPLAY[lv];
                      return (
                        <TouchableOpacity
                          key={lv}
                          style={[styles.levelChip, listLevel === lv && styles.levelChipActive]}
                          onPress={() => setListLevel(lv)}
                        >
                          <Text style={[styles.levelChipText, listLevel === lv && styles.levelChipTextActive]}>
                            {lv}
                          </Text>
                          <Text style={[styles.levelChipSub, listLevel === lv && styles.levelChipTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {listQuestionsLoading ? (
                    <View style={styles.listLoadingRow}>
                      <ActivityIndicator size="small" color={COLORS.gold} />
                      <Text style={styles.sectionSubtitle}>Loading...</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.sectionSubtitle}>
                        {listQuestions.length} questions
                      </Text>
                      {listQuestions.map((q, index) => (
                        <View key={`list-q-${index}`} style={styles.questionCardPlain}>
                          <Text style={styles.questionPrompt}>{q.prompt ?? ''}</Text>
                          <View style={styles.choicesContainer}>
                            {(Array.isArray(q.choices) ? q.choices : []).map((choice, choiceIndex) => (
                              <View key={choiceIndex} style={styles.choicePlain}>
                                <Text style={styles.choiceText}>
                                  {String.fromCharCode(65 + choiceIndex)}. {choice}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ) : (
                /* 間違った回答（正解・自分の回答・解説を表示） */
                <>
                  <View style={styles.header}>
                    <Text style={styles.title}>Wrong answers</Text>
                    <Text style={styles.subtitle}>Last 3 battles</Text>
                  </View>
                  {matchGroups.map((group, groupIndex) => (
                    <View key={group.matchId} style={styles.matchGroup}>
                      <View style={styles.matchHeader}>
                        <Text style={styles.matchTitle}>
                          {group.matchMode === 'ai' ? 'vs AI' : 'Friend match'} – round {groupIndex + 1}
                        </Text>
                        <Text style={styles.matchDate}>
                          {group.matchCreatedAt.toLocaleDateString('en-US')}
                        </Text>
                      </View>
                      {group.questions.map((item, index) => (
                        <View key={`${group.matchId}-${index}`} style={styles.questionCard}>
                          <Text style={styles.questionPrompt}>{item.question.prompt ?? ''}</Text>
                          <View style={styles.choicesContainer}>
                            {(Array.isArray(item.question.choices) ? item.question.choices : []).map((choice, choiceIndex) => {
                              const isCorrect = choiceIndex === item.correctAnswer;
                              const isUserAnswer = choiceIndex === item.userAnswer;
                              return (
                                <View
                                  key={choiceIndex}
                                  style={[
                                    styles.choice,
                                    isCorrect && styles.choiceCorrect,
                                    isUserAnswer && !isCorrect && styles.choiceIncorrect,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.choiceText,
                                      isCorrect && styles.choiceTextCorrect,
                                      isUserAnswer && !isCorrect && styles.choiceTextIncorrect,
                                    ]}
                                  >
                                    {String.fromCharCode(65 + choiceIndex)}. {choice}
                                    {isCorrect && ' ✓'}
                                    {isUserAnswer && !isCorrect && ' ✗'}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                          <View style={styles.explanationContainer}>
                            <Text style={styles.explanationLabel}>Explanation</Text>
                            <Text style={styles.explanation}>{item.question.explanation ?? ''}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : activeTab === 'listening_quiz' ? (
        listeningQuizStarted ? (
          <ListeningQuizScreen
            level={listeningQuizLevel}
            onBack={() => setListeningQuizStarted(false)}
          />
        ) : (
          <ScrollView style={styles.content}>
            {/* サブタブ: 問題一覧 / クイズ / 間違った回答 */}
            <View style={styles.subTabContainer}>
              <TouchableOpacity
                style={[styles.subTab, listeningSubTab === 'list' && styles.subTabActive]}
                onPress={() => setListeningSubTab('list')}
              >
                <Text style={[styles.subTabText, listeningSubTab === 'list' && styles.subTabTextActive]}>
                  Question list
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTab, listeningSubTab === 'quiz' && styles.subTabActive]}
                onPress={() => setListeningSubTab('quiz')}
              >
                <Text style={[styles.subTabText, listeningSubTab === 'quiz' && styles.subTabTextActive]}>
                  Quiz
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTab, listeningSubTab === 'wrong' && styles.subTabActive]}
                onPress={() => setListeningSubTab('wrong')}
              >
                <Text style={[styles.subTabText, listeningSubTab === 'wrong' && styles.subTabTextActive]}>
                  Wrong answers
                </Text>
              </TouchableOpacity>
            </View>

            {listeningSubTab === 'list' ? (
              <View style={styles.questionListSection}>
                <Text style={styles.levelLabel}>Level</Text>
                <View style={styles.levelRow}>
                  {TOEIC_LEVELS.map((lv) => {
                    const { cefr, label } = LEVEL_DISPLAY[lv];
                    return (
                      <TouchableOpacity
                        key={lv}
                        style={[styles.levelChip, listeningQuizLevel === lv && styles.levelChipActive]}
                        onPress={() => setListeningQuizLevel(lv)}
                      >
                        <Text style={[styles.levelChipText, listeningQuizLevel === lv && styles.levelChipTextActive]}>{lv}</Text>
                        <Text style={[styles.levelChipSub, listeningQuizLevel === lv && styles.levelChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.sectionSubtitle}>
                  {listeningListQuestions.length} questions (audio only — no answers shown)
                </Text>
                {listeningListQuestions.slice(0, 100).map((q, index) => (
                  <View key={`listening-list-${index}`} style={styles.questionCardPlain}>
                    <Text style={[styles.sectionSubtitle, { marginBottom: 4 }]}>🔊 You will hear:</Text>
                    <Text style={styles.questionPrompt}>{q.prompt ?? ''}</Text>
                  </View>
                ))}
              </View>
            ) : listeningSubTab === 'quiz' ? (
              <View style={styles.questionListSection}>
                <Text style={styles.sectionTitle}>Listening Quiz</Text>
                <Text style={styles.sectionSubtitle}>Listen to the sentence and choose the best response.</Text>
                <Text style={styles.levelLabel}>Level</Text>
                <View style={styles.levelRow}>
                  {TOEIC_LEVELS.map((lv) => {
                    const { cefr, label } = LEVEL_DISPLAY[lv];
                    return (
                      <TouchableOpacity
                        key={lv}
                        style={[styles.levelChip, listeningQuizLevel === lv && styles.levelChipActive]}
                        onPress={() => setListeningQuizLevel(lv)}
                      >
                        <Text style={[styles.levelChipText, listeningQuizLevel === lv && styles.levelChipTextActive]}>{lv}</Text>
                        <Text style={[styles.levelChipSub, listeningQuizLevel === lv && styles.levelChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={styles.startListeningQuizButton}
                  onPress={() => setListeningQuizStarted(true)}
                >
                  <Text style={styles.startListeningQuizButtonText}>Start Listening Quiz</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Wrong answers</Text>
                  <Text style={styles.subtitle}>Listening Quiz</Text>
                </View>
                {wrongListeningList.length === 0 ? (
                  <View style={styles.centerContainer}>
                    <Text style={styles.emptyText}>No wrong answers yet</Text>
                    <Text style={styles.emptySubtext}>Wrong answers from Listening Quiz will appear here</Text>
                  </View>
                ) : (
                  <View style={styles.questionListSection}>
                    <Text style={styles.sectionSubtitle}>{wrongListeningList.length} items</Text>
                    {wrongListeningList.slice(0, 20).map((item, idx) => (
                      <View key={idx} style={styles.questionCard}>
                        <Text style={styles.questionPrompt}>{item.prompt}</Text>
                        <View style={styles.choicesContainer}>
                          {(item.choices ?? []).map((choice, choiceIndex) => {
                            const isCorrect = choiceIndex === item.answerIndex;
                            const isUserAnswer = choiceIndex === item.userChoiceIndex;
                            return (
                              <View
                                key={choiceIndex}
                                style={[
                                  styles.choice,
                                  isCorrect && styles.choiceCorrect,
                                  isUserAnswer && !isCorrect && styles.choiceIncorrect,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.choiceText,
                                    isCorrect && styles.choiceTextCorrect,
                                    isUserAnswer && !isCorrect && styles.choiceTextIncorrect,
                                  ]}
                                >
                                  {String.fromCharCode(65 + choiceIndex)}. {choice}
                                  {isCorrect && ' ✓'}
                                  {isUserAnswer && !isCorrect && ' ✗'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                        <View style={styles.explanationContainer}>
                          <Text style={styles.explanationLabel}>Explanation</Text>
                          <Text style={styles.explanation}>{item.explanation ?? ''}</Text>
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.choice, { marginTop: 12, alignItems: 'center' }]}
                      onPress={() => { clearStudyWrongListening(); setWrongListeningList([]); }}
                    >
                      <Text style={[styles.choiceText, { color: COLORS.muted }]}>Clear wrong list</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )
      ) : activeTab === 'cards' ? (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
          <StudyCardsTopContent
            counts={studyCardsCounts}
            loading={studyCardsLoading}
            onAdd={() => router.push('/study-cards')}
            onReview={() => router.push('/study-cards')}
            onList={() => router.push('/study-cards')}
          />
        </ScrollView>
      ) : (
        <DictationScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingBottom: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.gold,
  },
  tabText: {
    fontSize: 15,
    color: COLORS.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 17,
  },
  subTabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  subTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActive: {
    borderBottomColor: COLORS.gold,
  },
  subTabText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  subTabTextActive: {
    color: COLORS.gold,
    fontWeight: '600',
    fontSize: 14,
  },
  questionListSection: {
    paddingHorizontal: 32,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 16,
  },
  levelLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 8,
  },
  levelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  levelChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  levelChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  levelChipSub: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
  },
  levelChipTextActive: {
    color: COLORS.gold,
  },
  startListeningQuizButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
  },
  startListeningQuizButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  listLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  questionCardPlain: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  choicePlain: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 400,
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 20,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  header: {
    padding: 32,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    color: COLORS.gold,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
  },
  matchGroup: {
    marginTop: 24,
    paddingHorizontal: 32,
  },
  matchHeader: {
    marginBottom: 16,
  },
  matchTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    color: COLORS.text,
  },
  matchDate: {
    fontSize: 11,
    color: COLORS.muted,
  },
  questionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  questionPrompt: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 26,
    color: COLORS.text,
  },
  choicesContainer: {
    gap: 8,
    marginBottom: 16,
  },
  choice: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  choiceCorrect: {
    borderColor: COLORS.correct,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
  },
  choiceIncorrect: {
    borderColor: COLORS.incorrect,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  choiceText: {
    fontSize: 15,
    color: COLORS.text,
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
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gold,
    marginBottom: 8,
  },
  explanation: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },
});

// Listening Quiz: 音声で聞いて応答を4択で選ぶ
function ListeningQuizScreen({ level, onBack }: { level: ToeicLevel; onBack: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  // 自動再生しない。ユーザーが「再生」を押してから聞く

  useEffect(() => {
    const list = getListeningResponseQuestions(level);
    setQuestions(list);
    setCurrentIndex(0);
    setAnswered(false);
    setSelectedChoice(null);
    setCurrentQuestion(null);
  }, [level]);

  useEffect(() => {
    if (questions.length === 0 || currentIndex >= questions.length) {
      if (questions.length > 0 && currentIndex >= questions.length) setCurrentQuestion(null);
      return;
    }
    const q = shuffleListeningChoices(questions[currentIndex]);
    setCurrentQuestion(q);
    setAnswered(false);
    setSelectedChoice(null);
  }, [currentIndex, questions.length]);

  const handlePlayQuestion = () => {
    if (!currentQuestion) return;
    ensureAudioModeForSpeech().then(() => {
      Speech.speak(currentQuestion.prompt, { language: 'en-US' });
    });
  };

  const handleSelectChoice = (index: number) => {
    if (answered) return;
    setSelectedChoice(index);
    setAnswered(true);
    const q = currentQuestion;
    if (q) {
      const correctIndex = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
      if (index !== correctIndex) {
        addStudyWrongListening({ question: q, userChoiceIndex: index }).catch((e) => console.warn('[Study] save wrong listening', e));
      }
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(questions.length);
    }
  };

  if (questions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>No questions for this level. Try TOEIC 600.</Text>
        <TouchableOpacity style={styles.startListeningQuizButton} onPress={onBack}>
          <Text style={styles.startListeningQuizButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (currentIndex >= questions.length) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Complete! You finished {questions.length} questions.</Text>
        <TouchableOpacity style={styles.startListeningQuizButton} onPress={onBack}>
          <Text style={styles.startListeningQuizButtonText}>Back to Study</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = currentQuestion;
  if (!q) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const correctIndex = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
  const showResult = answered && selectedChoice !== null;

  return (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.questionListSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity onPress={onBack}>
            <Text style={[styles.sectionSubtitle, { color: COLORS.gold }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionSubtitle}>Question {currentIndex + 1} / {questions.length}</Text>
        </View>
      </View>

      <View style={styles.questionListSection}>
        <View style={styles.questionCard}>
        <TouchableOpacity style={[styles.choice, { marginBottom: 12 }]} onPress={handlePlayQuestion}>
          <Text style={styles.choiceText}>🔊 Play</Text>
        </TouchableOpacity>
        <Text style={[styles.sectionSubtitle, { marginBottom: 16 }]}>Tap Play to hear the question.</Text>

        {!showResult ? (
          <>
            <Text style={[styles.explanationLabel, { marginBottom: 8 }]}>Choose the best response:</Text>
            <View style={styles.choicesContainer}>
              {choices.map((choice, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.choice}
                  onPress={() => handleSelectChoice(index)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.choiceText}>
                    {String.fromCharCode(65 + index)}. {choice}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.choicesContainer}>
              {choices.map((choice, index) => {
                const isCorrect = index === correctIndex;
                const isUserAnswer = index === selectedChoice;
                return (
                  <View
                    key={index}
                    style={[
                      styles.choice,
                      isCorrect && styles.choiceCorrect,
                      isUserAnswer && !isCorrect && styles.choiceIncorrect,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        isCorrect && styles.choiceTextCorrect,
                        isUserAnswer && !isCorrect && styles.choiceTextIncorrect,
                      ]}
                    >
                      {String.fromCharCode(65 + index)}. {choice}
                      {isCorrect && ' ✓'}
                      {isUserAnswer && !isCorrect && ' ✗'}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={styles.explanationLabel}>You heard:</Text>
              <Text style={[styles.questionPrompt, { marginTop: 4, marginBottom: 0 }]}>{q.prompt}</Text>
            </View>
            <View style={styles.explanationContainer}>
              <Text style={styles.explanationLabel}>Explanation</Text>
              <Text style={styles.explanation}>{q.explanation ?? ''}</Text>
            </View>
            <TouchableOpacity style={[styles.choice, { marginTop: 16, alignItems: 'center' }]} onPress={handleNext}>
              <Text style={styles.choiceText}>
                {currentIndex + 1 < questions.length ? 'Next' : 'Finish'}
              </Text>
            </TouchableOpacity>
          </>
        )}
        </View>
      </View>
    </ScrollView>
  );
}

// ディクテーション画面コンポーネント
function DictationScreen() {
  const [selectedLevel, setSelectedLevel] = useState<ToeicLevel>(730);
  const [isStarted, setIsStarted] = useState(false);
  const [currentWord, setCurrentWord] = useState<string>('');
  const [currentChoiceWords, setCurrentChoiceWords] = useState<string[]>([]);
  const [currentChoiceIndex, setCurrentChoiceIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [levelWordEntries, setLevelWordEntries] = useState<DictationEntry[]>([]);
  const [currentDefinition, setCurrentDefinition] = useState<string>('');
  const [levelWordsLoading, setLevelWordsLoading] = useState(false);
  const [showWordList, setShowWordList] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const displayedCharsRef = useRef<string>('');
  const lastWrongAudioAtRef = useRef<number>(0);
  const lastWordRef = useRef<string | null>(null);
  const wrongRecordedForWordRef = useRef<string | null>(null);
  const [wrongDictationList, setWrongDictationList] = useState<StudyWrongDictationEntry[]>([]);

  const totalWordCount = getTotalWordCount();

  const loadLevelWords = () => {
    setLevelWordsLoading(true);
    const entries = getWordsForToeicBand(selectedLevel);
    setLevelWordEntries(entries);
    setLevelWordsLoading(false);
  };

  useEffect(() => {
    if (isStarted) return;
    loadLevelWords();
  }, [selectedLevel, isStarted]);

  useEffect(() => {
    if (isStarted) return;
    getStudyWrongDictation().then(setWrongDictationList);
  }, [isStarted]);

  const loadRandomWord = async () => {
    const entries = getWordsForToeicBand(selectedLevel);
    if (entries.length === 0) {
      Alert.alert('No words', `No dictation words for this level (${LEVEL_DISPLAY[selectedLevel].label}). Run: node scripts/build-dictation-vocab.js`);
      return;
    }
    try {
      setIsLoading(true);
      setCurrentWord('');
      setCurrentDefinition('');
      setCurrentChoiceWords([]);
      setCurrentChoiceIndex(0);
      setDisplayedChars('');
      displayedCharsRef.current = '';
      lastWrongAudioAtRef.current = 0;
      setUserInput('');
      setIsComplete(false);

      let entry = entries[Math.floor(Math.random() * entries.length)];
      if (entries.length > 1 && lastWordRef.current !== null && entry.word === lastWordRef.current) {
        const other = entries.filter((e) => e.word !== lastWordRef.current);
        entry = other[Math.floor(Math.random() * other.length)];
      }
      lastWordRef.current = entry.word;
      wrongRecordedForWordRef.current = null;

      setCurrentChoiceWords([entry.word]);
      setCurrentDefinition(entry.definition || '');
      setCurrentChoiceIndex(0);
      setCurrentWord(entry.word.toLowerCase());
      setDisplayedChars('');
      displayedCharsRef.current = '';
      lastWrongAudioAtRef.current = 0;
      setUserInput('');
      setIsComplete(false);
      await playWord(entry.word);
    } catch (error) {
      console.error('[Dictation] Error loading word:', error);
      Alert.alert('Error', 'Failed to load word');
    } finally {
      setIsLoading(false);
    }
  };

  // 音声を再生
  const playWord = async (word: string) => {
    return new Promise<void>(async (resolve) => {
      try {
        await ensureAudioModeForSpeech();
        Speech.speak(word, {
          language: 'en-US',
          onDone: () => {
            resolve();
          },
          onError: (error) => {
            console.error('[Dictation] Speech error:', error);
            resolve();
          },
        });
      } catch (e) {
        resolve();
      }
    });
  };

  // ディクテーション開始
  const handleStart = async () => {
    setIsStarted(true);
    await loadRandomWord();
    // フォーカスを入力フィールドに設定
    setTimeout(() => {
      inputRef.current?.focus();
    }, 500);
  };

  // 正解後「次へ」タップ or Enter で次の問題へ
  const handleDictationNext = async () => {
    const nextIndex = currentChoiceIndex + 1;
    if (nextIndex < currentChoiceWords.length) {
      const nextWord = currentChoiceWords[nextIndex];
      setCurrentChoiceIndex(nextIndex);
      setCurrentWord(nextWord.toLowerCase());
      setDisplayedChars('');
      displayedCharsRef.current = '';
      setUserInput('');
      setIsComplete(false);
      await playWord(nextWord);
    } else {
      try {
        const inc = httpsCallable(functions, 'incrementTodayDictation');
        await inc({});
      } catch (e) {
        console.warn('[Study] incrementTodayDictation:', e);
      }
      await loadRandomWord();
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 入力変更時の処理（スペース対応: 最初からスペースを表示し、入力時に自動挿入）
  const handleInputChange = async (text: string) => {
    if (!currentWord) return;

    const textWithoutSpaces = text.replace(/\s/g, '').toLowerCase();
    const lowerWord = currentWord.toLowerCase();
    const correctWordWithoutSpaces = lowerWord.replace(/\s/g, '');
    const currentDisplayedChars = displayedCharsRef.current || '';
    const displayedWithoutSpaces = currentDisplayedChars.replace(/\s/g, '');
    const displayedLength = displayedWithoutSpaces.length;

    // 全ての文字を入力し終わった場合
    if (textWithoutSpaces.length >= correctWordWithoutSpaces.length) {
      if (textWithoutSpaces === correctWordWithoutSpaces) {
        // 正解: スペースを含む表示文字を構築
        let newDisplayed = '';
        let correctIndex = 0;
        for (let i = 0; i < correctWordWithoutSpaces.length; i++) {
          while (correctIndex < lowerWord.length && lowerWord[correctIndex] === ' ') {
            newDisplayed += ' ';
            correctIndex++;
          }
          if (correctIndex < lowerWord.length) {
            newDisplayed += correctWordWithoutSpaces[i];
            correctIndex++;
          }
        }
        displayedCharsRef.current = newDisplayed;
        setDisplayedChars(newDisplayed);
        setUserInput(newDisplayed);
        setIsComplete(true);
        // 自動では次へ進まない。説明を読んだあと「次へ」タップまたは Enter で次へ
      }
      return;
    }

    // 削除の場合
    if (textWithoutSpaces.length < displayedLength) {
      let newDisplayed = '';
      let correctIndex = 0;
      for (let i = 0; i < textWithoutSpaces.length; i++) {
        while (correctIndex < lowerWord.length && lowerWord[correctIndex] === ' ') {
          newDisplayed += ' ';
          correctIndex++;
        }
        if (correctIndex < lowerWord.length) {
          newDisplayed += textWithoutSpaces[i];
          correctIndex++;
        }
      }
      displayedCharsRef.current = newDisplayed;
      setDisplayedChars(newDisplayed);
      setUserInput(newDisplayed);
      return;
    }

    const newInput = textWithoutSpaces.slice(displayedLength);
    if (newInput.length === 0) {
      setUserInput(currentDisplayedChars);
      return;
    }

    // 1文字ずつチェックして処理
    const nextCorrectChar = correctWordWithoutSpaces[displayedLength];
    const nextInputChar = newInput[0];

    if (nextInputChar === nextCorrectChar) {
      const processedLength = displayedLength + 1;
      let newDisplayed = '';
      let correctIndex = 0;
      for (let i = 0; i < processedLength; i++) {
        while (correctIndex < lowerWord.length && lowerWord[correctIndex] === ' ') {
          newDisplayed += ' ';
          correctIndex++;
        }
        if (correctIndex < lowerWord.length) {
          newDisplayed += i < displayedLength ? displayedWithoutSpaces[i] : nextInputChar;
          correctIndex++;
        }
      }
      // 今入力した文字の直後にスペースがあれば自動挿入
      let charCount = 0;
      for (let i = 0; i < lowerWord.length; i++) {
        if (lowerWord[i] !== ' ') {
          charCount++;
          if (charCount === processedLength && i + 1 < lowerWord.length && lowerWord[i + 1] === ' ') {
            newDisplayed += ' ';
            break;
          }
        }
      }
      displayedCharsRef.current = newDisplayed;
      setDisplayedChars(newDisplayed);
      setUserInput(newDisplayed);
    } else {
      setUserInput(currentDisplayedChars);
      if (wrongRecordedForWordRef.current !== currentWord) {
        wrongRecordedForWordRef.current = currentWord;
        addStudyWrongDictation({ word: currentWord, level: selectedLevel }).catch((e) => console.warn('[Study] save wrong dictation', e));
      }
      // 間違えたときの音声再生（3秒クールダウン後なら再生、その後3秒休憩）
      const now = Date.now();
      if (now - lastWrongAudioAtRef.current >= 3000) {
        lastWrongAudioAtRef.current = now;
        await playWord(currentWord);
      }
    }
  };

  // 再再生ボタン
  const handleReplay = async () => {
    if (currentWord) {
      await playWord(currentWord);
    }
  };

  if (!isStarted) {
    return (
      <View style={dictationStyles.container}>
        <ScrollView contentContainerStyle={dictationStyles.centerContainer}>
          <Text style={dictationStyles.title}>Dictation</Text>
          <Text style={dictationStyles.subtitle}>
            Listen and type the word you hear
          </Text>
          <Text style={dictationStyles.levelLabel}>Select difficulty (TOEIC · CEFR)</Text>
          <View style={dictationStyles.levelGrid}>
            <View style={dictationStyles.levelRow}>
              {TOEIC_LEVELS.slice(0, 3).map((lv) => {
                const { cefr, label } = LEVEL_DISPLAY[lv];
                const isSelected = selectedLevel === lv;
                return (
                  <TouchableOpacity
                    key={lv}
                    style={[dictationStyles.levelCard, isSelected && dictationStyles.levelCardSelected]}
                    onPress={() => setSelectedLevel(lv)}
                    activeOpacity={0.8}
                  >
                    <View style={[dictationStyles.levelCardBadge, isSelected && dictationStyles.levelCardBadgeSelected]}>
                      <Text style={[dictationStyles.levelCardCefr, isSelected && dictationStyles.levelCardCefrSelected]}>{cefr}</Text>
                    </View>
                    <Text style={[dictationStyles.levelCardLabel, isSelected && dictationStyles.levelCardLabelSelected]} numberOfLines={2}>
                      {label}
                    </Text>
                    <Text style={[dictationStyles.levelCardToeic, isSelected && dictationStyles.levelCardToeicSelected]}>
                      TOEIC {lv}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[dictationStyles.levelRow, dictationStyles.levelRowSecond]}>
              {TOEIC_LEVELS.slice(3, 5).map((lv) => {
                const { cefr, label } = LEVEL_DISPLAY[lv];
                const isSelected = selectedLevel === lv;
                return (
                  <TouchableOpacity
                    key={lv}
                    style={[dictationStyles.levelCard, isSelected && dictationStyles.levelCardSelected]}
                    onPress={() => setSelectedLevel(lv)}
                    activeOpacity={0.8}
                  >
                    <View style={[dictationStyles.levelCardBadge, isSelected && dictationStyles.levelCardBadgeSelected]}>
                      <Text style={[dictationStyles.levelCardCefr, isSelected && dictationStyles.levelCardCefrSelected]}>{cefr}</Text>
                    </View>
                    <Text style={[dictationStyles.levelCardLabel, isSelected && dictationStyles.levelCardLabelSelected]} numberOfLines={2}>
                      {label}
                    </Text>
                    <Text style={[dictationStyles.levelCardToeic, isSelected && dictationStyles.levelCardToeicSelected]}>
                      TOEIC {lv}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={dictationStyles.buttonRow}>
            <TouchableOpacity
              style={dictationStyles.startButton}
              onPress={handleStart}
              disabled={isLoading}
            >
              <Text style={dictationStyles.startButtonText}>
                {isLoading ? 'Loading...' : 'Start dictation'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dictationStyles.listButton}
              onPress={() => {
                const willOpen = !showWordList;
                if (willOpen) loadLevelWords();
                setShowWordList(willOpen);
              }}
              disabled={levelWordsLoading}
            >
              <Text style={dictationStyles.listButtonText}>
                {levelWordsLoading ? 'Loading...' : showWordList ? 'Hide list' : 'List'}
              </Text>
            </TouchableOpacity>
          </View>

          {wrongDictationList.length > 0 && (
            <View style={{ marginTop: 24, paddingHorizontal: 32 }}>
              <Text style={dictationStyles.wordListTitle}>Wrong words (Dictation)</Text>
              <Text style={styles.sectionSubtitle}>{wrongDictationList.length} items</Text>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                {wrongDictationList.slice(0, 30).map((item, idx) => (
                  <View key={idx} style={styles.questionCardPlain}>
                    <Text style={styles.questionPrompt}>{item.word}</Text>
                    <Text style={styles.sectionSubtitle}>Level {item.level}</Text>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[dictationStyles.listButton, { marginTop: 8 }]}
                onPress={() => { clearStudyWrongDictation(); setWrongDictationList([]); }}
              >
                <Text style={dictationStyles.listButtonText}>Clear wrong list</Text>
              </TouchableOpacity>
            </View>
          )}

          {showWordList && (
            <View style={dictationStyles.wordListSection}>
              <Text style={dictationStyles.wordListTitle}>
                Total {totalWordCount} words / This level {levelWordEntries.length} words
              </Text>
              {levelWordEntries.length === 0 ? (
                <View style={dictationStyles.wordListEmptyBlock}>
                  <Text style={dictationStyles.wordListEmpty}>No dictation words for this level</Text>
                  <Text style={dictationStyles.wordListEmptyHint}>
                    Run: node scripts/build-dictation-vocab.js to generate vocabulary
                  </Text>
                </View>
              ) : (
                <View style={dictationStyles.wordListRows}>
                  {levelWordEntries.map((entry, i) => (
                    <View key={`${entry.word}-${i}`} style={dictationStyles.wordListRow}>
                      <Text style={dictationStyles.wordListRowText} numberOfLines={1}>{entry.word}</Text>
                      {entry.definition ? (
                        <Text style={dictationStyles.wordListRowDefinition} numberOfLines={2}>{entry.definition}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={dictationStyles.container}>
      <View style={dictationStyles.content}>
        {/* 戻るボタン */}
        <TouchableOpacity
          style={dictationStyles.backButton}
          onPress={() => setIsStarted(false)}
        >
          <Text style={dictationStyles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        {/* 再再生ボタン */}
        <TouchableOpacity
          style={dictationStyles.replayButton}
          onPress={handleReplay}
        >
          <Text style={dictationStyles.replayButtonText}>🔊 Play again</Text>
        </TouchableOpacity>

        {/* 表示エリア（スペースは最初から表示: 例 "to be" → "__ __"） */}
        <View style={dictationStyles.displayArea}>
          <Text style={dictationStyles.displayText}>
            {currentWord && (() => {
              const correctWordLower = currentWord.toLowerCase();
              const displayedWithoutSpaces = displayedChars.replace(/\s/g, '');
              let displayedIndex = 0;
              const result: ReactElement[] = [];
              for (let i = 0; i < correctWordLower.length; i++) {
                if (correctWordLower[i] === ' ') {
                  result.push(<Text key={i} style={dictationStyles.placeholderText}>{' '}</Text>);
                } else {
                  if (displayedIndex < displayedWithoutSpaces.length) {
                    result.push(<Text key={i} style={dictationStyles.displayChar}>{displayedWithoutSpaces[displayedIndex]}</Text>);
                    displayedIndex++;
                  } else {
                    result.push(<Text key={i} style={dictationStyles.placeholderText}>_</Text>);
                  }
                }
              }
              return result;
            })()}
          </Text>
        </View>

        {/* 入力フィールド（正解後は Enter で次へ進める） */}
        <TextInput
          ref={inputRef}
          style={dictationStyles.input}
          value={userInput}
          onChangeText={handleInputChange}
          onSubmitEditing={() => {
            if (isComplete) handleDictationNext();
          }}
          placeholder="Type here"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={true}
          returnKeyType={isComplete ? 'next' : 'done'}
        />

        {/* 完了メッセージと英英定義 */}
        {isComplete && (
          <View style={dictationStyles.completeContainer}>
            <Text style={dictationStyles.completeText}>🎉 Correct!</Text>
            {currentDefinition ? (
              <Text style={dictationStyles.definitionText}>{currentDefinition}</Text>
            ) : null}
          </View>
        )}

        {/* 次の問題ボタン（正解後はタップ or Enter で次へ） */}
        {isComplete && (
          <TouchableOpacity
            style={dictationStyles.nextButton}
            onPress={handleDictationNext}
          >
            <Text style={dictationStyles.nextButtonText}>Next word</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const dictationStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingBottom: 10,
  },
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 12,
    color: COLORS.gold,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  levelLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 10,
    textAlign: 'center',
  },
  levelGrid: {
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  levelRowSecond: {
    marginBottom: 0,
    justifyContent: 'center',
    gap: 10,
  },
  levelCard: {
    width: '31%',
    maxWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelCardSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  levelCardBadge: {
    backgroundColor: COLORS.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginBottom: 4,
  },
  levelCardBadgeSelected: {
    backgroundColor: COLORS.gold,
  },
  levelCardCefr: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.3,
  },
  levelCardCefrSelected: {
    color: COLORS.background,
  },
  levelCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  levelCardLabelSelected: {
    color: COLORS.gold,
  },
  levelCardToeic: {
    fontSize: 8,
    color: COLORS.muted,
    fontWeight: '500',
  },
  levelCardToeicSelected: {
    color: COLORS.gold,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  startButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  startButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
  listButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  wordListEmpty: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  wordListEmptyBlock: {
    padding: 20,
    alignItems: 'center',
  },
  wordListEmptyHint: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  wordListSection: {
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  wordListTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  wordListRows: {
    paddingBottom: 24,
  },
  wordListRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wordListRowText: {
    fontSize: 16,
    color: COLORS.text,
  },
  wordListRowDefinition: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
    marginLeft: 0,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 12,
    marginBottom: 8,
  },
  backButtonText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
  replayButton: {
    alignSelf: 'flex-end',
    padding: 12,
    marginBottom: 20,
  },
  replayButtonText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
  displayArea: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  displayText: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    color: COLORS.text,
  },
  displayChar: {
    color: COLORS.correct,
  },
  placeholderText: {
    color: COLORS.border,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  completeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  completeText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.correct,
  },
  definitionText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
    fontStyle: 'italic',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  nextButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
});
