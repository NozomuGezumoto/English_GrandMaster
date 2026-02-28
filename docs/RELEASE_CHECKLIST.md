# リリース前チェックリスト

## 必須（本番リリース前に必ず実施）

### 1. エミュレータ無効化
- **現状**: `app.json` の `extra.useEmulator` が **true** のままです。
- **対応**: 本番ビルドでは **必ず false にすること**。  
  - 方法A: リリース用ビルドの直前に `app.json` の `"useEmulator": true` を `false` に変更。  
  - 方法B: `app.config.js` に切り替え、`process.env.EXPO_PUBLIC_USE_EMULATOR !== 'true'` のときは `useEmulator: false` を返すようにする（推奨）。  
- 本番で `useEmulator: true` のままにすると、アプリがローカルエミュレータへ接続しようとして本番 Firebase に繋がりません。

### 2. Firebase 本番プロジェクト
- `app.json` の `extra.firebase`（projectId, apiKey 等）が **本番用 Firebase プロジェクト** を指していることを確認。
- Firebase Console で Authentication（メール/パスワード）、Firestore、Functions が有効で、本番の請求・クォータが許容範囲であることを確認。

### 3. Cloud Functions のデプロイ
- `firebase deploy --only functions` で本番にデプロイ済みであること。
- 必要な Callable がすべて有効であること（createMatch, joinFriendMatch, submitAnswer, findRankedMatch, setMatchReady, startGameCountdown, continuePhaseResult, claimForfeit, getQuestionForMatch, recordMatchComplete, getOrCreateFriendCode, sendFriendRequest, approveFriendRequest, rejectFriendRequest, createUserDocument 等）。

---

## データベース・セキュリティ（確認済み）

### Firestore ルール
- **questions**: 全員読み取り可、書き込みは不可（Functions 経由のみ）。✓
- **matches**: 参加者（players.A または B）のみ読み取り可、create は認証済みのみ、update は不可（Functions 経由のみ）。✓
- **users**: 読み取りは全員可（表示名・レート等）、書き込みは自分のドキュメントのみ。✓
- **friendRequests**: 自分が fromUid または toUid のもののみ読み取り可、書き込みは不可（Functions 経由のみ）。✓

### Firestore インデックス
- **friendRequests**: `toUid` ASC, `status` ASC（受信リクエスト一覧用）。✓
- **matches**:  
  - `status`, `players.A`, `createdAt` DESC（プロフィール戦績：A のマッチ一覧）。✓  
  - `status`, `players.B`, `createdAt` DESC（プロフィール戦績：B のマッチ一覧）。✓  
  - `mode`, `status`, `lang`, `questionType`（ランクマッチ検索用）。✓  
- 本番で未デプロイの場合は `firebase deploy --only firestore:indexes` でデプロイ。

### Firestore ルールのデプロイ
- `firebase deploy --only firestore:rules` で本番に反映されていること。

---

## 機能まわり（動作確認の目安）

| 項目 | 内容 |
|------|------|
| 対戦 | ランクマッチ・AI対戦・フレンドマッチの作成・参加・対戦・結果まで一通り動作 |
| 各セクションの学習 | 4択・ディクテーション・リスニングの学習・間違い復習が動作 |
| レート | ランクマッチ終了時にレート変動・勝敗記録が反映される |
| プロフィール | 戦績（完了マッチ一覧）・表示名・レート表示が正しい |
| 友達機能 | フレンドコード・リクエスト送信・承認/拒否・一覧・Remove が動作 |
| 認証 | メール登録・サインイン・パスワードリセット・ログアウトが動作（本番では createUserDocument 経由でユーザードキュメント作成） |

---

## その他

- **API キー**: Firebase のクライアント用 apiKey は app.json に含めて問題ありません。本番では Firebase Console の「アプリの認証」でドメイン・アプリ ID を制限しておくとよいです。
- **環境変数**: 本番ビルドで `useEmulator` を false にするために、環境変数（例: `EXPO_PUBLIC_USE_EMULATOR`）を使う場合は、EAS Build や CI で設定することを推奨します。

---

**結論**: データベース・ルール・インデックスは問題ありません。**リリース前に `useEmulator` を本番で false にすること** と、本番 Firebase プロジェクト・Functions デプロイの確認を行えば、リリース可能な状態です。
