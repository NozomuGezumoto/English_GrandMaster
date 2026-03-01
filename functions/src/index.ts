import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// エミュレータ環境の設定
// Firebaseエミュレータが起動している場合、自動的に環境変数が設定される
// 本番では環境変数が未設定のため、エミュレータ接続ログは出さない
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.log('Firestore Emulator Host:', process.env.FIRESTORE_EMULATOR_HOST || 'not set');
  console.log('Auth Emulator Host:', process.env.FIREBASE_AUTH_EMULATOR_HOST || 'not set');
}

admin.initializeApp();
const db = admin.firestore();

// 型定義
type Language = 'en' | 'de' | 'fr';
type MatchMode = 'ai' | 'friend' | 'ranked';
type MatchStatus = 'waiting' | 'playing' | 'finished' | 'aborted';
/** ランクマの種別。総合のみ Grandmaster 称号あり */
type RankedMode = 'choice' | 'dictation' | 'listening' | 'overall';

// TOEICレベル（400, 600, 730, 860, 990）→ 問題の level 1-10 の範囲にマッピング
function getLevelRange(toeicLevel: number): [number, number] {
  switch (toeicLevel) {
    case 400: return [1, 2];
    case 600: return [3, 4];
    case 730: return [5, 6];
    case 860: return [7, 8];
    case 990: return [9, 10];
    default: return [1, 10];
  }
}

/** ランクマ用: Eloレート → 出題TOEICレベル（デフォルト1000想定） */
function ratingToToeicLevel(rating: number): 400 | 600 | 730 | 860 | 990 {
  if (rating < 900) return 400;
  if (rating < 1100) return 600;
  if (rating < 1300) return 730;
  if (rating < 1500) return 860;
  return 990;
}

interface CreateMatchRequest {
  mode: MatchMode;
  lang: Language;
  questionType?: 'choice' | 'dictation' | 'listening';
  questionCount?: number;
  /** TOEICレベル（400|600|730|860|990）。AI・友達対戦で使用 */
  level?: number;
  /** AI対戦でクライアント側の問題 id を使う場合（アプリ内データ用）。省略時はサーバーで getRandomQuestions。listening の場合は必須。 */
  questionIds?: string[];
}

interface JoinFriendMatchRequest {
  roomCode: string;
}

interface SubmitAnswerRequest {
  matchId: string;
  qIndex: number;
  choiceIndex?: number; // 4択問題の場合
  textAnswer?: string; // ディクテーションの場合
  timeRemaining?: number; // ディクテーションの場合：残り時間（秒）
  /** アプリ内問題（local-*）のときクライアントから送る正解の choiceIndex。サーバーは問題を読まない */
  correctChoiceIndex?: number;
  /** 20秒経過でクライアントが送った「未回答」であることを明示。これが true なら choiceIndex の値に依らず isTimeout 扱い（不戦敗カウント用） */
  isTimeout?: boolean;
}

interface FinalizeMatchRequest {
  matchId: string;
}

interface ClaimForfeitRequest {
  matchId: string;
}

// ルームコード生成（6桁）
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 出題可能か: active かつ qualityStatus===ok、reading は passage 必須
function isDeliverable(data: admin.firestore.DocumentData): boolean {
  if (data.active === false) return false;
  const status = data.qualityStatus;
  if (status !== undefined && status !== 'ok') return false;
  if (data.type === 'reading') {
    const passage = data.passage;
    if (passage == null || String(passage).trim() === '') return false;
  }
  return true;
}

// 問題をランダムに取得（toeicLevel 指定時は question.level がその範囲のものに絞る）
// active===true & qualityStatus==='ok' のみ出題。reading は passage 必須。足りない場合は level±1 で補充、それでも足りなければエラー
async function getRandomQuestions(
  lang: Language,
  exam: string = 'toeic',
  count: number = 5,
  toeicLevel?: number
): Promise<string[]> {
  try {
    console.log(`Getting questions: lang=${lang}, exam=${exam}, count=${count}, toeicLevel=${toeicLevel ?? 'any'}`);

    const questionsRef = db.collection('questions');
    const limit = 500;
    const snapshot = await questionsRef
      .where('lang', '==', lang)
      .where('exam', '==', exam)
      .limit(limit)
      .get();

    let docs = snapshot.docs.filter((d) => isDeliverable(d.data()));
    console.log(`Deliverable (active & qualityStatus=ok, reading has passage): ${docs.length}`);

    let minLv = 1;
    let maxLv = 10;
    if (toeicLevel != null) {
      [minLv, maxLv] = getLevelRange(toeicLevel);
      let levelFiltered = docs.filter((d) => {
        const level = d.data().level;
        const n = typeof level === 'number' ? level : 1;
        return n >= minLv && n <= maxLv;
      });
      if (levelFiltered.length < count) {
        const expandedMin = Math.max(1, minLv - 1);
        const expandedMax = Math.min(10, maxLv + 1);
        levelFiltered = docs.filter((d) => {
          const level = d.data().level;
          const n = typeof level === 'number' ? level : 1;
          return n >= expandedMin && n <= expandedMax;
        });
        console.log(`Level ${minLv}-${maxLv} had ${levelFiltered.length} questions; expanded to ${expandedMin}-${expandedMax}: ${levelFiltered.length}`);
      }
      docs = levelFiltered;
    }

    if (docs.length < count) {
      console.error(`Not enough questions: need ${count}, got ${docs.length}`);
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Not enough questions for this level. Please try again later.'
      );
    }

    const questionIds = docs.map((d) => d.id);
    const selected: string[] = [];
    const used = new Set<number>();
    while (selected.length < count && selected.length < questionIds.length) {
      const index = Math.floor(Math.random() * questionIds.length);
      if (!used.has(index)) {
        used.add(index);
        selected.push(questionIds[index]);
      }
    }

    console.log(`Selected ${selected.length} questions`);
    return selected;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in getRandomQuestions:', error);
    throw error;
  }
}

// 1. マッチ作成
export const createMatch = functions.https.onCall(
  async (data: CreateMatchRequest, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { mode, lang, questionType = 'choice', questionCount, level } = data;
    const uid = context.auth.uid;
    const validLevels = [400, 600, 730, 860, 990];
    const toeicLevel = (mode === 'ai' || mode === 'friend') && level != null && validLevels.includes(Number(level))
      ? Number(level) as 400 | 600 | 730 | 860 | 990
      : undefined;

    if (mode !== 'ai' && mode !== 'friend') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid mode'
      );
    }

    // ディクテーション: 3問（スコア制）、4択/リスニング: 10問（ライフ制）
    const finalQuestionCount = questionCount ?? (questionType === 'dictation' ? 5 : 10);

    try {
      console.log('createMatch called:', { mode, lang, questionType, questionCount: finalQuestionCount, uid });
      let roomCode: string | undefined;
      let status: MatchStatus = 'waiting';
      let questionIds: string[] = [];
      let startedAt: Timestamp | null = null;
      let endsAt: Timestamp | null = null;

      // 問題を取得（AI/友達で questionType===listening の場合はクライアントの questionIds 必須）
      const clientQuestionIds = data.questionIds;
      if (questionType === 'listening') {
        if (!Array.isArray(clientQuestionIds) || clientQuestionIds.length !== finalQuestionCount) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Listening matches require client to send questionIds (length ${finalQuestionCount})`
          );
        }
        questionIds = clientQuestionIds;
        console.log('Using client-provided listening questionIds:', questionIds.length);
      } else if (mode === 'ai' && Array.isArray(clientQuestionIds) && clientQuestionIds.length === finalQuestionCount) {
        questionIds = clientQuestionIds;
        console.log('Using client-provided questionIds (in-app data):', questionIds.length);
      } else {
        console.log('Getting questions...', toeicLevel != null ? { toeicLevel } : {});
        questionIds = await getRandomQuestions(lang, 'toeic', finalQuestionCount, toeicLevel);
        console.log('Got questionIds:', questionIds);
      }

      if (mode === 'ai') {
        // AI対戦は即座に開始
        status = 'playing';
        const now = Timestamp.now();
        startedAt = now;
        // 1問20秒 × 問題数
        endsAt = Timestamp.fromMillis(
          now.toMillis() + 20 * 1000 * finalQuestionCount
        );
      } else {
        // 友達対戦はルームコードを生成
        roomCode = generateRoomCode();
        // 既存のルームコードと重複チェック（簡易版）
        const existing = await db
          .collection('matches')
          .where('roomCode', '==', roomCode)
          .where('status', '==', 'waiting')
          .limit(1)
          .get();
        if (!existing.empty) {
          roomCode = generateRoomCode(); // 再生成
        }
      }

      const matchRef = db.collection('matches').doc();
      const matchData: any = {
        mode,
        status,
        lang,
        questionType: questionType || 'choice',
        ...(toeicLevel != null && { level: toeicLevel }),
        players: {
          A: uid,
          B: mode === 'ai' ? 'ai' : '',
        },
        questionIds,
        startedAt,
        endsAt,
        ...(startedAt && { currentQuestionStartedAt: startedAt }),
        createdAt: Timestamp.now(),
        answers: {},
        scores: { [uid]: 0 },
        winnerUid: null,
        currentQuestionIndex: 0,
      };
      // 4択・リスニングのみライフ制（ディクテーションはスコア制のまま）
      if (questionType !== 'dictation') {
        matchData.lives = { [uid]: 3 };
        if (mode === 'ai') matchData.lives['ai'] = 3;
      }

      // roomCodeは友達対戦の場合のみ設定（undefinedを設定しない）
      if (roomCode) {
        matchData.roomCode = roomCode;
      }

      console.log('Creating match document...');
      await matchRef.set(matchData);
      console.log('Match created:', matchRef.id);

      return {
        matchId: matchRef.id,
        roomCode,
      };
    } catch (error: any) {
      console.error('createMatch error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        'internal',
        `Failed to create match: ${error.message || 'Unknown error'}`
      );
    }
  }
);

// 2. 友達対戦に参加
export const joinFriendMatch = functions.https.onCall(
  async (data: JoinFriendMatchRequest, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { roomCode } = data;
    const uid = context.auth.uid;

    if (!roomCode || roomCode.length !== 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid room code'
      );
    }

    try {
      // ルームコードでマッチを検索
      const matchesSnapshot = await db
        .collection('matches')
        .where('roomCode', '==', roomCode)
        .where('status', '==', 'waiting')
        .limit(1)
        .get();

      if (matchesSnapshot.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'Room not found'
        );
      }

      const matchDoc = matchesSnapshot.docs[0];
      const matchData = matchDoc.data();

      // 既に参加しているかチェック
      if (matchData.players.A === uid || matchData.players.B === uid) {
        return { matchId: matchDoc.id };
      }

      // 既に2人いるかチェック
      if (matchData.players.B && matchData.players.B !== '') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This room is already full'
        );
      }

      // 参加処理（両者が「準備完了」を押すまでゲーム開始しない）
      const updatePayload: any = {
        'players.B': uid,
        status: 'matched',
        readyA: false,
        readyB: false,
      };
      await matchDoc.ref.update(updatePayload);

      return { matchId: matchDoc.id };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error('joinFriendMatch error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to join match'
      );
    }
  }
);

// 正解時の残り時間別倍率（0秒→1.0、5秒→1.2、10秒→1.3、15秒→1.4、20秒→1.5）。不正解は一律0点。
function timeBonusMultiplier(remainingSeconds: number): number {
  const t = Math.max(0, Math.min(20, remainingSeconds));
  if (t <= 5) return 1.0 + 0.04 * t;       // 0→1.0, 5→1.2
  if (t <= 10) return 1.2 + 0.02 * (t - 5);  // 5→1.2, 10→1.3
  if (t <= 15) return 1.3 + 0.02 * (t - 10); // 10→1.3, 15→1.4
  return 1.4 + 0.02 * (t - 15);           // 15→1.4, 20→1.5
}

// 正解・不正解どちらでも結果表示用に1秒クールタイム
const ANSWER_COOLDOWN_MS = 1000;
const answerCooldown = () => new Promise<void>(r => setTimeout(r, ANSWER_COOLDOWN_MS));

// 3. 回答を提出
export const submitAnswer = functions.https.onCall(
  async (data: SubmitAnswerRequest, context: functions.https.CallableContext) => {
    // 最初にログを出力（エラーが発生する前に）
    console.log('[submitAnswer] Function called');
    
    if (!context.auth) {
      console.error('[submitAnswer] No auth context');
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { matchId, qIndex, choiceIndex, textAnswer, timeRemaining, correctChoiceIndex: clientCorrectChoiceIndex, isTimeout: clientIsTimeout } = data;
    const uid = context.auth.uid;

    // パラメータの型と値を確認（デバッグ用）
    console.log('[submitAnswer] Received params:', JSON.stringify({ matchId, qIndex, choiceIndex, textAnswer }));

    if (qIndex < 0 || typeof qIndex !== 'number') {
      console.error('[submitAnswer] Invalid qIndex:', qIndex);
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid parameter: qIndex'
      );
    }

    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchDoc = await matchRef.get();

      if (!matchDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Match not found'
        );
      }

      const matchData = matchDoc.data()!;

      // 参加者チェック
      if (
        matchData.players.A !== uid &&
        matchData.players.B !== uid &&
        matchData.players.B !== 'ai'
      ) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You are not in this match'
        );
      }

      // ステータスチェック
      if (matchData.status !== 'playing') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Match is not in progress'
        );
      }

      // 既に回答済みかチェック
      if (
        matchData.answers[uid] &&
        matchData.answers[uid][qIndex] !== undefined
      ) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Already answered'
        );
      }

      const questionIds = matchData.questionIds || [];
      if (qIndex >= questionIds.length) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid question number'
        );
      }

      // overall のときは現在インデックスから問題種別を決定
      const choiceCount = matchData.choiceCount ?? 10;
      const listeningCount = matchData.listeningCount ?? 10;
      const effectiveQuestionType =
        matchData.questionType === 'overall'
          ? (qIndex < choiceCount ? 'choice' : qIndex < choiceCount + listeningCount ? 'listening' : 'dictation')
          : matchData.questionType;

      // 問題を取得して正誤判定（local-* / listening-* はアプリ内問題のため Firestore に存在しない）
      const questionId = questionIds[qIndex];
      console.log('Getting question:', questionId, 'effectiveType:', effectiveQuestionType);
      const isLocalQuestion = typeof questionId === 'string' && questionId.startsWith('local-');
      const isListeningQuestion = typeof questionId === 'string' && questionId.startsWith('listening-');
      let questionData: admin.firestore.DocumentData;

      if (isLocalQuestion) {
        if (effectiveQuestionType !== 'choice') {
          throw new functions.https.HttpsError('invalid-argument', 'Local questions are only supported for choice type');
        }
        if (typeof clientCorrectChoiceIndex !== 'number' || clientCorrectChoiceIndex < 0 || clientCorrectChoiceIndex > 3) {
          throw new functions.https.HttpsError('invalid-argument', 'correctChoiceIndex required for local questions');
        }
        questionData = { answerIndex: clientCorrectChoiceIndex };
      } else if (isListeningQuestion) {
        if (effectiveQuestionType !== 'listening') {
          throw new functions.https.HttpsError('invalid-argument', 'Listening question IDs are only supported for listening type');
        }
        if (typeof clientCorrectChoiceIndex !== 'number' || clientCorrectChoiceIndex < 0 || clientCorrectChoiceIndex > 3) {
          throw new functions.https.HttpsError('invalid-argument', 'correctChoiceIndex required for listening questions');
        }
        questionData = { answerIndex: clientCorrectChoiceIndex };
      } else {
        const questionDoc = await db.collection('questions').doc(questionId).get();
        if (!questionDoc.exists) {
          console.error('Question not found:', questionId);
          throw new functions.https.HttpsError('not-found', 'Question not found');
        }
        questionData = questionDoc.data()!;
      }

      const matchQuestionType = effectiveQuestionType || 'choice';
      
      // 問題タイプに応じて採点
      let isCorrect = false;
      let isTimeout = false;
      let accuracy: number | undefined = undefined;
      let speedFactor: number | undefined = undefined;
      let finalScore: number | undefined = undefined;
      
      if (matchQuestionType === 'dictation') {
        // ディクテーションの場合
        if (!textAnswer) {
          // タイムアウトまたは未回答
          isTimeout = true;
          isCorrect = false;
          accuracy = 0;
          speedFactor = 0;
          finalScore = 0;
        } else {
          // 正解の単語を取得（choices配列からanswerIndexで指定されたもの）
          const correctWord = questionData.choices[questionData.answerIndex].toLowerCase().trim();
          const userAnswer = textAnswer.toLowerCase().trim();
          const correctWordWithoutSpaces = correctWord.replace(/\s/g, '');
          const userAnswerWithoutSpaces = userAnswer.replace(/\s/g, '');
          isCorrect = correctWordWithoutSpaces === userAnswerWithoutSpaces;
          const remainingTime = timeRemaining !== undefined ? Math.max(0, timeRemaining) : 0;
          // 不正解は0点。正解は 1 × 残り時間倍率（20秒→1.5, 15→1.4, 10→1.3, 5→1.2, 0→1.0）
          finalScore = isCorrect ? timeBonusMultiplier(remainingTime) : 0;
          let matchedChars = 0;
          const maxLength = Math.max(correctWordWithoutSpaces.length, userAnswerWithoutSpaces.length);
          for (let i = 0; i < maxLength; i++) {
            if (i < correctWordWithoutSpaces.length && i < userAnswerWithoutSpaces.length && correctWordWithoutSpaces[i] === userAnswerWithoutSpaces[i]) matchedChars++;
          }
          accuracy = maxLength > 0 ? matchedChars / maxLength : 0;
          speedFactor = Math.min(1.0, remainingTime / 20);
          console.log('[submitAnswer] Dictation scoring:', JSON.stringify({
            correctWord,
            userAnswer,
            isCorrect,
            timeRemaining: remainingTime,
            finalScore
          }));
        }
      } else {
        // 4択問題の場合
        if (choiceIndex === undefined || choiceIndex === null) {
          isTimeout = true;
          isCorrect = false;
        } else {
          // choiceIndexが999の場合はタイムアウト。クライアントが isTimeout: true を送っていればそれに従う（不戦敗カウントを確実に立てる）
          const choiceIndexNum = typeof choiceIndex === 'string' ? parseInt(choiceIndex, 10) : choiceIndex;
          isTimeout = clientIsTimeout === true || choiceIndexNum === 999 || choiceIndexNum === -1;
          
          if (!isTimeout) {
            if (choiceIndexNum < 0 || choiceIndexNum > 3) {
              throw new functions.https.HttpsError(
                'invalid-argument',
                `Invalid parameter: choiceIndex=${choiceIndex}`
              );
            }
            isCorrect = questionData.answerIndex === choiceIndexNum;
          }
        }
      }
      
      console.log('[submitAnswer] Answer check:', JSON.stringify({ 
        questionType: matchQuestionType,
        correct: matchQuestionType === 'dictation' ? questionData.choices[questionData.answerIndex] : questionData.answerIndex, 
        user: matchQuestionType === 'dictation' ? textAnswer : choiceIndex, 
        isCorrect, 
        isTimeout,
        qIndex 
      }));

      // 回答を保存
      const answeredAt = Timestamp.now();
      const answerData: any = {
        answeredAt,
        isCorrect,
      };
      
      // 問題タイプに応じて回答データを設定
      if (matchQuestionType === 'dictation') {
        answerData.textAnswer = textAnswer || null;
        // ディクテーションの場合、精度スコアと時間ボーナスを設定
        if (accuracy !== undefined) answerData.accuracy = accuracy;
        if (speedFactor !== undefined) answerData.speedFactor = speedFactor;
        if (finalScore !== undefined) answerData.finalScore = finalScore;
      } else {
        const choiceIndexNum = typeof choiceIndex === 'string' ? parseInt(choiceIndex, 10) : choiceIndex;
        answerData.choiceIndex = isTimeout ? null : choiceIndexNum;
      }

      // スコアを計算（全問題タイプ共通：不正解=0点、正解=1×残り時間倍率 20秒→1.5, 15→1.4, 10→1.3, 5→1.2, 0→1.0）
      const currentScore = matchData.scores[uid] || 0;
      let questionScore: number;

      if (matchQuestionType === 'dictation') {
        questionScore = finalScore !== undefined ? finalScore : 0;
      } else {
        const remainingTime = (matchQuestionType === 'choice' || matchQuestionType === 'listening') && timeRemaining !== undefined
          ? Math.max(0, timeRemaining)
          : 0;
        questionScore = isCorrect ? timeBonusMultiplier(remainingTime) : 0;
      }
      
      const newScore = currentScore + questionScore;

      const updateData: any = {
        [`answers.${uid}.${qIndex}`]: answerData,
        [`scores.${uid}`]: newScore,
      };

      // 不戦敗用：4択・リスニングのみ。連続2回未回答で不戦敗、1回でも通常回答でリセット。ディクテーションは触らない
      const playerA = matchData.players.A;
      const playerB = matchData.players.B;
      const otherUid = playerA === uid ? playerB : playerA;
      let forfeitByConsecutive = false;
      if (playerB !== 'ai' && (matchQuestionType === 'choice' || matchQuestionType === 'listening')) {
        // 未初期化（旧マッチ等）の場合はここでフルオブジェクトを書く
        const existing = matchData.consecutiveUnanswered as Record<string, number> | undefined;
        const consecutive: Record<string, number> = existing
          ? { [playerA]: existing[playerA] ?? 0, [playerB]: existing[playerB] ?? 0 }
          : { [playerA]: 0, [playerB]: 0 };
        if (isTimeout) {
          const next = (consecutive[uid] ?? 0) + 1;
          if (next >= 2) {
            updateData.status = 'finished';
            updateData.winnerUid = otherUid;
            updateData.forfeit = true;
            updateData.finishReason = 'forfeit_consecutive';
            forfeitByConsecutive = true;
          } else {
            updateData[`consecutiveUnanswered.${uid}`] = next;
            if (!existing) {
              updateData[`consecutiveUnanswered.${otherUid}`] = consecutive[otherUid];
            }
          }
        } else {
          updateData[`consecutiveUnanswered.${uid}`] = 0;
          if (!existing) {
            updateData[`consecutiveUnanswered.${otherUid}`] = consecutive[otherUid];
          }
        }
      }

      // AI対戦の場合、AIも自動回答
      if (matchData.players.B === 'ai' && matchData.players.A === uid) {
        console.log('AI対戦: AIも自動回答');
        const aiAnsweredAt = Timestamp.now();
        let aiIsCorrect = false;
        let aiQuestionScore = 0;
        const aiAnswerData: any = {
          answeredAt: aiAnsweredAt,
          isCorrect: false,
        };
        
        if (matchQuestionType === 'dictation') {
          // ディクテーション：不正解0点、正解は1×残り時間倍率
          const correctWord = questionData.choices[questionData.answerIndex];
          const aiAccuracy = Math.random() < 0.7 ? 0.9 + Math.random() * 0.1 : Math.random() * 0.8;
          aiIsCorrect = aiAccuracy >= 0.9;
          aiAnswerData.textAnswer = aiIsCorrect ? correctWord : 'wrong';
          aiAnswerData.isCorrect = aiIsCorrect;
          aiAnswerData.accuracy = aiAccuracy;
          const aiRemaining = Math.random() * 21; // 0〜20秒のランダム
          aiAnswerData.speedFactor = Math.min(1.0, aiRemaining / 20);
          aiAnswerData.finalScore = aiIsCorrect ? timeBonusMultiplier(aiRemaining) : 0;
          aiQuestionScore = aiAnswerData.finalScore;
        } else {
          // 4択・リスニング：不正解0点、正解は1×残り時間倍率
          const aiChoiceIndex = Math.random() < 0.7 
            ? questionData.answerIndex 
            : Math.floor(Math.random() * 4);
          aiIsCorrect = questionData.answerIndex === aiChoiceIndex;
          aiAnswerData.choiceIndex = aiChoiceIndex;
          aiAnswerData.isCorrect = aiIsCorrect;
          const aiRemaining = Math.random() * 21; // 0〜20秒のランダム
          aiQuestionScore = aiIsCorrect ? timeBonusMultiplier(aiRemaining) : 0;
        }
        
        updateData[`answers.ai.${qIndex}`] = aiAnswerData;
        // AIのスコアを計算
        const currentAIScore = (matchData.scores && matchData.scores.ai) || 0;
        updateData['scores.ai'] = currentAIScore + aiQuestionScore;
      }

      console.log('Updating match with:', Object.keys(updateData));
      await matchRef.update(updateData);
      console.log('Match updated successfully');

      if (forfeitByConsecutive) {
        await answerCooldown();
        const finalizedData = (await matchRef.get()).data()!;
        await finalizeMatchInternal(matchRef, finalizedData);
        console.log('[submitAnswer] Forfeit by 2 consecutive timeouts', { matchId, winnerUid: otherUid, uid });
        return {
          isCorrect,
          scores: finalizedData.scores,
          lives: finalizedData.lives,
          forfeit: true,
          ...(matchQuestionType === 'choice' && { correctChoiceIndex: questionData.answerIndex }),
        };
      }

      const updatedMatchDoc = await matchRef.get();
      const updatedMatchData = updatedMatchDoc.data()!;

      // 両者の回答が揃ったか（AIは即揃う）
      const userAnswers = updatedMatchData.answers[uid] || {};
      const otherAnswers = updatedMatchData.answers[otherUid] || {};
      const bothAnswered =
        userAnswers[qIndex] !== undefined && otherAnswers[qIndex] !== undefined;

      if (!bothAnswered) {
        // 相手の回答待ち。不戦敗は「連続2回未回答」のみ（25秒単発での即不戦勝は廃止）
        return {
          isCorrect,
          scores: updatedMatchData.scores,
          lives: updatedMatchData.lives,
          ...(matchQuestionType === 'choice' && { correctChoiceIndex: questionData.answerIndex }),
        };
      }

      // 両者回答済み: ここで取得した最新データでライフ計算（AI・ランク共通）。overall は 4択と同じライフ制
      // ※4択・リスニングは早押しではない：両者が回答し終えてから正誤でライフ/得点を付与する「点を稼ぐ」方式。
      const questionTypeForFlow = updatedMatchData.questionType || 'choice';
      const isDictationFlow = questionTypeForFlow === 'dictation';
      const answersA = updatedMatchData.answers?.[playerA] || {};
      const answersB = updatedMatchData.answers?.[playerB] || {};
      const totalQuestions = updatedMatchData.questionIds?.length ?? 10;

      // GrandMaster(overall): 4択→リスニング→ディクテーションの順でセグメント進行・ phase 勝者を記録。総合勝者のみレート反映
      if (questionTypeForFlow === 'overall') {
        const choiceCount = updatedMatchData.choiceCount ?? 10;
        const listeningCount = updatedMatchData.listeningCount ?? 10;

        if (qIndex < choiceCount) {
          const correctA = answersA[qIndex]?.isCorrect ?? false;
          const correctB = answersB[qIndex]?.isCorrect ?? false;
          const existing = (updatedMatchData.lives || {}) as { [k: string]: number };
          const lives: { [k: string]: number } = {
            [playerA]: typeof existing[playerA] === 'number' ? existing[playerA] : 3,
            [playerB]: typeof existing[playerB] === 'number' ? existing[playerB] : 3,
          };
          if (correctA && !correctB) lives[playerB] = Math.max(0, lives[playerB] - 1);
          else if (!correctA && correctB) lives[playerA] = Math.max(0, lives[playerA] - 1);
          const lifeUpdate = { lives };

          if (lives[playerA] <= 0 || lives[playerB] <= 0) {
            const phaseChoiceWinnerUid = lives[playerA] > 0 ? playerA : playerB;
            await answerCooldown();
            const livesForListening = { [playerA]: 3, [playerB]: 3 };
            await matchRef.update({ lives: livesForListening, phaseChoiceWinnerUid, currentQuestionIndex: choiceCount, currentQuestionStartedAt: Timestamp.now() });
            return { isCorrect, scores: updatedMatchData.scores, lives: livesForListening, correctChoiceIndex: questionData.answerIndex };
          }
          if (qIndex === choiceCount - 1) {
            const phaseChoiceWinnerUid = lives[playerA] > lives[playerB] ? playerA : lives[playerB] > lives[playerA] ? playerB : null;
            await answerCooldown();
            const livesForListening = { [playerA]: 3, [playerB]: 3 };
            await matchRef.update({ lives: livesForListening, phaseChoiceWinnerUid, currentQuestionIndex: choiceCount, currentQuestionStartedAt: Timestamp.now() });
            return { isCorrect, scores: updatedMatchData.scores, lives: livesForListening, correctChoiceIndex: questionData.answerIndex };
          }
          await answerCooldown();
          await matchRef.update({ ...lifeUpdate, currentQuestionIndex: qIndex + 1, currentQuestionStartedAt: Timestamp.now() });
          return { isCorrect, scores: updatedMatchData.scores, lives, correctChoiceIndex: questionData.answerIndex };
        }

        if (qIndex < choiceCount + listeningCount) {
          const correctA = answersA[qIndex]?.isCorrect ?? false;
          const correctB = answersB[qIndex]?.isCorrect ?? false;
          const existing = (updatedMatchData.lives || {}) as { [k: string]: number };
          const lives: { [k: string]: number } = {
            [playerA]: typeof existing[playerA] === 'number' ? existing[playerA] : 3,
            [playerB]: typeof existing[playerB] === 'number' ? existing[playerB] : 3,
          };
          if (correctA && !correctB) lives[playerB] = Math.max(0, lives[playerB] - 1);
          else if (!correctA && correctB) lives[playerA] = Math.max(0, lives[playerA] - 1);
          const lifeUpdate = { lives };

          if (lives[playerA] <= 0 || lives[playerB] <= 0) {
            const phaseListeningWinnerUid = lives[playerA] > 0 ? playerA : playerB;
            await answerCooldown();
            await matchRef.update({ ...lifeUpdate, phaseListeningWinnerUid, currentQuestionIndex: choiceCount + listeningCount, currentQuestionStartedAt: Timestamp.now() });
            return { isCorrect, scores: updatedMatchData.scores, lives };
          }
          if (qIndex === choiceCount + listeningCount - 1) {
            const phaseListeningWinnerUid = lives[playerA] > lives[playerB] ? playerA : lives[playerB] > lives[playerA] ? playerB : null;
            await answerCooldown();
            await matchRef.update({ ...lifeUpdate, phaseListeningWinnerUid, currentQuestionIndex: choiceCount + listeningCount, currentQuestionStartedAt: Timestamp.now() });
            return { isCorrect, scores: updatedMatchData.scores, lives };
          }
          await answerCooldown();
          await matchRef.update({ ...lifeUpdate, currentQuestionIndex: qIndex + 1, currentQuestionStartedAt: Timestamp.now() });
          return { isCorrect, scores: updatedMatchData.scores, lives };
        }

        if (qIndex === totalQuestions - 1) {
          let sumA = 0, sumB = 0;
          const dictStart = choiceCount + listeningCount;
          for (let i = dictStart; i < totalQuestions; i++) {
            sumA += answersA[i]?.finalScore ?? 0;
            sumB += answersB[i]?.finalScore ?? 0;
          }
          const phaseDictationWinnerUid = sumA > sumB ? playerA : sumB > sumA ? playerB : null;
          const phChoice = updatedMatchData.phaseChoiceWinnerUid;
          const phListen = updatedMatchData.phaseListeningWinnerUid;
          const winsA = (phChoice === playerA ? 1 : 0) + (phListen === playerA ? 1 : 0) + (phaseDictationWinnerUid === playerA ? 1 : 0);
          const winsB = (phChoice === playerB ? 1 : 0) + (phListen === playerB ? 1 : 0) + (phaseDictationWinnerUid === playerB ? 1 : 0);
          let winnerUid: string | null = null;
          if (winsA > winsB) winnerUid = playerA;
          else if (winsB > winsA) winnerUid = playerB;
          else {
            // セクション勝ち数が同数の場合は積み上げ得点で決定
            const scoreA = updatedMatchData.scores?.[playerA] ?? 0;
            const scoreB = updatedMatchData.scores?.[playerB] ?? 0;
            if (scoreA > scoreB) winnerUid = playerA;
            else if (scoreB > scoreA) winnerUid = playerB;
          }
          await answerCooldown();
          await matchRef.update({
            phaseDictationWinnerUid,
            winnerUid,
            status: 'finished',
            finishReason: winnerUid == null ? 'draw' : 'score',
          });
          const finalizedData = (await matchRef.get()).data()!;
          await finalizeMatchInternal(matchRef, finalizedData);
          return { isCorrect, scores: finalizedData.scores, lives: undefined };
        }
        await answerCooldown();
        await matchRef.update({ currentQuestionIndex: qIndex + 1, currentQuestionStartedAt: Timestamp.now() });
        return { isCorrect, scores: updatedMatchData.scores, lives: updatedMatchData.lives };
      }

      if (isDictationFlow) {
        const isLast = qIndex >= totalQuestions - 1;
        if (isLast) {
          await answerCooldown();
          const finalizedData = (await matchRef.get()).data()!;
          await finalizeMatchInternal(matchRef, finalizedData);
          return { isCorrect, scores: finalizedData.scores, lives: undefined };
        }
        await answerCooldown();
        const nextStarted = Timestamp.now();
        await matchRef.update({ currentQuestionIndex: qIndex + 1, currentQuestionStartedAt: nextStarted });
        return { isCorrect, scores: updatedMatchData.scores, lives: undefined };
      }

      // 4択: ライフ計算（get()直後の updatedMatchData を使用＝確実に両方の回答が見える）
      const correctA = answersA[qIndex]?.isCorrect ?? false;
      const correctB = answersB[qIndex]?.isCorrect ?? false;
      const existing = (updatedMatchData.lives || {}) as { [k: string]: number };
      const lives: { [k: string]: number } = {
        [playerA]: typeof existing[playerA] === 'number' ? existing[playerA] : 3,
        [playerB]: typeof existing[playerB] === 'number' ? existing[playerB] : 3,
      };
      if (correctA && !correctB) lives[playerB] = Math.max(0, lives[playerB] - 1);
      else if (!correctA && correctB) lives[playerA] = Math.max(0, lives[playerA] - 1);

      const lifeUpdate = { lives };
      let winnerUid: string | null = null;

      if (lives[playerA] <= 0 || lives[playerB] <= 0) {
        await answerCooldown();
        winnerUid = lives[playerA] > 0 ? playerA : playerB;
        await matchRef.update({ ...lifeUpdate, status: 'finished', winnerUid, finishReason: 'lives' });
        const finalizedData = (await matchRef.get()).data()!;
        await finalizeMatchInternal(matchRef, finalizedData);
        return {
          isCorrect,
          scores: updatedMatchData.scores,
          lives,
          correctChoiceIndex: questionData.answerIndex,
        };
      }
      const isLastQuestion = qIndex >= totalQuestions - 1;
      if (isLastQuestion) {
        await answerCooldown();
        if (lives[playerA] > lives[playerB]) winnerUid = playerA;
        else if (lives[playerB] > lives[playerA]) winnerUid = playerB;
        else {
          // ライフ同数の場合は積み上げ得点で決定
          const scoreA = updatedMatchData.scores?.[playerA] ?? 0;
          const scoreB = updatedMatchData.scores?.[playerB] ?? 0;
          if (scoreA > scoreB) winnerUid = playerA;
          else if (scoreB > scoreA) winnerUid = playerB;
        }
        await matchRef.update({ ...lifeUpdate, status: 'finished', winnerUid, finishReason: winnerUid == null ? 'draw' : 'score' });
        const finalizedData = (await matchRef.get()).data()!;
        await finalizeMatchInternal(matchRef, finalizedData);
        return {
          isCorrect,
          scores: updatedMatchData.scores,
          lives,
          correctChoiceIndex: questionData.answerIndex,
        };
      }
      await answerCooldown();
      const nextStarted = Timestamp.now();
      await matchRef.update({ ...lifeUpdate, currentQuestionIndex: qIndex + 1, currentQuestionStartedAt: nextStarted });
      return {
        isCorrect,
        scores: updatedMatchData.scores,
        lives,
        correctChoiceIndex: questionData.answerIndex,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error('submitAnswer error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
      throw new functions.https.HttpsError(
        'internal',
        `Failed to submit answer: ${error.message || 'Unknown error'}`
      );
    }
  }
);

// 3b. マッチ用問題取得（正解 answerIndex を返さずチート防止）
interface GetQuestionForMatchRequest {
  matchId: string;
  questionId: string;
}
export const getQuestionForMatch = functions.https.onCall(
  async (data: GetQuestionForMatchRequest, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const { matchId, questionId } = data;
    if (!matchId || !questionId) {
      throw new functions.https.HttpsError('invalid-argument', 'matchId and questionId are required');
    }
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Match not found');
    }
    const matchData = matchDoc.data()!;
    const uid = context.auth.uid;
    if (matchData.players.A !== uid && matchData.players.B !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Only participants can access this');
    }
    const questionDoc = await db.collection('questions').doc(questionId).get();
    if (!questionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Question not found');
    }
    const q = questionDoc.data()!;
    const { answerIndex, ...rest } = q;
    return rest;
  }
);

/** 今日の日付（UTC）YYYY-MM-DD */
function getTodayUtcDateString(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** マッチ終了時に「今日の学習」を記録（対戦回数・勝敗）。二重カウント防止のため match.todayStatsRecordedFor に uid を追加 */
export const recordMatchComplete = functions.https.onCall(
  async (data: { matchId: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const { matchId } = data;
    if (!matchId) {
      throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
    }
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Match not found');
    }
    const matchData = matchDoc.data()!;
    if (matchData.status !== 'finished') {
      return { recorded: false, reason: 'match_not_finished' };
    }
    const recorded = (matchData.todayStatsRecordedFor as string[] | undefined) || [];
    if (recorded.includes(uid)) {
      return { recorded: false, reason: 'already_recorded' };
    }
    const playerA = matchData.players.A;
    const playerB = matchData.players.B;
    if (uid !== playerA && uid !== playerB) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant');
    }
    const winnerUid = matchData.winnerUid as string | null;
    const isWinner = winnerUid === uid;
    const isDraw = winnerUid === null;

    const today = getTodayUtcDateString();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const prev = userDoc.exists ? (userDoc.data()?.statsToday as { date: string; battles: number; wins: number; losses: number; dictationSolved: number } | undefined) : undefined;
    const isNewDay = !prev || prev.date !== today;
    const battles = isNewDay ? 1 : (prev?.battles ?? 0) + 1;
    const wins = isNewDay ? (isWinner ? 1 : 0) : (prev?.wins ?? 0) + (isWinner ? 1 : 0);
    const losses = isNewDay ? (!isWinner && !isDraw ? 1 : 0) : (prev?.losses ?? 0) + (!isWinner && !isDraw ? 1 : 0);
    const dictationSolved = isNewDay ? 0 : (prev?.dictationSolved ?? 0);

    await userRef.set({
      statsToday: { date: today, battles, wins, losses, dictationSolved },
      lastActiveAt: Timestamp.now(),
    }, { merge: true });
    await matchRef.update({
      todayStatsRecordedFor: [...recorded, uid],
    });
    return { recorded: true };
  }
);

/** ディクテーション 1 問正解ごとに「今日の学習」の dictationSolved を +1 */
export const incrementTodayDictation = functions.https.onCall(
  async (_data: unknown, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const today = getTodayUtcDateString();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const prev = userDoc.exists ? (userDoc.data()?.statsToday as { date: string; battles: number; wins: number; losses: number; dictationSolved: number } | undefined) : undefined;
    const isNewDay = !prev || prev.date !== today;
    const dictationSolved = isNewDay ? 1 : (prev?.dictationSolved ?? 0) + 1;
    const battles = isNewDay ? 0 : (prev?.battles ?? 0);
    const wins = isNewDay ? 0 : (prev?.wins ?? 0);
    const losses = isNewDay ? 0 : (prev?.losses ?? 0);

    await userRef.set({
      statsToday: { date: today, battles, wins, losses, dictationSolved },
      lastActiveAt: Timestamp.now(),
    }, { merge: true });
    return { dictationSolved };
  }
);

const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_LENGTH = 6;

/** 携帯ブラウザなど CORS で Firestore 直書きが失敗する場合のため、サーバー側で users を作成する */
export const createUserDocument = functions.https.onCall(
  async (data: { uid: string; displayName: string; country: string; avatarUrl?: string; avatarPath?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    if (context.auth.uid !== data?.uid) {
      throw new functions.https.HttpsError('permission-denied', 'uid must match authenticated user');
    }
    const uid = data.uid;
    const displayName = (data.displayName || '').trim();
    const country = (data.country || 'JP').trim() || 'JP';
    if (!displayName) {
      throw new functions.https.HttpsError('invalid-argument', 'displayName is required');
    }
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const now = Timestamp.now();
    const update: Record<string, unknown> = {
      uid,
      displayName,
      country,
      rating: 1000,
      wins: 0,
      losses: 0,
      lastActiveAt: now,
    };
    if (data.avatarPath) {
      update.avatarPath = data.avatarPath;
      update.avatarUpdatedAt = now;
    } else if (data.avatarUrl) {
      update.avatarUrl = data.avatarUrl;
    }
    if (!userDoc.exists) {
      update.createdAt = now;
    } else {
      const existing = userDoc.data();
      if (existing?.createdAt) update.createdAt = existing.createdAt;
    }
    await userRef.set(update, { merge: true });
    return { ok: true };
  }
);

function generateFriendCode(): string {
  let s = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    s += FRIEND_CODE_CHARS.charAt(Math.floor(Math.random() * FRIEND_CODE_CHARS.length));
  }
  return s;
}

/** 自分のフレンドコードを取得（未発行なら発行） */
export const getOrCreateFriendCode = functions.https.onCall(
  async (_data: unknown, context: functions.https.CallableContext) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
      }
      const uid = context.auth.uid;
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      const data = userDoc.exists ? userDoc.data() : undefined;
      if (data?.friendCode) {
        return { friendCode: data.friendCode };
      }
      const friendCodesRef = db.collection('friendCodes');
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateFriendCode();
        const codeRef = friendCodesRef.doc(code);
        const codeDoc = await codeRef.get();
        if (!codeDoc.exists) {
          await codeRef.set({ uid });
          await userRef.set({ friendCode: code }, { merge: true });
          return { friendCode: code };
        }
      }
      throw new functions.https.HttpsError('internal', 'Failed to generate unique friend code');
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error('[getOrCreateFriendCode] error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new functions.https.HttpsError('internal', `Friend code error: ${msg}`);
    }
  }
);

/** フレンドコードでユーザーを検索（表示用の公開情報のみ返す） */
export const lookupByFriendCode = functions.https.onCall(
  async (data: { code: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const code = (data?.code || '').trim().toUpperCase();
    if (code.length !== FRIEND_CODE_LENGTH) {
      throw new functions.https.HttpsError('invalid-argument', 'Friend code must be 6 characters');
    }
    const codeDoc = await db.collection('friendCodes').doc(code).get();
    if (!codeDoc.exists) {
      return { found: false };
    }
    const targetUid = (codeDoc.data() as { uid: string }).uid;
    if (targetUid === context.auth.uid) {
      return { found: true, isSelf: true };
    }
    const userDoc = await db.collection('users').doc(targetUid).get();
    if (!userDoc.exists) {
      return { found: false };
    }
    const u = userDoc.data()!;
    return {
      found: true,
      uid: targetUid,
      displayName: u.displayName || 'Unknown',
      avatarUrl: u.avatarUrl,
      avatarPath: u.avatarPath,
      rating: u.rating ?? 1000,
      rank: u.rank,
      titles: u.titles,
      wins: u.wins ?? 0,
      losses: u.losses ?? 0,
    };
  }
);

/** フレンドを追加（相互に friends 配列に追加）— 承認後に Functions 内で使用 */
function addFriendMutual(
  db: admin.firestore.Firestore,
  uid: string,
  friendUid: string,
  myFriends: string[],
  theirFriends: string[]
): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const friendRef = db.collection('users').doc(friendUid);
  const newMyFriends = [...myFriends, friendUid];
  const newTheirFriends = [...theirFriends, uid];
  return Promise.all([
    userRef.set({ friends: newMyFriends }, { merge: true }),
    friendRef.set({ friends: newTheirFriends }, { merge: true }),
  ]).then(() => undefined);
}

/** フレンドリクエストを送信（相手の承認待ち） */
export const sendFriendRequest = functions.https.onCall(
  async (data: { toUid: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const fromUid = context.auth.uid;
    const toUid = data?.toUid;
    if (!toUid || typeof toUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'toUid is required');
    }
    if (toUid === fromUid) {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot send request to yourself');
    }
    const requestId = `${fromUid}_${toUid}`;
    const requestRef = db.collection('friendRequests').doc(requestId);
    const [requestDoc, fromDoc, toDoc] = await Promise.all([
      requestRef.get(),
      db.collection('users').doc(fromUid).get(),
      db.collection('users').doc(toUid).get(),
    ]);
    if (!toDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const fromData = fromDoc.exists ? (fromDoc.data() as any) : {};
    const myFriends: string[] = Array.isArray(fromData.friends) ? fromData.friends : [];
    if (myFriends.includes(toUid)) {
      return { sent: false, reason: 'already_friends' };
    }
    if (requestDoc.exists) {
      const status = (requestDoc.data() as any).status;
      if (status === 'pending') {
        return { sent: false, reason: 'already_sent' };
      }
      if (status === 'approved') {
        return { sent: false, reason: 'already_friends' };
      }
    }
    await requestRef.set({
      fromUid,
      toUid,
      status: 'pending',
      createdAt: Timestamp.now(),
    });
    return { sent: true };
  }
);

/** フレンドリクエストを承認（相互にフレンド追加） */
export const approveFriendRequest = functions.https.onCall(
  async (data: { fromUid: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const toUid = context.auth.uid;
    const fromUid = data?.fromUid;
    if (!fromUid || typeof fromUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'fromUid is required');
    }
    const requestId = `${fromUid}_${toUid}`;
    const requestRef = db.collection('friendRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Friend request not found');
    }
    const req = requestDoc.data() as any;
    if (req.toUid !== toUid || req.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Request cannot be approved');
    }
    const [fromDoc, toDoc] = await Promise.all([
      db.collection('users').doc(fromUid).get(),
      db.collection('users').doc(toUid).get(),
    ]);
    const myFriends: string[] = toDoc.exists && Array.isArray((toDoc.data() as any).friends) ? (toDoc.data() as any).friends : [];
    const theirFriends: string[] = fromDoc.exists && Array.isArray((fromDoc.data() as any).friends) ? (fromDoc.data() as any).friends : [];
    if (myFriends.includes(fromUid)) {
      await requestRef.set({ status: 'approved' }, { merge: true });
      return { approved: true };
    }
    await addFriendMutual(db, toUid, fromUid, myFriends, theirFriends);
    await requestRef.set({ status: 'approved' }, { merge: true });
    return { approved: true };
  }
);

/** フレンドリクエストを拒否 */
export const rejectFriendRequest = functions.https.onCall(
  async (data: { fromUid: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const toUid = context.auth.uid;
    const fromUid = data?.fromUid;
    if (!fromUid || typeof fromUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'fromUid is required');
    }
    const requestId = `${fromUid}_${toUid}`;
    const requestRef = db.collection('friendRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Friend request not found');
    }
    const req = requestDoc.data() as any;
    if (req.toUid !== toUid || req.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Request cannot be rejected');
    }
    await requestRef.set({ status: 'rejected' }, { merge: true });
    return { rejected: true };
  }
);

/** フレンドを追加（相互に friends 配列に追加）— 後方互換のため残すがクライアントは sendFriendRequest を使用すること */
export const addFriend = functions.https.onCall(
  async (data: { friendUid: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const friendUid = data?.friendUid;
    if (!friendUid || typeof friendUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'friendUid is required');
    }
    if (friendUid === uid) {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot add yourself');
    }
    const userRef = db.collection('users').doc(uid);
    const friendRef = db.collection('users').doc(friendUid);
    const [userDoc, friendDoc] = await Promise.all([userRef.get(), friendRef.get()]);
    if (!friendDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const myFriends: string[] = (userDoc.exists && Array.isArray((userDoc.data() as any).friends)) ? (userDoc.data() as any).friends : [];
    const theirFriends: string[] = (friendDoc.data() as any).friends && Array.isArray((friendDoc.data() as any).friends) ? (friendDoc.data() as any).friends : [];
    if (myFriends.includes(friendUid)) {
      return { added: false, reason: 'already_friends' };
    }
    const newMyFriends = [...myFriends, friendUid];
    const newTheirFriends = [...theirFriends, uid];
    await userRef.set({ friends: newMyFriends }, { merge: true });
    await friendRef.set({ friends: newTheirFriends }, { merge: true });
    return { added: true };
  }
);

/** フレンドを削除（相互に friends 配列から削除） */
export const removeFriend = functions.https.onCall(
  async (data: { friendUid: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const friendUid = data?.friendUid;
    if (!friendUid || typeof friendUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'friendUid is required');
    }
    if (friendUid === uid) {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot remove yourself');
    }
    const userRef = db.collection('users').doc(uid);
    const friendRef = db.collection('users').doc(friendUid);
    const [userDoc, friendDoc] = await Promise.all([userRef.get(), friendRef.get()]);
    if (!friendDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const myFriends: string[] = (userDoc.exists && Array.isArray((userDoc.data() as any).friends)) ? (userDoc.data() as any).friends : [];
    const theirFriends: string[] = (friendDoc.data() as any).friends && Array.isArray((friendDoc.data() as any).friends) ? (friendDoc.data() as any).friends : [];
    if (!myFriends.includes(friendUid)) {
      return { removed: false, reason: 'not_friends' };
    }
    const newMyFriends = myFriends.filter((id) => id !== friendUid);
    const newTheirFriends = theirFriends.filter((id) => id !== uid);
    await userRef.set({ friends: newMyFriends }, { merge: true });
    await friendRef.set({ friends: newTheirFriends }, { merge: true });
    return { removed: true };
  }
);
function calculateEloRating(
  playerRating: number,
  opponentRating: number,
  isWinner: boolean,
  isDraw: boolean
): number {
  const K = 32; // Kファクター（レート変動の大きさ）
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  
  let actualScore: number;
  if (isDraw) {
    actualScore = 0.5;
  } else if (isWinner) {
    actualScore = 1.0;
  } else {
    actualScore = 0.0;
  }
  
  const newRating = Math.round(playerRating + K * (actualScore - expectedScore));
  return Math.max(0, newRating); // レートは0以上
}

// ユーザーのレートを取得（mode 省略時は overall。後方互換で rating を使用）
async function getUserRating(uid: string, mode: RankedMode = 'overall'): Promise<number> {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    const userData = userDoc.data();
    const def = 1000;
    switch (mode) {
      case 'choice': return userData?.ratingChoice ?? userData?.rating ?? def;
      case 'dictation': return userData?.ratingDictation ?? def;
      case 'listening': return userData?.ratingListening ?? def;
      case 'overall': return userData?.ratingOverall ?? userData?.rating ?? def;
      default: return userData?.rating ?? def;
    }
  } else {
    await userRef.set({
      uid,
      displayName: `User ${uid.slice(0, 8)}`,
      rating: 1000,
      wins: 0,
      losses: 0,
      createdAt: Timestamp.now(),
      lastActiveAt: Timestamp.now(),
    }, { merge: true });
    return 1000;
  }
}

// ユーザーのレートを更新（mode に応じたフィールドを更新）
async function updateUserRating(uid: string, newRating: number, previousRating: number, mode: RankedMode = 'overall'): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const ratingChange = newRating - previousRating;
  const field = mode === 'choice' ? 'ratingChoice' : mode === 'dictation' ? 'ratingDictation' : mode === 'listening' ? 'ratingListening' : 'ratingOverall';
  const update: Record<string, unknown> = { ratingChange };
  if (mode === 'overall') {
    update.rating = newRating; // 後方互換
  }
  update[field] = newRating;
  await userRef.set(update, { merge: true });
}

// ユーザーの勝敗数を更新（mode に応じたフィールドを更新）
async function updateUserStats(uid: string, isWinner: boolean, isDraw: boolean, mode: RankedMode = 'overall'): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    const userData = userDoc.data();
    const updateData: Record<string, unknown> = { lastActiveAt: Timestamp.now() };
    if (mode === 'overall') {
      const currentWins = userData?.wins ?? 0;
      const currentLosses = userData?.losses ?? 0;
      if (!isDraw) {
        if (isWinner) updateData.wins = currentWins + 1;
        else updateData.losses = currentLosses + 1;
      }
    } else {
      const winsKey = mode === 'choice' ? 'winsChoice' : mode === 'dictation' ? 'winsDictation' : 'winsListening';
      const lossesKey = mode === 'choice' ? 'lossesChoice' : mode === 'dictation' ? 'lossesDictation' : 'lossesListening';
      const currentWins = userData?.[winsKey] ?? 0;
      const currentLosses = userData?.[lossesKey] ?? 0;
      if (!isDraw) {
        if (isWinner) updateData[winsKey] = currentWins + 1;
        else updateData[lossesKey] = currentLosses + 1;
      }
    }
    await userRef.set(updateData, { merge: true });
  } else {
    const userData: Record<string, unknown> = {
      uid,
      displayName: `User ${uid.slice(0, 8)}`,
      rating: 1000,
      wins: 0,
      losses: 0,
      createdAt: Timestamp.now(),
      lastActiveAt: Timestamp.now(),
    };
    if (mode === 'overall' && !isDraw) {
      userData.wins = isWinner ? 1 : 0;
      userData.losses = !isWinner ? 1 : 0;
    } else if (mode !== 'overall' && !isDraw) {
      const winsKey = mode === 'choice' ? 'winsChoice' : mode === 'dictation' ? 'winsDictation' : 'winsListening';
      const lossesKey = mode === 'choice' ? 'lossesChoice' : mode === 'dictation' ? 'lossesDictation' : 'lossesListening';
      userData[winsKey] = isWinner ? 1 : 0;
      userData[lossesKey] = !isWinner ? 1 : 0;
    }
    await userRef.set(userData, { merge: true });
  }
}

// 4. マッチを終了（内部関数）
async function finalizeMatchInternal(
  matchRef: admin.firestore.DocumentReference,
  matchData: admin.firestore.DocumentData
): Promise<void> {
  const playerA = matchData.players.A;
  const playerB = matchData.players.B;
  const mode = matchData.mode;
  let winnerUid: string | null = matchData.winnerUid ?? null;

  // 既にwinnerUidが設定されていればそのまま（submitAnswerで設定済み）
  if (winnerUid === undefined || winnerUid === null) {
    const lives = matchData.lives as { [k: string]: number } | undefined;
    if (lives && typeof lives[playerA] === 'number' && typeof lives[playerB] === 'number') {
      if (lives[playerA] > lives[playerB]) winnerUid = playerA;
      else if (lives[playerB] > lives[playerA]) winnerUid = playerB;
      else {
        // ライフ同数の場合は積み上げ得点で決定
        const scores = matchData.scores || {};
        const scoreA = scores[playerA] || 0;
        const scoreB = scores[playerB] || 0;
        if (scoreA > scoreB) winnerUid = playerA;
        else if (scoreB > scoreA) winnerUid = playerB;
        else winnerUid = null;
      }
    } else {
      const scores = matchData.scores || {};
      if (playerB === 'ai') {
        const scoreA = scores[playerA] || 0;
        const scoreAI = scores['ai'] || 0;
        winnerUid = scoreA > scoreAI ? playerA : null;
      } else {
        const scoreA = scores[playerA] || 0;
        const scoreB = scores[playerB] || 0;
        if (scoreA > scoreB) winnerUid = playerA;
        else if (scoreB > scoreA) winnerUid = playerB;
        else winnerUid = null;
      }
    }
  }

  // 終了確定は1回だけ（トランザクションで既に finished なら上書きしない）
  const finishReason = matchData.finishReason ?? (winnerUid == null ? 'draw' : 'score');
  const finishClaimed = await db.runTransaction(async (t) => {
    const snap = await t.get(matchRef);
    if (!snap.exists) return false;
    const d = snap.data()!;
    if (d.status === 'finished') return false;
    t.update(matchRef, { status: 'finished', winnerUid, finishReason });
    return true;
  });
  if (!finishClaimed) {
    console.log('[finalizeMatchInternal] 既に終了済み、status更新をスキップ（レート処理は ratingProcessed で二重防止のため続行）');
  }

  // ランクマッチの場合、レートと勝敗数を「1回だけ」更新（二重実行防止）
  if (mode === 'ranked' && playerB !== 'ai') {
    const ratingClaimed = await db.runTransaction(async (t) => {
      const snap = await t.get(matchRef);
      if (!snap.exists) return false;
      const d = snap.data()!;
      if (d.ratingProcessed === true) return false;
      t.update(matchRef, { ratingProcessed: true });
      return true;
    });
    if (!ratingClaimed) {
      console.log('[finalizeMatchInternal] レート処理は別処理で完了済み、スキップ');
      return;
    }
    const questionType = matchData.questionType as string | undefined;
    const rankedMode: RankedMode = (questionType === 'dictation' ? 'dictation' : questionType === 'listening' ? 'listening' : questionType === 'overall' ? 'overall' : 'choice') as RankedMode;
    try {
      const ratingA = await getUserRating(playerA, rankedMode);
      const ratingB = await getUserRating(playerB, rankedMode);

      const isDraw = winnerUid === null;
      const isAWinner = winnerUid === playerA;
      const isBWinner = winnerUid === playerB;

      const newRatingA = calculateEloRating(ratingA, ratingB, isAWinner, isDraw);
      const newRatingB = calculateEloRating(ratingB, ratingA, isBWinner, isDraw);

      await updateUserRating(playerA, newRatingA, ratingA, rankedMode);
      await updateUserRating(playerB, newRatingB, ratingB, rankedMode);

      await updateUserStats(playerA, isAWinner, isDraw, rankedMode);
      await updateUserStats(playerB, isBWinner, isDraw, rankedMode);

      console.log('レート・勝敗数更新:', {
        mode: rankedMode,
        playerA: { old: ratingA, new: newRatingA, isWinner: isAWinner },
        playerB: { old: ratingB, new: newRatingB, isWinner: isBWinner },
        winnerUid,
      });

      try {
        const res = await recomputeRanksInternal(rankedMode);
        console.log('ランク再計算完了:', res);
      } catch (rankErr) {
        console.error('ランク再計算エラー:', rankErr);
      }
    } catch (error) {
      console.error('レート更新エラー:', error);
    }
  }
}

// 5. マッチを終了（外部呼び出し用）
export const finalizeMatch = functions.https.onCall(
  async (data: FinalizeMatchRequest, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { matchId } = data;

    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchDoc = await matchRef.get();

      if (!matchDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Match not found'
        );
      }

      const matchData = matchDoc.data()!;

      if (matchData.status === 'finished') {
        return {
          winnerUid: matchData.winnerUid,
          scores: matchData.scores,
        };
      }

      await finalizeMatchInternal(matchRef, matchData);
      const updatedDoc = await matchRef.get();
      const updatedData = updatedDoc.data()!;

      return {
        winnerUid: updatedData.winnerUid,
        scores: updatedData.scores,
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error('finalizeMatch error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to finalize match'
      );
    }
  }
);

// 5b. ランクマッチ不戦勝の申告（相手が回答期限+20秒応答なし）
export const claimForfeit = functions.https.onCall(
  async (data: ClaimForfeitRequest, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }
    const uid = context.auth.uid;
    const { matchId } = data;
    if (!matchId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'matchId is required'
      );
    }
    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchDoc = await matchRef.get();
      if (!matchDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found');
      }
      const matchData = matchDoc.data()!;
      if (matchData.status !== 'playing') {
        return { forfeit: false, reason: 'match_not_playing' };
      }
      if (matchData.mode !== 'ranked' || matchData.players.B === 'ai') {
        throw new functions.https.HttpsError('failed-precondition', 'Only ranked matches can claim forfeit');
      }
      const playerA = matchData.players.A;
      const playerB = matchData.players.B;
      if (uid !== playerA && uid !== playerB) {
        throw new functions.https.HttpsError('permission-denied', 'Only participants can claim forfeit');
      }
      const opponentUid = uid === playerA ? playerB : playerA;
      const qIndex = matchData.currentQuestionIndex ?? 0;
      const myAnswers = matchData.answers?.[uid] ?? {};
      const oppAnswers = matchData.answers?.[opponentUid] ?? {};
      if (myAnswers[qIndex] === undefined) {
        return { forfeit: false, reason: 'caller_not_answered' };
      }
      if (oppAnswers[qIndex] !== undefined) {
        return { forfeit: false, reason: 'opponent_answered' };
      }
      const startedAtTs = matchData.startedAt?.toMillis?.() ?? 0;
      const currentQuestionStartedAtTs = matchData.currentQuestionStartedAt?.toMillis?.();
      const questionStartMs = qIndex === 0 ? startedAtTs : (currentQuestionStartedAtTs ?? startedAtTs + qIndex * 20 * 1000);
      const nowMs = Date.now();
      const forfeitThresholdMs = (20 + 5) * 1000;
      if (nowMs < questionStartMs + forfeitThresholdMs) {
        return { forfeit: false, reason: 'threshold_not_reached' };
      }
      const answeredAt = Timestamp.now();
      const choiceCount = matchData.choiceCount ?? 10;
      const listeningCount = matchData.listeningCount ?? 10;
      const effectiveType = matchData.questionType === 'overall'
        ? (qIndex < choiceCount ? 'choice' : qIndex < choiceCount + listeningCount ? 'listening' : 'dictation')
        : matchData.questionType;
      const forfeitAnswer: any = {
        answeredAt,
        isCorrect: false,
        ...(effectiveType === 'dictation'
          ? { textAnswer: null, accuracy: 0, speedFactor: 0, finalScore: 0 }
          : { choiceIndex: null }),
      };
      await matchRef.update({
        status: 'finished',
        winnerUid: uid,
        forfeit: true,
        finishReason: 'forfeit_consecutive',
        [`answers.${opponentUid}.${qIndex}`]: forfeitAnswer,
      });
      const finalizedData = (await matchRef.get()).data()!;
      await finalizeMatchInternal(matchRef, finalizedData);
      console.log('[claimForfeit] Ranked forfeit claimed', { matchId, winnerUid: uid, qIndex });
      return { forfeit: true, winnerUid: uid };
    } catch (e) {
      if (e instanceof functions.https.HttpsError) throw e;
      console.error('claimForfeit error:', e);
      throw new functions.https.HttpsError(
        'internal',
        `Failed to claim forfeit: ${(e as Error).message}`
      );
    }
  }
);

// 6. ランクマッチを検索・作成
export const findRankedMatch = functions.https.onCall(
  async (data, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const uid = context.auth.uid;
    const { lang } = data;
    const questionType = (data.questionType === 'dictation' ? 'dictation' : data.questionType === 'listening' ? 'listening' : data.questionType === 'overall' ? 'overall' : 'choice') as 'choice' | 'dictation' | 'listening' | 'overall';

    try {

        // ユーザーのレートを取得（該当モードのレートでマッチング）
        const userRating = await getUserRating(uid, questionType);
        
        // レート差の許容範囲（±300：テスト用に拡大。本番は200推奨）
        const ratingRange = 300;
        const minRating = userRating - ratingRange;
        const maxRating = userRating + ratingRange;

        // 待機中のランクマッチを検索（同一 questionType のみマッチ。PC/携帯で同時に押したときの二重参加・取りこぼしを防ぐ）
        const waitingMatchesRef = db.collection('matches')
          .where('mode', '==', 'ranked')
          .where('status', '==', 'waiting')
          .where('lang', '==', lang)
          .where('questionType', '==', questionType)
          .limit(20);

        const tryJoinMatch = async (matchDoc: admin.firestore.QueryDocumentSnapshot): Promise<string | null> => {
          const matchData = matchDoc.data();
          const opponentUid = matchData.players?.A;
          if (!opponentUid || opponentUid === uid) return null;
          const opponentRating = await getUserRating(opponentUid, questionType);
          if (opponentRating < minRating || opponentRating > maxRating) return null;

          const updatePayload: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
            status: 'matched',
            'players.B': uid,
            readyA: false,
            readyB: false,
          };
          // startedAt / endsAt / lives は両者が準備完了してから setMatchReady で設定

          return await db.runTransaction(async (t) => {
            const snap = await t.get(matchDoc.ref);
            if (!snap.exists) return null;
            const d = snap.data()!;
            if (d.status !== 'waiting') return null;
            const currentB = d.players?.B;
            if (currentB && currentB !== '') return null; // 他が先に参加済み
            t.update(matchDoc.ref, updatePayload);
            return matchDoc.id;
          });
        };

        let matchedMatchId: string | null = null;
        const waitingMatchesSnapshot = await waitingMatchesRef.get();
        const waitingMatches = waitingMatchesSnapshot.docs.filter(
          (doc) => doc.data().players?.A !== uid
        );

        for (const matchDoc of waitingMatches) {
          matchedMatchId = await tryJoinMatch(matchDoc);
          if (matchedMatchId) {
            const matchData = matchDoc.data();
            console.log('ランクマッチ成功:', { matchId: matchedMatchId, userRating, opponentRating: await getUserRating(matchData.players.A, questionType) });
            break;
          }
        }

        // まだマッチできていなければ一度だけ待って再検索（同時押しで「両方とも新規作成」になるのを防ぐ）
        if (!matchedMatchId) {
          await new Promise((r) => setTimeout(r, 500));
          const snapshot2 = await waitingMatchesRef.get();
          const waitingMatches2 = snapshot2.docs.filter(
            (doc) => doc.data().players?.A !== uid
          );
          for (const matchDoc of waitingMatches2) {
            matchedMatchId = await tryJoinMatch(matchDoc);
            if (matchedMatchId) {
              console.log('ランクマッチ成功(再検索):', { matchId: matchedMatchId, userRating });
              break;
            }
          }
        }

        // マッチングできなかった場合、新しいマッチを作成（リクエストの questionType で出題種別を決定）
        if (!matchedMatchId) {
          const toeicLevel = ratingToToeicLevel(userRating);
          const [minLv, maxLv] = getLevelRange(toeicLevel);
          console.log('ランクマッチ出題難易度:', { userRating, toeicLevel, questionLevelRange: `${minLv}-${maxLv}` });
          let questionIds: string[];
          let choiceCount: number | undefined;
          let dictationCount: number | undefined;
          let listeningCount: number | undefined;
          if (questionType === 'overall') {
            const listeningIds = data.listeningIds;
            if (!Array.isArray(listeningIds) || listeningIds.length !== 10) {
              throw new functions.https.HttpsError(
                'invalid-argument',
                'Ranked overall requires client to send listeningIds (length 10)'
              );
            }
            const choiceIds = await getRandomQuestions(lang, 'toeic', 10, toeicLevel);
            const dictationIds = await getRandomQuestions(lang, 'toeic', 5, toeicLevel);
            // 順序: 4択 → リスニング → ディクテーション
            questionIds = [...choiceIds, ...listeningIds, ...dictationIds];
            choiceCount = 10;
            listeningCount = 10;
            dictationCount = 5;
          } else if (questionType === 'listening') {
            const questionCount = 10;
            const clientIds = data.questionIds;
            if (!Array.isArray(clientIds) || clientIds.length !== questionCount) {
              throw new functions.https.HttpsError(
                'invalid-argument',
                `Ranked listening requires client to send questionIds (length ${questionCount})`
              );
            }
            questionIds = clientIds;
          } else {
            const questionCount = questionType === 'dictation' ? 5 : 10;
            questionIds = await getRandomQuestions(lang, 'toeic', questionCount, toeicLevel);
          }
          const matchRef = db.collection('matches').doc();
          const matchPayload: any = {
            mode: 'ranked',
            status: 'waiting',
            lang,
            questionType,
            level: toeicLevel,
            players: { A: uid, B: '' },
            questionIds,
            startedAt: null,
            endsAt: null,
            createdAt: Timestamp.now(),
            answers: {},
            scores: { [uid]: 0 },
            winnerUid: null,
            currentQuestionIndex: 0,
          };
          if (questionType === 'overall') {
            matchPayload.choiceCount = choiceCount;
            matchPayload.dictationCount = dictationCount;
            matchPayload.listeningCount = listeningCount;
          }
          if (questionType !== 'dictation') matchPayload.lives = { [uid]: 3 };
          await matchRef.set(matchPayload);
          
          matchedMatchId = matchRef.id;
          console.log('ランクマッチ待機中:', { matchId: matchedMatchId, userRating, toeicLevel });
        }

        return {
          matchId: matchedMatchId,
          isWaiting: !matchedMatchId || waitingMatches.length === 0,
        };
      } catch (error: any) {
        console.error('findRankedMatch error:', error);
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }
        throw new functions.https.HttpsError(
          'internal',
          `Failed to find ranked match: ${error.message || 'Unknown error'}`
        );
      }
  }
);

// 両者マッチ後、ゲーム開始前に「準備完了」を押したときに呼ぶ。両方 true になったら status を playing にし、開始時刻・ライフ等を設定
export const setMatchReady = functions.https.onCall(
  async (data, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const matchId = data?.matchId;
    if (typeof matchId !== 'string' || !matchId) {
      throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
    }

    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchSnap = await matchRef.get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found');
      }
      const matchData = matchSnap.data()!;
      if (matchData.status !== 'matched') {
        throw new functions.https.HttpsError('failed-precondition', 'Match is not in matched state');
      }
      const playerA = matchData.players?.A;
      const playerB = matchData.players?.B;
      if (!playerA || !playerB) {
        console.error('setMatchReady: missing player A or B', { matchId, players: matchData.players });
        throw new functions.https.HttpsError('failed-precondition', 'Match has no second player yet');
      }
      if (uid !== playerA && uid !== playerB) {
        throw new functions.https.HttpsError('permission-denied', 'You are not a player in this match');
      }

      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(matchRef);
        if (!snap.exists) return { started: false };
        const d = snap.data()!;
        if (d.status !== 'matched') return { started: false };
        const currentReadyA = d.readyA === true;
        const currentReadyB = d.readyB === true;
        const newReadyA = uid === playerA ? true : currentReadyA;
        const newReadyB = uid === playerB ? true : currentReadyB;
        t.update(matchRef, { readyA: newReadyA, readyB: newReadyB });
        if (newReadyA && newReadyB) {
          // 両者 Ready のときは status とスコア・ライフのみ。gameStartsAt は Begin Battle 押下で startGameCountdown が設定する
          const payload: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
            status: 'playing',
            [`scores.${playerA}`]: 0,
            [`scores.${playerB}`]: 0,
          };
          if (matchData.questionType !== 'dictation') {
            payload['lives'] = { [playerA]: 3, [playerB]: 3 };
          }
          // 不戦敗用：連続未回答カウント（4択〜リスニングで2回連続未回答で不戦敗、1回でも回答でリセット）
          if (playerB !== 'ai') {
            payload['consecutiveUnanswered'] = { [playerA]: 0, [playerB]: 0 };
          }
          t.update(matchRef, payload);
          return { started: true };
        }
        return { started: false };
      });

      return result;
    } catch (err: any) {
      if (err instanceof functions.https.HttpsError) throw err;
      const msg = err?.message ?? String(err);
      console.error('setMatchReady error:', msg);
      console.error('setMatchReady stack:', err?.stack);
      throw new functions.https.HttpsError(
        'internal',
        msg ? `setMatchReady failed: ${msg}` : 'Failed to set match ready'
      );
    }
  }
);

/** Begin Battle 押下時に呼ぶ。自分の beginBattle フラグを立て、両方 true になったら gameStartsAt 等を設定して 3 秒カウントダウン開始 */
export const startGameCountdown = functions.https.onCall(
  async (data, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const matchId = data?.matchId;
    if (typeof matchId !== 'string' || !matchId) {
      throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
    }

    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchSnap = await matchRef.get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found');
      }
      const matchData = matchSnap.data()!;
      if (matchData.status !== 'playing') {
        throw new functions.https.HttpsError('failed-precondition', 'Match is not in playing state');
      }
      const playerA = matchData.players?.A;
      const playerB = matchData.players?.B;
      if (!playerA || !playerB) {
        throw new functions.https.HttpsError('failed-precondition', 'Match has no second player yet');
      }
      if (uid !== playerA && uid !== playerB) {
        throw new functions.https.HttpsError('permission-denied', 'You are not a player in this match');
      }
      if (matchData.gameStartsAt != null) {
        return { ok: true }; // 既にカウントダウン開始済み
      }

      const questionIds = matchData.questionIds || [];
      const questionCount = questionIds.length;
      const countdownMs = 3000;

      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(matchRef);
        if (!snap.exists) return { countdownStarted: false };
        const d = snap.data()!;
        if (d.gameStartsAt != null) return { countdownStarted: false };
        const currentBeginA = d.beginBattleA === true;
        const currentBeginB = d.beginBattleB === true;
        const newBeginA = uid === playerA ? true : currentBeginA;
        const newBeginB = uid === playerB ? true : currentBeginB;
        t.update(matchRef, { beginBattleA: newBeginA, beginBattleB: newBeginB });

        if (newBeginA && newBeginB) {
          const now = Timestamp.now();
          const gameStartsAt = Timestamp.fromMillis(now.toMillis() + countdownMs);
          const startedAt = gameStartsAt;
          const endsAt = Timestamp.fromMillis(gameStartsAt.toMillis() + 20 * 1000 * questionCount);
          t.update(matchRef, {
            gameStartsAt,
            startedAt,
            endsAt,
            currentQuestionStartedAt: gameStartsAt,
          });
          return { countdownStarted: true };
        }
        return { countdownStarted: false };
      });

      return { ok: true, countdownStarted: result?.countdownStarted === true };
    } catch (err: any) {
      if (err instanceof functions.https.HttpsError) throw err;
      const msg = err?.message ?? String(err);
      console.error('startGameCountdown error:', msg);
      throw new functions.https.HttpsError(
        'internal',
        msg ? `startGameCountdown failed: ${msg}` : 'Failed to start game countdown'
      );
    }
  }
);

/** セグメント勝敗画面で Continue を押したときに呼ぶ。両方押したら listeningPhaseStartsAt / dictationPhaseStartsAt を設定 */
export const continuePhaseResult = functions.https.onCall(
  async (data, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const matchId = data?.matchId;
    const phase = data?.phase; // 'choice' | 'listening'
    if (typeof matchId !== 'string' || !matchId) {
      throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
    }
    if (phase !== 'choice' && phase !== 'listening') {
      throw new functions.https.HttpsError('invalid-argument', 'phase must be choice or listening');
    }

    try {
      const matchRef = db.collection('matches').doc(matchId);
      const matchSnap = await matchRef.get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found');
      }
      const matchData = matchSnap.data()!;
      if (matchData.status !== 'playing') {
        throw new functions.https.HttpsError('failed-precondition', 'Match is not in playing state');
      }
      const playerA = matchData.players?.A;
      const playerB = matchData.players?.B;
      if (!playerA || !playerB) {
        throw new functions.https.HttpsError('failed-precondition', 'Match has no second player');
      }
      if (uid !== playerA && uid !== playerB) {
        throw new functions.https.HttpsError('permission-denied', 'You are not a player in this match');
      }

      const countdownMs = 3000;

      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(matchRef);
        if (!snap.exists) return { countdownStarted: false };
        const d = snap.data()!;

        if (phase === 'choice') {
          if (d.listeningPhaseStartsAt != null) return { countdownStarted: false };
          const curA = d.phaseChoiceContinueA === true;
          const curB = d.phaseChoiceContinueB === true;
          const newA = uid === playerA ? true : curA;
          const newB = uid === playerB ? true : curB;
          t.update(matchRef, { phaseChoiceContinueA: newA, phaseChoiceContinueB: newB });
          if (newA && newB) {
            const now = Timestamp.now();
            const listeningPhaseStartsAt = Timestamp.fromMillis(now.toMillis() + countdownMs);
            t.update(matchRef, { listeningPhaseStartsAt });
            return { countdownStarted: true };
          }
          return { countdownStarted: false };
        }

        if (phase === 'listening') {
          if (d.dictationPhaseStartsAt != null) return { countdownStarted: false };
          const curA = d.phaseListeningContinueA === true;
          const curB = d.phaseListeningContinueB === true;
          const newA = uid === playerA ? true : curA;
          const newB = uid === playerB ? true : curB;
          t.update(matchRef, { phaseListeningContinueA: newA, phaseListeningContinueB: newB });
          if (newA && newB) {
            const now = Timestamp.now();
            const dictationPhaseStartsAt = Timestamp.fromMillis(now.toMillis() + countdownMs);
            t.update(matchRef, { dictationPhaseStartsAt });
            return { countdownStarted: true };
          }
          return { countdownStarted: false };
        }

        return { countdownStarted: false };
      });

      return { ok: true, countdownStarted: result?.countdownStarted === true };
    } catch (err: any) {
      if (err instanceof functions.https.HttpsError) throw err;
      const msg = err?.message ?? String(err);
      console.error('continuePhaseResult error:', msg);
      throw new functions.https.HttpsError(
        'internal',
        msg ? `continuePhaseResult failed: ${msg}` : 'Failed to continue phase result'
      );
    }
  }
);

// --- ランク・称号の再計算（レーティングに基づく Tier / Global GM / National GM）---

type TierType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/** パーセンタイル（0〜100、小さいほど上位）から Tier を決定 */
function percentileToTier(percentile: number): TierType {
  if (percentile < 1) return 'king';
  if (percentile < 5) return 'queen';
  if (percentile < 15) return 'rook';
  if (percentile < 30) return 'bishop';
  if (percentile < 50) return 'knight';
  return 'pawn';
}

const BATCH_SIZE = 500;

/**
 * 指定モードのランク（tier, percentile, globalRank）を再計算。overall のみ titles（globalGM, nationalGM）を付与。
 */
async function recomputeRanksInternal(mode: RankedMode = 'overall'): Promise<{ updated: number; total: number }> {
  console.log('[recomputeRanks] started, mode:', mode);
  const usersRef = db.collection('users');

  const ratingKey = mode === 'choice' ? 'ratingChoice' : mode === 'dictation' ? 'ratingDictation' : mode === 'listening' ? 'ratingListening' : 'ratingOverall';
  const rankKey = mode === 'choice' ? 'rankChoice' : mode === 'dictation' ? 'rankDictation' : mode === 'listening' ? 'rankListening' : 'rankOverall';

  const snapshot = await usersRef.get();
  const total = snapshot.size;
  if (total === 0) {
    console.log('[recomputeRanks] no users, done');
    return { updated: 0, total: 0 };
  }

  type Row = { uid: string; rating: number; country: string };
  const rows: Row[] = snapshot.docs.map((doc) => {
    const d = doc.data();
    let rating = 1000;
    if (mode === 'overall') {
      rating = typeof d.ratingOverall === 'number' ? d.ratingOverall : typeof d.rating === 'number' ? d.rating : 1000;
    } else {
      const v = d[ratingKey];
      rating = typeof v === 'number' ? v : 1000;
    }
    return {
      uid: doc.id,
      rating,
      country: (d.country && String(d.country).trim()) || 'UN',
    };
  });

  rows.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.uid.localeCompare(b.uid);
  });

  type UserUpdate = {
    uid: string;
    percentile: number;
    globalRank: number;
    tier: TierType;
    globalGM: boolean;
    nationalGM: boolean;
    provisional: boolean;
    countryRank?: number;
  };
  const provisional = total <= 20;
  const updates: UserUpdate[] = rows.map((r, i) => {
    const globalRank = i + 1;
    const percentileForTier = total === 0 ? 0 : ((globalRank - 1) / total) * 100;
    const percentileDisplay = total <= 1 ? 0 : ((globalRank - 1) / (total - 1)) * 100;
    const tier = percentileToTier(percentileForTier);
    const globalGM = mode === 'overall' && globalRank <= 10;
    return {
      uid: r.uid,
      percentile: percentileDisplay,
      globalRank,
      tier,
      globalGM,
      nationalGM: false,
      provisional,
    };
  });

  if (mode === 'overall') {
    const byCountry = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.country === 'UN') continue;
      if (!byCountry.has(r.country)) byCountry.set(r.country, []);
      byCountry.get(r.country)!.push(r);
    }
    const nationalGMUids = new Set<string>();
    const countryRankByUid = new Map<string, number>();
    for (const [, countryRows] of byCountry) {
      const count = countryRows.length;
      const cutoff = count < 1000 ? 1 : Math.max(1, Math.ceil(count * 0.001));
      for (let i = 0; i < cutoff && i < countryRows.length; i++) {
        nationalGMUids.add(countryRows[i].uid);
      }
      for (let i = 0; i < countryRows.length; i++) {
        countryRankByUid.set(countryRows[i].uid, i + 1);
      }
    }
    for (const u of updates) {
      if (nationalGMUids.has(u.uid)) u.nationalGM = true;
      const cr = countryRankByUid.get(u.uid);
      if (cr !== undefined) u.countryRank = cr;
    }
  }

  const now = Timestamp.now();
  let committed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + BATCH_SIZE);
    for (const u of chunk) {
      const ref = usersRef.doc(u.uid);
      const rankData = {
        tier: u.tier,
        percentile: Math.round(u.percentile * 100) / 100,
        globalRank: u.globalRank,
        updatedAt: now,
        provisional: u.provisional,
        ...(u.countryRank !== undefined && { countryRank: u.countryRank }),
      };
      const update: Record<string, unknown> = { [rankKey]: rankData };
      if (mode === 'overall') {
        update.rank = rankData; // 後方互換
        update.titles = { globalGM: u.globalGM, nationalGM: u.nationalGM };
      }
      batch.set(ref, update, { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    console.log('[recomputeRanks] batch committed:', committed, '/', total);
  }

  console.log('[recomputeRanks] done, mode:', mode, 'updated:', committed);
  return { updated: committed, total };
}

/** 手動（Callable）でランク再計算。mode 省略時は全4モードを再計算。 */
export const recomputeRanks = functions.https.onCall(
  async (data: { mode?: RankedMode }, context: functions.https.CallableContext) => {
    const mode = data?.mode;
    if (mode) {
      const result = await recomputeRanksInternal(mode);
      return result;
    }
    const modes: RankedMode[] = ['choice', 'dictation', 'listening', 'overall'];
    const results: Record<string, { updated: number; total: number }> = {};
    for (const m of modes) {
      results[m] = await recomputeRanksInternal(m);
    }
    return results;
  }
);

