# English Battle（English GrandMaster）アプリ 機能一覧

このドキュメントは、アプリの全機能を詳細にまとめたものです。  
**画面・機能の一覧整理版**は `SPEC_画面と機能一覧.md` を参照してください。

---

## 1. アプリ概要

- **名称**: English Battle / English GrandMaster
- **種別**: リアルタイム英語 PvP 学習アプリ（Web / モバイル）
- **技術**: Expo (React Native), Firebase (Auth, Firestore, Cloud Functions)
- **対応**: ブラウザ、iOS/Android（エミュレータ対応はエミュレータのみ想定）

---

## 2. 画面構成・ナビゲーション

| パス | 説明 |
|------|------|
| `/` | ルート → タブ「Battle」へリダイレクト |
| `/(tabs)/battle` | **Battle** タブ：対戦メニュー（ランクマ・AI・友達・GrandMaster） |
| `/(tabs)/study` | **Study** タブ：復習（4択）・ディクテーション・リスニングクイズ |
| `/(tabs)/profile` | **Profile** タブ：ユーザー情報・ランク・戦績 |
| `/match/[id]` | 対戦画面（待機中 / プレイ中 / 結果前） |
| `/result/[id]` | 対戦結果・復習 |
| `/login` | アカウント作成（メール・パスワード・表示名・国・アバター） |
| `/sign-in` | サインイン（メール・パスワード） |
| `/forgot-password` | パスワードリセット（メール送信） |
| `/link-account` | 匿名アカウントにメール・パスワードを紐づけて保護 |
| `/edit-profile` | プロフィール編集 |

タブは **Battle / Study / Profile** の 3 つ。ヘッダーは各画面で独自実装（共通ヘッダーなし）。

---

## 3. 認証・ユーザー

### 3.1 認証方式

- **メール・パスワード認証**: アカウント保護のため、新規作成は **Create account** (`/login`) でメール・パスワード・表示名・国・アバターを設定。既存ユーザーは **Sign in** (`/sign-in`) でメール・パスワードでサインイン。**Forgot password** (`/forgot-password`) でパスワードリセットメールを送信。
- **匿名ログイン**: AI・友達対戦などで未ログインの場合は `signInAnonymously` で匿名ユーザーを作成可能。匿名のままランクマッチも可能だが、**Profile** で「Secure your account」からメール・パスワードを紐づけると、他端末でも同じアカウントでサインインできる（`linkWithCredential`）。
- **アカウント（表示名）**: ランクマッチには **displayName** が必須。未設定の場合は「Create account」で `/login` へ誘導。
- **ログアウト**: Battle 画面上部の「Sign out」で `signOut(auth)`。

**Firebase Console**: メール・パスワード認証を使うには、Firebase Console → Authentication → Sign-in method で **Email/Password** を有効にしてください。

**携帯からPCの開発サーバーに接続する場合**（`useEmulator: true` のとき）:
- **Web**: 携帯のブラウザで **http://localhost:8081** ではなく、**http://&lt;PCのIPアドレス&gt;:8081** で開いてください。PCのIPは、PCのコマンドプロンプトで `ipconfig`（Windows）または `ifconfig`（Mac/Linux）で確認できます。PCと携帯は同じWi-Fiに接続してください。
- **Web で CORS エラーになる場合**: ブラウザ（localhost:8081）から Functions エミュレータ（localhost:5001）への呼び出しは CORS でブロックされます。**CORS プロキシ**を起動してください。別ターミナルで `npm run cors-proxy` を実行すると、プロキシが **5052** で立ち上がり、アプリ（Web）は自動で 5052 経由で Functions に接続します。手順: (1) `firebase emulators:start --only functions,firestore,auth` (2) `npm run cors-proxy` (3) `npm run web` で http://localhost:8081 を開く。
- **PC でランクマ・フレンド追加が失敗し「Access-Control-Allow-Origin が二重」と出る場合**: (1) CORS プロキシを**一度終了**（Ctrl+C）してから、もう一度 `npm run cors-proxy` で起動する（プロキシは **5052** を使用）。(2) PC のブラウザで **ハードリロード**（Ctrl+Shift+R または 開発者ツール → ネットワーク → 「キャッシュの無効化」にチェックして再読み込み）する。(3) レスポンスヘッダーに `X-CORS-Proxy: 1` が出ていればプロキシ経由なので、それでも二重エラーなら別のタブや古いキャッシュを疑う。
- **Expo Go（実機）**: `app.json` の `extra.emulatorHost` を `"localhost"` ではなく **PCのIPアドレス**（例: `"192.168.1.5"`）に設定すると、実機からAuth/Firestore/Functionsエミュレータに接続できます。

### 3.2 ユーザードキュメント（Firestore `users`）

- `uid`, `displayName`, `avatarUrl`, `country`
- `rating`: Elo レート（初期 1000）。ランクマッチで変動。
- `wins`, `losses`: ランクマッチの勝敗数。
- `createdAt`, `lastActiveAt`
- `rank`: `recomputeRanks` で書き込み。`tier`, `percentile`, `globalRank`, `updatedAt`, `provisional`, `countryRank`。
- `titles`: `globalGM`（世界 Top10）, `nationalGM`（国別 Top 0.1%）。
- **フレンド**: `friendCode`（6 桁）、`friends`（uid の配列）。`getOrCreateFriendCode` / `addFriend` / `removeFriend` で更新。
- **モード別レート・ランク**: ランクマの種別ごとに `ratingChoice`, `ratingDictation`, `ratingListening`, `ratingOverall` および対応する `rank*` を保持（Overall は GrandMaster 称号用）。

---

## 4. 対戦モード（Battle）

### 4.1 ランクマッチ（Ranked Match）

- **前提**: ログイン済みかつ **displayName が設定されていること**。未設定ならログイン画面へ。
- **流れ**: 「Ranked Match」タップ → モーダルで **問題タイプ（4択 / ディクテーション / リスニング / GrandMaster）** を選択 → Cloud Function `findRankedMatch` 呼び出し。
  - 待機中のマッチのうち、**レート差 ±200** 以内の相手がいればマッチング → 即 `playing`。
  - いなければ新規マッチ作成（`status: waiting`）→ 相手が `findRankedMatch` でマッチするまで待機。
- **出題**: 作成者のレートから TOEIC レベルを決定（`ratingToToeicLevel`）。問題タイプは **4択 / ディクテーション / リスニング / Overall（GrandMaster）** から選択。問題数は 4択・リスニング 10 問 / ディクテーション 5 問（GrandMaster は 4択→リスニング→ディクテーションの 3 フェーズ構成）。
- **決着**: 4択はライフ制（3 から開始、不正解で 1 減）。ディクテーション・リスニングはスコア合計で勝敗。同点は引き分け。GrandMaster は 3 フェーズの合計で勝敗。
- **レート更新**: 終了時に Elo 計算（K=32）で `users` の該当モードの `rating*` / `wins` / `losses` を更新。
- **Forfeit**: 相手が一定時間（25 秒）回答しなかった場合、時間切れ負けとして相手負け・自分勝ちで終了。

### 4.2 AI 対戦（Start vs AI）

- **流れ**: 「Start vs AI」→ モーダルで **難易度（TOEIC/CEFR）** と **問題タイプ（4択 / ディクテーション / リスニング）** を選択 → `createMatch`（`mode: 'ai'`）→ `/match/[id]` へ。
- **難易度**: 400 / 600 / 730 / 860 / 990（Elementary 〜 Proficiency）。`getLevelRange` で問題レベル 1–10 にマッピング。
- **問題数**: 4択・リスニング 10 問、ディクテーション 5 問。
- **相手**: `players.B = 'ai'`。ユーザーが回答すると Cloud Function 内で AI が自動回答（4択は 70% 正解、ディクテーションは精度・速度でスコア算出）。両者回答後に次の問題へ。

### 4.3 友達対戦（Create / Join Friend Match）

- **作成**: 「Create Friend Match」→ 難易度・問題タイプ（4択 / ディクテーション / リスニング）選択 → `createMatch`（`mode: 'friend'`）→ 6 桁の **ルームコード** が発行され、アラートで表示。作成者はそのまま `/match/[id]` へ。
- **参加**: 「Join Friend Match」→ 6 桁ルームコード入力 → `joinFriendMatch` で `roomCode` が一致し `status: waiting` のマッチに参加。参加後 `status: playing`、両者とも同じマッチ画面で対戦。
- **問題**: 作成時に選んだ難易度・問題タイプ・問題数（4択・リスニング 10 / ディクテーション 5）で固定。

### 4.4 GrandMaster（ランクマッチ Overall）

- **概要**: ランクマッチの一種。1 試合で **4択 → リスニング → ディクテーション** の 3 フェーズを連続で実施。総合レート・称号（World GrandMaster 等）の対象。
- **流れ**: ランクマッチモーダルで「GrandMaster」を選択 → `findRankedMatch`（`questionType: 'overall'`）→ マッチ成立後、各フェーズ終了時に「4-Choice / Listening phase 勝者」を表示 → 両者が Continue で `continuePhaseResult` を呼ぶと次フェーズのカウントダウン（3 秒）→ 次フェーズ開始。
- **問題数**: 4択 10 問、リスニング 10 問、ディクテーション 5 問（バックエンドの `choiceCount` / `listeningCount` 等で管理）。

---

## 5. 対戦画面（Match Screen）

### 5.1 フェーズ

1. **待機中（waiting）**
   - ランクマ: 「Finding an opponent...」＋ スピナー。
   - 友達対戦: 「Waiting for opponent...」＋ ルームコード表示。
2. **プレイ中（playing）**
   - 現在問題インデックスに応じて Firestore の `questions` またはアプリ内データ（`listening-response` 等）から問題を取得。`currentQuestion` を正規化（`choices` を配列に統一）して表示。
   - 4択: 問題文・4 選択肢・解説（回答後）。20 秒タイマー。タイムアウト時は不正解として送信。
   - ディクテーション: 音声再生 → 入力欄でスペースなしで比較。正解/不正解でスコア。20 秒タイマー。
   - **リスニング**: 音声（prompt）を TTS 再生 → 4 つの応答選択肢から 1 つ選択。スコアで勝敗。
   - **GrandMaster（overall）**: 4択→リスニング→ディクテーションの区切りで「4-Choice / Listening phase 勝者」を表示。両者が Continue で次フェーズへ。各フェーズ開始前に 3 秒カウントダウン。
3. **終了**: `status === 'finished'` で `/result/[id]` へ `router.replace`。

### 5.2 4択問題

- 表示: `prompt`, `choices`（A–D）, 回答後に `explanation`。
- 回答: 選択肢タップで `submitAnswer`（`choiceIndex`）。タイムアウトは `choiceIndex: -1` または 999 で送信。
- ライフ: 自分・相手それぞれ ♥3 から開始。自分だけ不正解で自分のライフ -1、相手だけ不正解で相手のライフ -1。どちらかが 0 または全問終了で試合終了。

### 5.3 ディクテーション（対戦内）

- 問題は Firestore の `questions` ドキュメント（4択と同じスキーマで `choices[answerIndex]` が正解単語）。
- 音声: Expo Speech で正解単語を再生。入力はスペース除去して比較。
- スコア: 精度（文字一致率）× 0.8 ＋ 時間ボーナス（残り時間/20）× 0.2。Cloud Function で計算し `answers[uid][qIndex].finalScore` 等に保存。
- UI: 自分と相手のスコア表示。ライフは表示するが、勝敗はスコア合計で判定。

### 5.4 データの堅牢性

- Firestore から取得した問題の `choices` がオブジェクトの場合、`lib/question-utils` の `normalizeQuestion` で配列に正規化。
- `match.players` / `match.questionIds` / `match.answers` 等はオプショナルチェーンやデフォルト値で未定義アクセスを防止。

### 5.5 リスニング問題（対戦内）

- 問題はアプリ内 `data/listening-response.json`（`lib/listening-response-questions.ts`）または Firestore。形式は `prompt`（音声で流す英文）、`choices`（4 つの応答）、`answerIndex`。
- 音声: Expo Speech で `prompt` を再生。回答は選択肢タップで `submitAnswer`（`choiceIndex`）。スコアは正誤に応じて Cloud Function で計算。

---

## 6. 結果画面（Result Screen）

- **表示**: 勝敗（Victory / Defeat / Draw）、Forfeit 時の説明、自分と相手のスコア・アバター・名前。
- **復習**: 間違えた問題のみ一覧表示（問題文・自分の回答・正解・解説）。問題データは Firestore から取得し `normalizeQuestion` で正規化。
- **ナビ**: 「Back to Home」でルート（タブ）へ。

---

## 7. Study タブ

### 7.1 復習（Review wrong answers）

- **データ源**: 直近 10 件の `status === 'finished'` マッチのうち、自分が参加しているものを取得。各マッチの全問題を取得し、**自分が不正解だった問題** のみを「Wrong answers」として表示。
- **表示**: マッチ単位でグループ化（vs AI / Friend match、日付）。各カードに問題文・選択肢（正解/自分の回答をハイライト）・解説。
- **問題データ**: Firestore の `questions` を `normalizeQuestion` で正規化して表示。

### 7.2 ディクテーション（Dictation）

- **データ源**: **対戦とは別**。`data/dictation-vocab.json`（`lib/dictation-vocab.ts`）。レベル 1–10 で各最大 100 語。TOEIC 帯（400/600/730/860/990）に応じて `getWordsForToeicBand` で語を結合。
- **流れ**: 難易度（TOEIC/CEFR）選択 → 「Start dictation」→ ランダムに 1 語を選び、音声再生 → ユーザーが入力。正解で「Correct!」＋ **英英定義**（`definition` ありなら表示）。**自動では次に進まない**。「Next word」タップまたは Enter で次へ。
- **リスト表示**: 「List」でそのレベルの単語一覧＋定義（あれば）を表示。「Hide list」で非表示。
- **語彙ビルド**: `node scripts/build-dictation-vocab.js` で EVP から語彙を取得しレベル別に保存。`--with-definitions` で Free Dictionary API から英英定義を取得して埋める（レート制限のため遅延あり）。

### 7.3 リスニングクイズ（Listening Quiz）

- **データ源**: `data/listening-response.json`（`lib/listening-response-questions.ts`）。レベル別に「音声で聞く英文 → 適切な応答を 4 択で選ぶ」形式。
- **サブタブ**: **List**（レベル選択で問題一覧・音声文のみ表示）、**Quiz**（出題開始）、**Wrong**（間違えた問題のみ復習。ローカルストレージ `study-wrong-answers` に保存）。
- **流れ**: レベル選択 → List で一覧確認 or Quiz で 1 問ずつ出題。音声再生（TTS）→ 4 選択肢から回答。正誤表示後、Wrong に記録する場合はローカルに追加。

---

## 8. Profile タブ

- **表示**: アバター、表示名、国、ランク（Tier: Pawn〜King）、Provisional バッジ、称号（World GrandMaster / National GM）、Rating / World Rank / Wins / Losses / Win rate / Total matches。モード別（4択 / ディクテーション / リスニング / Overall）の Rating・Rank。
- **編集**: 「Edit」→ `/edit-profile`。表示名・アバター・国を変更し Firestore `users` と Auth `updateProfile` で保存。
- **フレンド**: **Your friend code**（6 桁、`getOrCreateFriendCode` で取得、コピー可能）。**Add by code** で他ユーザーの 6 桁コードを入力 → `lookupByFriendCode` で検索 → `addFriend` でフレンド追加。フレンド一覧から「Remove」で `removeFriend`。
- **ランク未設定時**: 「Recompute ranks」ボタンで Cloud Function `recomputeRanks` を実行し、全ユーザーの `rank` / `titles` を再計算（開発・運用用）。
- **未ログイン時**: 「No account」＋「Create account」で `/login` へ。

---

## 9. Cloud Functions（バックエンド）

| 関数名 | 役割 |
|--------|------|
| `createMatch` | AI / 友達対戦のマッチ作成。問題取得（レベル絞り）、AI の場合は即 playing、友達の場合は roomCode 発行。 |
| `joinFriendMatch` | 6 桁 roomCode で waiting マッチを検索し、players.B に参加者を設定して playing に。 |
| `submitAnswer` | 回答受信・正誤判定・スコア/ライフ更新。AI の場合は AI 回答も同時に書き込み。ランクマの forfeit 判定。両者回答後に次の問題へ or 試合終了。 |
| `getQuestionForMatch` | マッチの現在問題を返す（Firestore + アプリ内問題 ID 対応）。 |
| `recordMatchComplete` | マッチ完了時の記録（統計・履歴用）。 |
| `incrementTodayDictation` | Study の「今日のディクテーション」カウント用。 |
| `getOrCreateFriendCode` | ユーザーの 6 桁フレンドコードを取得 or 新規発行。 |
| `lookupByFriendCode` | フレンドコードでユーザー検索。 |
| `addFriend` | フレンド追加。 |
| `removeFriend` | フレンド削除。 |
| `finalizeMatch` | 手動でマッチを finished にし、ランクマの場合は Elo と勝敗数を更新。 |
| `claimForfeit` | 相手の時間切れ時に Forfeit を申請し、試合を終了。 |
| `findRankedMatch` | ランクマッチ検索 or 新規作成。レート ±200 でマッチング。出題レベルは `ratingToToeicLevel`。 |
| `setMatchReady` | ランクマッチでマッチング成立時の準備完了（両者 ready で次へ）。 |
| `startGameCountdown` | カウントダウン開始（gameStartsAt 等を設定）。 |
| `continuePhaseResult` | GrandMaster（overall）のフェーズ結果を dismiss し、次フェーズ開始時刻を設定。 |
| `recomputeRanks` | 全ユーザーの rating 順で tier / percentile / globalRank / countryRank / globalGM / nationalGM を再計算し `users` に書き込み。 |

---

## 10. 問題データ・語彙

### 10.1 4択問題（Firestore `questions`）

- **スキーマ**: `lang`, `exam`, `level`（1–10）, `prompt`, `choices`（4要素）, `answerIndex`, `explanation`。ほか `type`（cloze/reading）, `passage`, `active`, `qualityStatus` 等。
- **出題条件**: `active !== false` かつ `qualityStatus === 'ok'`。読解は `passage` 必須。
- **レベル**: テンプレートから生成した問題は `scripts/assign-template-levels.js` で CEFR/選択肢に基づき level 1–10 を付与。バックエンドの `getLevelRange(toeicLevel)` で TOEIC 帯に対応する level 範囲に絞って出題。
- **投入**: `node scripts/add-sample-questions.js`（`--emulator` でエミュレータ向け）。`scripts/question-bank.js` と `template-levels.json` でレベル付きテンプレートから生成。

### 10.2 ディクテーション語彙（Study 専用）

- **ファイル**: `data/dictation-vocab.json`。キー `"1"`〜`"10"`、値は `{ word, definition }[]`（または従来の `string[]`、正規化で吸収）。
- **ビルド**: `node scripts/build-dictation-vocab.js`。EVP から取得し CEFR→レベル 1–10 に割り当て、レベルあたり 100 語。`--with-definitions` で英英定義を取得。
- **対戦内ディクテーション**: 対戦では Firestore の `questions` の `choices[answerIndex]` が正解単語。Study のディクテーションとはデータソースが異なる。

---

## 11. レベル・難易度対応

- **TOEIC レベル**: 400, 600, 730, 860, 990。
- **CEFR 表示**: Elementary (A2), Intermediate (B1), Upper-Intermediate (B2), Advanced (C1), Proficiency (C2)。`lib/levels.ts` の `LEVEL_DISPLAY`。
- **問題 level 1–10**: 400→[1,2], 600→[3,4], 730→[5,6], 860→[7,8], 990→[9,10]。`getLevelRangeForToeic` / バックエンド `getLevelRange`。

---

## 12. その他

- **整理仕様書**: 画面・機能の一覧は `docs/SPEC_画面と機能一覧.md` にまとめてあります。
- **エミュレータ**: 開発時は Firebase Auth/Firestore/Functions のエミュレータを使用。本番用の分岐は行わず、エミュレータ専用運用を想定した構成。
- **問題の正規化**: Firestore の `choices` がオブジェクトで返る場合に備え、`lib/question-utils.ts` の `normalizeQuestion` を match / result / study で使用。
- **UI 文言**: ランクマ「Ranked Match」、AI「Start vs AI」、友達「Create Friend Match」「Join Friend Match」、GrandMaster「GrandMaster」、Study 復習「Review wrong answers」、ディクテーション「Next word」、リスニングクイズ「Listening Quiz」など。

---

以上が、English Battle アプリの全機能の詳細まとめです。
