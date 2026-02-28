# ランクマッチ関連で対応したエラーと対応方法

ランクマッチ（およびマッチ画面・結果画面）で発生しうるエラーと、実施した対応の一覧です。

---

## 1. マッチングがかみ合わない（PC と携帯で同時に押したとき）

| 項目 | 内容 |
|------|------|
| **現象** | 両端末で「Ranked Match」をほぼ同時に押すと、マッチングせず両方とも「Finding an opponent...」のままになる、または片方だけ別マッチに入る。 |
| **原因** | ① **二重参加**: 同じ待機マッチに 2 人が同時に `update` で参加してしまう。② **両方とも新規作成**: 両端のクエリがほぼ同時で、相手の「待機マッチ」がまだ見えず、どちらも「待機マッチなし」と判断して新規作成してしまう。 |
| **対応** | **Cloud Functions**（`findRankedMatch`）:<br>• **参加時はトランザクション**: 待機マッチに参加するとき `db.runTransaction` 内で、そのドキュメントを `get` → `status === 'waiting'` かつ `players.B` が空であることを確認 → 条件を満たすときだけ `update`。これで「同じ待機マッチに 2 人が同時に入る」ことを防止。<br>• **新規作成前に再検索**: 1 回目の検索で参加できるマッチがなかった場合、**500ms 待ってから**もう一度だけ同じ条件でクエリ。見つかった待機マッチに上記トランザクションで参加。これで「両方とも同時に新規作成」になるケースを削減。 |
| **対象ファイル** | `functions/src/index.ts`（`findRankedMatch`） |

---

## 2. 1 問目だけ 1 秒クールタイムが効き、2 問目以降効かない

| 項目 | 内容 |
|------|------|
| **現象** | 正解・不正解後の 1 秒クールタイムが、1 問目→2 問目への遷移では感じられるが、2 問目→3 問目以降ではほとんど待たずに次へ進んでしまう。 |
| **原因** | サーバー側では全問題で 1 秒待ってから `currentQuestionIndex` を更新しているが、クライアントがその更新を早く受け取るなどして、2 問目以降は結果表示が短く感じられる。 |
| **対応** | **クライアント側で最低 1 秒を保証**:<br>• 両者が回答済みになった時刻を `bothAnsweredAtRef` に記録（1 問につき 1 回）。<br>• `currentQuestionIndex` が増えて「次問題を表示する」とき、`Date.now() - bothAnsweredAtRef` が 1 秒未満なら、残り時間だけ `setTimeout` で遅延してから次の問題を取得・表示。<br>• これで「両者回答済み」から最低 1 秒は結果が表示される。 |
| **対象ファイル** | `app/match/[id].tsx`（onSnapshot 内の次問題ロード処理、`bothAnsweredAtRef` / `cooldownTimeoutRef`） |

---

## 3. マッチ画面の Firestore リスナーエラーで Loading のままになる

| 項目 | 内容 |
|------|------|
| **現象** | 権限エラーやネット切断などで `onSnapshot` がエラーになると、画面が「Loading...」のまま抜けられない。 |
| **原因** | `onSnapshot(ref, onNext)` のみで、第 3 引数の **エラーコールバック** を渡していなかった。 |
| **対応** | `onSnapshot(matchRef, onNext, onError)` の **onError** を追加:<br>• `setLoading(false)`<br>• アラート「Connection Error」＋「Check your network and try again.»<br>• OK で `router.back()` |
| **対象ファイル** | `app/match/[id].tsx`（マッチドキュメントの onSnapshot） |

---

## 4. findRankedMatch のレスポンスに matchId が無いときに /match/undefined へ飛ぶ

| 項目 | 内容 |
|------|------|
| **現象** | バックエンドの不具合や不正なレスポンスで `matchId` が返ってこない場合、`router.push(\`/match/${matchId}\`)` で `/match/undefined` に遷移してしまう。 |
| **原因** | レスポンスの `matchId` を検証せずにナビゲートしていた。 |
| **対応** | `findRankedMatch` の結果で `matchId` をチェック:<br>• `!matchId || typeof matchId !== 'string'` のときはアラート「Could not start match. Please try again.» を表示し、`router.push` しない。<br>• 同様に、AI 対戦・友達対戦の create/join でも `matchId`（および友達の `roomCode`）が無い場合はアラート表示のみとし、遷移しない。 |
| **対象ファイル** | `app/(tabs)/battle.tsx`（`startRankedMatch`、`createMatch`、`createFriendMatch`、`joinFriendMatch`） |

---

## 5. 不正な URL（/match/ や /result/ で id なし）で無限ローディング

| 項目 | 内容 |
|------|------|
| **現象** | `/match/` や `/result/` のように `id` が無い状態でアクセスすると、ローディング表示のまま抜けられない。 |
| **原因** | `!id` のときは `useEffect` 内で早期 return しており、`setLoading(false)` が呼ばれない（結果画面）。また、マッチ画面では「Invalid match」の表示が無かった。 |
| **対応** | **結果画面** (`/result/[id]`):<br>• `!id` のときは `setLoading(false)` を実行。<br>• 表示で `!id` のときは「Invalid match」＋「Back to Home」ボタンを表示。<br>**マッチ画面** (`/match/[id]`):<br>• `!id` のときは「Invalid match」＋「Back」ボタンを表示（その場合もローディングは解除される）。 |
| **対象ファイル** | `app/result/[id].tsx`、`app/match/[id].tsx` |

---

## 6. マッチ中にログアウト・認証切れになったときの挙動

| 項目 | 内容 |
|------|------|
| **現象** | マッチ画面で別タブなどからログアウトしたり、トークン期限切れになると、Firestore の権限エラーで onSnapshot が失敗し、ユーザーが状況を理解しづらい。 |
| **原因** | 認証が無効になったことを検知して、明示的にホームへ戻す処理が無かった。 |
| **対応** | マッチ画面で **onAuthStateChanged** を購読:<br>• `user` が `null` になったらアラート「Signed out」＋「You have been signed out. Returning to home.»<br>• OK で `router.replace('/(tabs)/battle')` |
| **対象ファイル** | `app/match/[id].tsx` |

---

## 7. 「Finding an opponent...」画面が白い（テーマ未適用）

| 項目 | 内容 |
|------|------|
| **現象** | ランクマッチ待機中（および友達対戦待機中）の画面が白背景のままで、他画面のダークテーマと不揃い。 |
| **原因** | マッチ画面（`/match/[id]`）のスタイルが `#fff` 等のハードコードで、`lib/theme` の `COLORS` を参照していなかった。 |
| **対応** | マッチ画面全体で `COLORS` を利用:<br>• `container` の背景を `COLORS.background`<br>• 待機テキストを `COLORS.gold` / `COLORS.muted`、スピナーを `COLORS.gold`<br>• その他、対戦中・結果表示・ディクテーションなども同テーマに統一。 |
| **対象ファイル** | `app/match/[id].tsx`（StyleSheet と ActivityIndicator の色） |

---

## 8. その他（ランクマ以外だがマッチ画面で共通）

- **エラーバウンダリ**: 未捕捉の例外でアプリが落ちないよう、ルートで `ErrorBoundary` を導入。エラー時に「Try again」「Back to Home」を表示。
- **オフラインバナー**: オフライン時に画面上部に「オフラインです」を表示（`OfflineBanner`）。マッチ画面の onSnapshot エラーと合わせて、接続トラブルの気づきやすさを改善。

---

## まとめ

| # | 概要 | 主な対応 |
|---|------|----------|
| 1 | PC/携帯でマッチングがかみ合わない | 参加をトランザクション化、新規作成前に 500ms 待って再検索 |
| 2 | 2 問目以降 1 秒クールタイムが効かない | クライアントで「両者回答済み」から最低 1 秒経過してから次問題表示 |
| 3 | マッチ画面でリスナーエラー時に Loading のまま | onSnapshot の onError でアラート＋戻る |
| 4 | matchId なしで /match/undefined に飛ぶ | レスポンスの matchId 検証、無ければアラートのみ |
| 5 | id なしで無限ローディング | !id 時に「Invalid match」＋戻るボタン、結果画面で setLoading(false) |
| 6 | マッチ中のログアウト・認証切れ | onAuthStateChanged で null 検知しアラート＋ホームへ |
| 7 | 待機画面が白い | マッチ画面全体を COLORS（ダークテーマ）に統一 |
