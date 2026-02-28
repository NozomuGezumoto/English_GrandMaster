# English Battle（English GrandMaster）— 画面・機能 整理仕様書

ソフト全体の仕様を確認し、画面と機能を一覧に整理したドキュメントです。  
詳細は `APP_FEATURES.md` を参照してください。

---

## 1. アプリ概要

| 項目 | 内容 |
|------|------|
| **名称** | English Battle / English GrandMaster |
| **種別** | リアルタイム英語 PvP 学習アプリ |
| **技術** | Expo (React Native), TypeScript, Firebase (Auth, Firestore, Cloud Functions) |
| **ルーティング** | Expo Router（ファイルベース） |
| **対応** | Web, iOS, Android（エミュレータ対応） |

---

## 2. 画面一覧（ルート・タブ・スタック）

### 2.1 ルート・タブ

| ルート | ファイル | 役割 |
|--------|----------|------|
| `/` | `app/index.tsx` | ルート → **Battle タブ**へリダイレクト |
| `/(tabs)/battle` | `app/(tabs)/battle.tsx` | **Battle タブ**: 対戦メニュー（ランクマ・AI・友達・GrandMaster） |
| `/(tabs)/study` | `app/(tabs)/study.tsx` | **Study タブ**: 4択復習・ディクテーション・リスニングクイズ |
| `/(tabs)/profile` | `app/(tabs)/profile.tsx` | **Profile タブ**: ユーザー情報・ランク・戦績・フレンド |

タブは **Battle / Study / Profile** の 3 つ。ヘッダーは各画面で独自実装。

### 2.2 スタック画面（タブ外）

| ルート | ファイル | 役割 |
|--------|----------|------|
| `/match/[id]` | `app/match/[id].tsx` | **対戦画面**: 待機 → プレイ（4択/ディクテーション/リスニング/Overall）→ 結果へ遷移 |
| `/result/[id]` | `app/result/[id].tsx` | **結果画面**: 勝敗・スコア・復習（間違えた問題）→ 「Back to Home」 |
| `/login` | `app/login.tsx` | **アカウント作成**: メール・パスワード・表示名・国・アバター |
| `/sign-in` | `app/sign-in.tsx` | **サインイン**: メール・パスワード（Forgot password リンクあり） |
| `/forgot-password` | `app/forgot-password.tsx` | **パスワードリセット**: メール送信 |
| `/link-account` | `app/link-account.tsx` | **アカウント保護**: 匿名 → メール・パスワード紐づけ |
| `/edit-profile` | `app/edit-profile.tsx` | **プロフィール編集**: 表示名・アバター・国（Firestore + Auth 更新） |

### 2.3 共通コンポーネント・レイアウト

| 場所 | 役割 |
|------|------|
| `app/_layout.tsx` | `SafeAreaProvider` → `ErrorBoundary` → `OfflineBanner` → `Stack`。音声モード・クリック音プリロード・Web ビューポート CSS。 |
| `app/components/ErrorBoundary.tsx` | エラー時メッセージ + 「Back to Home」で `/(tabs)/battle` へ。 |
| `app/components/OfflineBanner.tsx` | NetInfo でオフライン時「You are offline」表示。 |

---

## 3. 機能一覧（分野別）

### 3.1 認証・ユーザー

- **メール・パスワード**: 作成（`/login`）、サインイン（`/sign-in`）、パスワードリセット（`/forgot-password`）。
- **匿名ログイン**: 未ログイン時は `signInAnonymously`。ランクマ・AI・友達対戦で利用可能。
- **アカウント保護**: 匿名のまま「Secure your account」から `/link-account` でメール・パスワードを紐づけ。
- **ランクマッチ前提**: **displayName** が必須。未設定時は `/login` へ誘導。
- **ログアウト**: Battle 画面上部の「Sign out」。

Firestore `users`: `uid`, `displayName`, `avatarUrl`, `country`, `rating`（Elo）, `wins`/`losses`, `rank`（tier, percentile, globalRank, countryRank）, `titles`（globalGM, nationalGM）, `friendCode`, `friends`, モード別 `rating*`/`rank*` など。

---

### 3.2 対戦（Battle）

| モード | 説明 | 問題タイプ | 備考 |
|--------|------|------------|------|
| **Ranked Match** | ランクマッチ。`findRankedMatch` で ±200 Elo でマッチング or 待機。 | 4択 / ディクテーション / リスニング / **Overall（GrandMaster）** | displayName 必須。Elo・勝敗更新。Forfeit あり。 |
| **Start vs AI** | AI 対戦。難易度・問題タイプ選択 → `createMatch(mode: 'ai')`。 | 4択 / ディクテーション / リスニング | 問題数: 4択・リスニング 10 問、ディクテーション 5 問。 |
| **Create Friend Match** | 友達対戦作成。難易度・タイプ選択 → 6 桁ルームコード発行。 | 4択 / ディクテーション / リスニング | `createMatch(mode: 'friend')`。 |
| **Join Friend Match** | 6 桁ルームコード入力 → `joinFriendMatch` で参加。 | 作成時と同じ | `status: waiting` のマッチに参加。 |
| **GrandMaster** | ランクマの一種。4択 → リスニング → ディクテーションの 3 フェーズ。 | **Overall** | フェーズごとに勝者表示 → Continue → カウントダウン → 次フェーズ。 |

**Overall（GrandMaster）**: 1 試合で 4択 → リスニング → ディクテーションの順。各フェーズ終了時に「4-Choice / Listening phase 勝者」表示 → `continuePhaseResult` で次フェーズ開始。

---

### 3.3 対戦画面（Match）

- **待機（waiting）**: ランクマ「Finding an opponent...」/ 友達「Waiting for opponent...」+ ルームコード。
- **プレイ（playing）**:
  - **4択**: 問題文・4 選択肢・20 秒タイマー。ライフ制（3 から開始）。回答後に `explanation`。
  - **ディクテーション**: 音声再生 → 入力 → スペース除去で比較。スコア（精度＋時間ボーナス）。20 秒タイマー。
  - **リスニング**: 音声（prompt）再生 → 4 選択肢から応答を選択。スコアで勝敗。
- **GrandMaster**: フェーズ切り替え時にセグメント勝者表示 → Continue → 3 秒カウントダウン → 次フェーズ。
- **終了**: `status === 'finished'` で `/result/[id]` へ `router.replace`。

問題取得: Firestore `questions` + アプリ内データ（`listening-response`, ローカル問題）。`normalizeQuestion` で `choices` を配列に統一。

---

### 3.4 結果画面（Result）

- 勝敗（Victory / Defeat / Draw）、Forfeit 時の説明。
- 自分・相手のスコア・アバター・名前。
- **復習**: 間違えた問題のみ一覧（問題文・自分の回答・正解・解説）。
- 「Back to Home」でルート（タブ）へ。

---

### 3.5 Study タブ

| 機能 | 説明 |
|------|------|
| **4択（Review wrong answers / List）** | 直近 finished マッチから自分が不正解だった問題を表示。またはレベル指定で問題一覧（回答非表示）。 |
| **ディクテーション** | `data/dictation-vocab.json`（レベル 1–10）。TOEIC 帯で語を取得。音声再生 → 入力 → 正解で英英定義表示。「Next word」で次へ。 |
| **リスニングクイズ** | サブタブ: **List**（レベル別問題一覧・音声文のみ）/ **Quiz**（出題）/ **Wrong**（間違えた問題のみ）。データ: `lib/listening-response-questions.ts` + `data/listening-response.json`。 |

---

### 3.6 Profile タブ

- **表示**: アバター、表示名、国、ランク（Tier: Pawn〜King）、Provisional、称号（World GrandMaster / National GM）、Rating / World Rank / Wins / Losses / Win rate、モード別（4択/ディクテーション/リスニング/Overall）の Rating・Rank。
- **編集**: 「Edit」→ `/edit-profile`。
- **アカウント保護**: 「Secure account」→ `/link-account`。
- **フレンド**: **Your friend code**（6 桁、コピー可能）。**Add by code** でコード入力 → `lookupByFriendCode` → `addFriend`。フレンド一覧から「Remove」で `removeFriend`。
- **未ログイン**: 「No account」+「Create account」→ `/login`。
- **開発用**: 「Recompute ranks」で `recomputeRanks` 実行。

---

### 3.7 Cloud Functions 一覧

| 関数名 | 役割 |
|--------|------|
| `createMatch` | AI / 友達対戦のマッチ作成。問題取得、AI は即 playing、友達は roomCode 発行。 |
| `joinFriendMatch` | 6 桁 roomCode で waiting マッチに参加。playing に更新。 |
| `submitAnswer` | 回答受信・正誤・スコア/ライフ更新。AI の場合は AI 回答も書き込み。Forfeit 判定。両者回答で次問 or 試合終了。 |
| `getQuestionForMatch` | マッチの現在問題を返す（Firestore + アプリ内問題対応）。 |
| `recordMatchComplete` | マッチ完了時の記録（統計等）。 |
| `incrementTodayDictation` | Study の「今日のディクテーション」カウント用。 |
| `getOrCreateFriendCode` | ユーザーの 6 桁フレンドコード取得 or 新規発行。 |
| `lookupByFriendCode` | フレンドコードでユーザー検索。 |
| `addFriend` | フレンド追加。 |
| `removeFriend` | フレンド削除。 |
| `finalizeMatch` | マッチを finished にし、ランクマの場合は Elo・勝敗更新。 |
| `claimForfeit` | 相手時間切れ時に Forfeit 申請。 |
| `findRankedMatch` | ランクマッチ検索 or 新規作成。レート ±200 でマッチング。 |
| `setMatchReady` | ランクマッチでマッチング成立時の準備完了。 |
| `startGameCountdown` | カウントダウン開始（gameStartsAt 等設定）。 |
| `continuePhaseResult` | GrandMaster のフェーズ結果を dismiss し、次フェーズ開始時刻を設定。 |
| `recomputeRanks` | 全ユーザーの tier / percentile / globalRank / countryRank / titles を再計算。 |

---

## 4. データ・レベル

- **問題**: Firestore `questions`（4択: cloze/reading、ディクテーションは `choices[answerIndex]` が正解語）。アプリ内: `data/listening-response.json`, `data/dictation-vocab.json`, `lib/dictation-vocab.ts`。
- **レベル**: TOEIC 400 / 600 / 730 / 860 / 990 ↔ 問題 level 1–10。`lib/levels.ts` の `LEVEL_DISPLAY`, `getLevelRangeForToeic`, `ratingToToeicLevel`。
- **正規化**: `lib/question-utils.ts` の `normalizeQuestion` で `choices` を配列に統一（match / result / study で使用）。

---

## 5. ナビゲーション・遷移まとめ

- **ルート** → `/(tabs)/battle`
- **Battle** → `/match/[id]`（createMatch / findRankedMatch / joinFriendMatch）、`/login`, `/sign-in`, Sign out
- **Profile** → `/edit-profile`, `/link-account`, `/login`, `/sign-in`
- **Match** → `status === 'finished'` で `/result/[id]` に replace
- **Result** → 「Back to Home」で `/`（→ battle タブ）
- **Sign-in / Login** → 成功後 Battle または前の画面へ

---

*最終更新: コードベースおよび `docs/APP_FEATURES.md` に基づく。*
