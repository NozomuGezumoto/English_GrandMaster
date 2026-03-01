import { Timestamp } from 'firebase/firestore';

export type Language = 'en' | 'de' | 'fr';
export type ExamType = 'toeic' | 'toefl';
export type MatchMode = 'ai' | 'friend' | 'ranked';
export type MatchStatus = 'waiting' | 'matched' | 'playing' | 'finished' | 'aborted';
export type QuestionType = 'choice' | 'dictation' | 'listening' | 'overall';

/** 問題種別: 空欄補充 vs 読解 vs リスニング応答選択 */
export type QuestionDocType = 'cloze' | 'reading' | 'listening_response';

/** リスニング応答選択の問題で使用。会話行為の分類（誤答品質のため） */
export type SpeechActType =
  | 'greeting'
  | 'apology'
  | 'suggestion'
  | 'agreement'
  | 'refusal'
  | 'request'
  | 'offer'
  | 'thanks'
  | 'confirmation'
  | 'smalltalk';

/** 出題品質: ok のみ出題、needs_fix は隔離、blocked は本文未整備等で出題しない */
export type QuestionQualityStatus = 'ok' | 'needs_fix' | 'blocked';
/** 問題の出所 */
export type QuestionSource = 'manual' | 'template' | 'ai';

export interface Question {
  lang: Language;
  exam: ExamType;
  level: number; // 1-10
  prompt: string;
  choices: string[]; // [A, B, C, D]
  /** 0-3。マッチ中は getQuestionForMatch で取得するため未設定のことがある（正解は correctChoiceIndex で表示） */
  answerIndex?: number;
  explanation: string;
  /** 空欄補充 or 読解（読解は passage 必須） or リスニング応答選択 */
  type?: QuestionDocType;
  /** リスニング応答選択で必須。会話行為の分類 */
  speechAct?: SpeechActType;
  /** 回答後に prompt を表示するか。listening_response では true 推奨 */
  promptVisibleAfterAnswer?: boolean;
  /** 読解問題の本文。type===reading で必須、無いと出題しない */
  passage?: string;
  source?: QuestionSource;
  /** 出題対象にするか。デフォルト true */
  active?: boolean;
  /** 出題は qualityStatus==='ok' のみ */
  qualityStatus?: QuestionQualityStatus;
  /** バリデーションで引っかかった理由など */
  qaNotes?: string;
}

export interface MatchAnswer {
  choiceIndex?: number; // 4択問題の場合
  textAnswer?: string; // ディクテーションの場合
  answeredAt: Timestamp;
  isCorrect: boolean;
  // ディクテーション用の詳細スコア
  accuracy?: number; // 精度スコア（0.0-1.0）：文字単位の一致率
  speedFactor?: number; // 時間ボーナス（0.0-1.0）：残り時間 ÷ 制限時間
  finalScore?: number; // 最終スコア（0.0-1.0）：(Accuracy × 0.8) + (Speed × 0.2)
}

/** TOEICレベル（問題難易度選択用） */
export type ToeicLevel = 400 | 600 | 730 | 860 | 990;

export interface Match {
  /** Firestore ドキュメント ID（クライアントで doc.id とマージして持つ場合） */
  id?: string;
  mode: MatchMode;
  status: MatchStatus;
  lang: Language;
  roomCode?: string; // 友達対戦のみ
  questionType: QuestionType; // 'choice' | 'dictation'
  /** 選択されたTOEICレベル（AI・友達対戦で使用） */
  level?: ToeicLevel;
  
  players: {
    A: string; // uid
    B: string; // uid または "ai"
  };
  
  questionIds: string[]; // 最大10問（ライフ制）。overall の場合は 10+3+10=23
  /** questionType==='overall' のときのみ。先頭 choiceCount が 4択、続く dictationCount がディクテーション、残りがリスニング */
  choiceCount?: number;
  dictationCount?: number;
  listeningCount?: number;
  
  startedAt: Timestamp | null;
  endsAt: Timestamp | null;
  /** 現在の問題の開始時刻（ランクマの forfeit 判定用） */
  currentQuestionStartedAt?: Timestamp | null;
  /** 両者Ready後、ゲーム開始までのカウントダウン終了時刻（サーバー基準・3秒後） */
  gameStartsAt?: Timestamp | null;
  /** GrandMaster: 4択→リスニングへの切り替えカウントダウン終了時刻 */
  listeningPhaseStartsAt?: Timestamp | null;
  /** GrandMaster: リスニング→ディクテーションへの切り替えカウントダウン終了時刻 */
  dictationPhaseStartsAt?: Timestamp | null;
  createdAt: Timestamp;

  /** ライフ（両者3から開始、0で即終了） */
  lives?: {
    [uidOrAi: string]: number;
  };
  
  answers: {
    [uid: string]: {
      [qIndex: number]: MatchAnswer;
    };
  };
  
  scores: {
    [uid: string]: number;
  };
  
  winnerUid: string | null;
  /** GrandMaster(overall) のみ。各セグメントの勝者（総合勝者・レートは winnerUid のみ） */
  phaseChoiceWinnerUid?: string | null;
  phaseListeningWinnerUid?: string | null;
  phaseDictationWinnerUid?: string | null;
  /** ランクマで相手が時間切れ/切断で負けになった場合 true */
  forfeit?: boolean;
  /** 試合終了理由（結果画面の表示用）。forfeit_consecutive=連続2回未回答で不戦敗, lives=ライフ0, score=得点/ phase 勝敗, draw=引き分け */
  finishReason?: 'forfeit_consecutive' | 'lives' | 'score' | 'draw';
  /** 不戦敗用：連続未回答カウント。4択・リスニングのみ。1回でも通常回答で0にリセット。2で不戦敗 */
  consecutiveUnanswered?: Record<string, number>;
  /** レート・勝敗数更新を1回だけ行うためのフラグ（Functions で設定） */
  ratingProcessed?: boolean;
  currentQuestionIndex: number; // 0〜9
  /** ランク・友達対戦で両者マッチ後、ゲーム開始前に両者が「準備完了」を押すためのフラグ（status='matched' のとき使用） */
  readyA?: boolean;
  readyB?: boolean;
  /** ランク・友達対戦で両者 Ready 後、両者が「Begin Battle」を押したか。両方 true で gameStartsAt を設定 */
  beginBattleA?: boolean;
  beginBattleB?: boolean;
  /** GrandMaster: 4択セグメント結果で Continue を押したか。両方 true で listeningPhaseStartsAt を設定 */
  phaseChoiceContinueA?: boolean;
  phaseChoiceContinueB?: boolean;
  /** GrandMaster: リスニングセグメント結果で Continue を押したか。両方 true で dictationPhaseStartsAt を設定 */
  phaseListeningContinueA?: boolean;
  phaseListeningContinueB?: boolean;
  /** 今日の学習カウントを記録済みにした uid の配列（二重カウント防止） */
  todayStatsRecordedFor?: string[];
}

export type TierType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface UserRank {
  tier: TierType;
  percentile: number; // 0〜100（表示用。小さいほど上位）
  globalRank: number;
  updatedAt: Timestamp;
  /** 参加者 total <= 20 のとき true（暫定ランク） */
  provisional?: boolean;
  /** 国別順位（1〜）。country が UN の場合は未設定） */
  countryRank?: number;
}

export interface UserTitles {
  globalGM: boolean;
  nationalGM: boolean;
}

/** 今日の学習カウント（日付は UTC YYYY-MM-DD）。対戦=回数・勝敗、ディクテーション=解いた問題数 */
export interface UserStatsToday {
  date: string;
  battles: number;
  wins: number;
  losses: number;
  dictationSolved: number;
}

export interface User {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  /** Storage パス（他端末表示用）。avatarPath があれば getDownloadURL で表示。avatarUrl は後方互換 */
  avatarPath?: string;
  avatarUpdatedAt?: Timestamp;
  country?: string;
  /** 総合ランク用レート（Grandmaster はこのみ）。後方互換で rating も overall として扱う */
  rating: number; // Eloレート（デフォルト: 1000）
  /** 4択・Dictation・Listening・総合の各レート（未設定時は rating または 1000） */
  ratingChoice?: number;
  ratingDictation?: number;
  ratingListening?: number;
  ratingOverall?: number;
  /** 直近のランクマッチによる変動（表示用。+12, -8 など） */
  ratingChange?: number;
  wins: number; // 総合の勝利数
  losses: number; // 総合の敗北数
  /** モード別勝敗（総合は wins/losses を使用） */
  winsChoice?: number;
  lossesChoice?: number;
  winsDictation?: number;
  lossesDictation?: number;
  winsListening?: number;
  lossesListening?: number;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
  /** 総合ランク（Grandmaster 称号はこのランクのみ） */
  rank?: UserRank;
  /** 総合ランク用称号（globalGM, nationalGM） */
  titles?: UserTitles;
  /** モード別ランク（称号なし） */
  rankChoice?: UserRank;
  rankDictation?: UserRank;
  rankListening?: UserRank;
  rankOverall?: UserRank;
  /** 今日の学習（対戦回数・勝敗・ディクテーション解いた数） */
  statsToday?: UserStatsToday;
  /** フレンド追加用の固有コード（6文字英数字）。未設定の場合は Functions で発行 */
  friendCode?: string;
  /** フレンドの uid 一覧 */
  friends?: string[];
}

/** フレンドリクエスト（承認制） */
export interface FriendRequest {
  fromUid: string;
  toUid: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
}


