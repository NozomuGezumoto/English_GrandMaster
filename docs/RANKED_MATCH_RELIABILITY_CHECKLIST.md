# ランクマッチ「信用に関わる炎上」対策 — 点検結果

実装方針は変えず、チェックリストに沿った点検結果のみ記載。**不足があれば「要対応」、満たしていれば「OK」、設計上許容している場合は「備考」で記載。**

---

## A. レート/勝敗の一貫性（最優先）

### A1) レート更新が「必ず1回だけ」実行されるか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| finalize が二重に走る経路 | **要対応** | **submitAnswer** で「両者回答済み＋試合終了」のとき、**両プレイヤーから同時に submitAnswer が飛ぶ**と、両方とも `matchRef.update({ status: 'finished', winnerUid })` のあと `finalizeMatchInternal` を呼ぶ可能性がある。**finalizeMatchInternal 内に「すでにレート処理済み」のガードが無い**ため、**レート・勝敗数が二重に加算される**リスクあり。 |
| “already finalized” のガード | **要対応** | **finalizeMatch**（Callable）は `status === 'finished'` なら早期 return しており OK。一方 **finalizeMatchInternal** の冒頭では、**status がすでに 'finished' かつレート処理済みか**を判定するフラグ（例: `ratingProcessed` や `ratedAt`）が無い。submitAnswer から複数回呼ばれた場合の二重実行を防げない。 |

**推奨（最小修正）**:  
`finalizeMatchInternal` の先頭で、**現行の match を get() で再取得**し、  
- `status !== 'playing'` かつ **レート更新済みフラグ**（例: match に `ratingProcessed: true` を書き込む）があれば **何もせず return**  
- そうでなければ従来どおり `status: 'finished'` 更新 → レート・勝敗更新 → **フラグ書き込み**  
とする。

---

### A2) 勝敗判定がクライアント主導になっていないか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 勝敗・レートは Functions のみで確定 | **OK** | 勝敗・レートは **submitAnswer**（ライフ/スコアから winner 算出）・**claimForfeit**（不戦勝）・**finalizeMatchInternal**（Elo・勝敗数）で確定。クライアントは **matches** の update 権限が無い（Firestore ルールで `allow update: if false`）。 |
| クライアントが勝敗を確定させる権限 | **OK** | クライアントは `submitAnswer`（自分の回答送信）と `claimForfeit`（25秒経過時の不戦勝申告）のみ。勝敗の「決定」はすべて Functions 内のロジック。 |

---

### A3) 引き分けの扱い

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 同点時に両者同じ結果 | **OK** | 4択はライフ同数・最終問題で同点なら `winnerUid = null`。ディクテーションもスコア同点なら同様。`finalizeMatchInternal` で `winnerUid === null` のとき `isDraw = true` で Elo 計算。 |
| 引き分け時のレート処理 | **OK** | `calculateEloRating` で `isDraw` のとき `actualScore = 0.5` で計算。両者とも同じロジックで更新。 |

---

## B. 切断・放置・タイムアウト

### B4) “切断した方が得” が成立しないか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 途中離脱で負け回避できないか | **OK** | 切断側は回答しない → 相手が **claimForfeit** で 25 秒経過後に不戦勝取得。match は `status: 'finished', winnerUid: 相手, forfeit: true` となり、切断側は負けとして記録。離脱で「負けを免れる」経路は無い。 |
| 相手が確実に勝ち/損しないか | **OK** | 不戦勝で相手が勝ち。レート・勝敗数は finalizeMatchInternal で更新。 |

---

### B5) タイムアウト処理の基準がサーバー時間か

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 端末時計に依存していないか | **OK** | **submitAnswer** 内の forfeit 判定は `answeredAt.toMillis()` と `questionStartMs`（Firestore の `startedAt` / `currentQuestionStartedAt`）を使用。**claimForfeit** は **Date.now()**（Cloud Functions サーバー時刻）と `questionStartMs` で 20+5 秒判定。いずれもサーバー側タイムスタンプ基準。 |
| 20+5 秒が両者に公平か | **OK** | 開始時刻は match ドキュメントの `startedAt` / `currentQuestionStartedAt` で一意。どちらが claim しても同じ閾値で判定。 |

---

### B6) 再接続時の挙動（iPhone Safari 等）

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| onSnapshot 復活で状態が壊れないか | **OK** | 問題番号・残り時間・回答済みはすべて **match ドキュメント** と **questions** の取得結果から算出。クライアントは「表示用の導出状態」のみ持つ。再接続で onSnapshot が再度発火すれば、同じ match 状態から再描画される。 |
| 復帰できない場合の案内＋戻る | **OK** | onSnapshot の **error コールバック** で「Connection Error」アラート＋「OK で戻る」を実装済み。認証切れ時は onAuthStateChanged で「Signed out」＋ホームへ。 |

---

## C. 同期ズレ

### C7) 両者に同じ questionIds / questionIndex が配られているか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 問題リストのズレ | **OK** | `questionIds` は **match 作成時** に Functions で 1 回だけ設定。両者とも同じ match を読むため同じリスト。 |
| 次問題へ進むトリガーが一意か | **OK** | 進めるのは **submitAnswer** 内のみ（「両者回答済み」のときの 1 秒後＋`currentQuestionIndex` 更新）。クライアントは更新を読むだけ。 |
| 二重インクリメントで問題が飛ぶか | **OK** | インデックス更新は 1 回の `matchRef.update`。両方の submitAnswer が同時に update しても、同じ `qIndex + 1` を書くだけなので飛びはしない。 |

---

### C8) 20秒+5秒の開始タイミング

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| サーバー起点の timestamp で整合 | **OK** | 開始時刻は `startedAt` / `currentQuestionStartedAt`（Firestore Timestamp）。forfeit 判定はサーバー側でこれらのみ使用。 |
| 表示ズレても判定はサーバー | **OK** | クライアントのタイマー表示は `questionStartTimeRef` 等でローカルに描画しているが、**採点・不戦勝判定はすべて Functions 内のサーバー時刻ベース**。 |

---

## D. チート耐性

### D9) 正解情報がクライアントから見えないか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| match / クライアント取得データに answerIndex が露出 | **要検討** | **match ドキュメント** には正解は含まれない（questionIds のみ）。ただし **問題表示** のため、クライアントは `questions/{questionId}` を get しており、**Question 型に answerIndex が含まれる**。そのため DevTools 等で「正解の選択肢」は見える。表示用に問題文・選択肢を配る以上、現状の設計では完全非露出は難しい。 |
| 推奨（将来） | 備考 | 厳密に隠すなら「問題文・選択肢のみ返す API/View」を用意し、answerIndex はサーバーだけが持つ形にする必要あり。現状は「表示と正解判定のためクライアントも question を読む」設計。 |

---

### D10) 回答の改ざんが通らないか

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 別の choiceIndex / あり得ない qIndex を弾けるか | **OK** | **submitAnswer** で実施済み: (1) `qIndex` は number かつ ≥0（ただし `qIndex < questionIds.length` の明示チェックは無く、存在しない questionId で get が失敗して「問題が見つかりませんでした」で弾かれる）、(2) choiceIndex は 0〜3 または 999（タイムアウト）、(3) **既に回答済み** なら `failed-precondition` で拒否。 |
| 問題ID一致・二重回答禁止 | **OK** | 正誤は **matchData.questionIds[qIndex]** で取った questionId のドキュメントで判定。二重回答は上記の「既に回答済み」チェックで禁止。 |

**任意の最小強化**: `qIndex >= matchData.questionIds.length` のときは「無効な qIndex」で弾くようにするとより明確。

---

## E. 例外系

### E11) onSnapshot error / permission-denied / not-found の UI

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| 真っ白/無限ローディングにならないか | **OK** | onSnapshot の **第3引数で error ハンドラ** を実装済み。`setLoading(false)` ＋ アラート ＋ OK で `router.back()`。 |
| 再試行/戻るが必ずあるか | **OK** | 「OK で戻る」で確実に戻れる。 |

---

### E12) matchId 欠損 / 不正 URL

| 確認項目 | 結果 | 詳細 |
|----------|------|------|
| /match/undefined, /result/undefined で落ちないか | **OK** | Battle で **matchId 検証** 済み。match/result で **!id** のとき「Invalid match」＋戻るボタン表示。 |
| Battle へ戻す＋メッセージ | **OK** | 上記の invalid 表示と、onSnapshot error 時のアラートで対応。 |

---

## F. 実戦テスト（手順のみ・コード変更なし）

| # | 手順 | 確認したいこと |
|---|------|----------------|
| 13-1 | 2 端末で同時に Ranked を 10 回 | マッチングが毎回 1 本に決まり、両方とも同じ match に入るか |
| 13-2 | 片方だけ回答し続け、片方放置 | タイムアウト→不戦勝で相手勝ちになるか、レートが変動するか |
| 13-3 | 負けそうな側がタブ閉じ/アプリ終了 | 相手が不戦勝を取れ、離脱側が負けになるか |
| 13-4 | 途中で回線 OFF→ON | 復帰後も問題番号・回答状況が一致しているか／エラー時は案内＋戻るか |
| 13-5 | iPhone Safari でリロード | 同様に状態が壊れないか／エラー時は案内＋戻るか |

---

## まとめ：要対応と推奨（最小修正）

| 優先度 | 項目 | 内容 |
|--------|------|------|
| **最優先** | A1 二重 finalize 防止 | **finalizeMatchInternal** で「レート更新を 1 回だけ」にするガードを追加。例: match に **ratingProcessed**（または **ratedAt**）を用意し、処理前に get() で確認→既に true なら return。処理後に true を書き込む。 |
| 推奨 | D10 qIndex 範囲 | **submitAnswer** で `qIndex >= matchData.questionIds.length` を明示的に弾く。 |
| 検討 | D9 正解の露出 | 現状は question をそのまま読むため answerIndex はクライアントから見える。隠す場合は「問題文・選択肢だけ返す」API/View の検討。 |

**変更はまだ行わず、上記の「要対応」「推奨」を実装するフェーズで最小修正を加える想定。**
