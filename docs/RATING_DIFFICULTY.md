# ランクマッチ：レートと出題難易度

## 仕様

レート（Elo）に応じて、出題される問題の **TOEIC 帯（難易度）** が変わります。

| レート範囲     | TOEIC 帯 | 問題 level (Firestore) | 目安 CEFR   |
|----------------|----------|-------------------------|-------------|
| 〜899          | 400      | 1–2                     | A2 Elementary |
| 900–1099       | 600      | 3–4                     | B1 Intermediate |
| 1100–1299      | 730      | 5–6                     | B2 Upper-Intermediate |
| 1300–1499      | 860      | 7–8                     | C1 Advanced |
| 1500〜         | 990      | 9–10                    | C2 Proficiency |

- **4択・ディクテーション・GrandMaster の 4択/ディクテーション**: サーバーが `getUserRating(uid, questionType)` → `ratingToToeicLevel(rating)` で TOEIC 帯を決め、`getRandomQuestions(..., toeicLevel)` でその level 範囲の問題を出題。
- **リスニングのみ / GrandMaster のリスニング**: クライアントが自分のレートから `ratingToToeicLevel` で TOEIC 帯を算出し、`getRandomListeningQuestionIds(toeicLevel, 10)` で問題 ID を生成してサーバーに送る。サーバーはその ID をそのまま使用。

実装箇所:
- サーバー: `functions/src/index.ts` の `ratingToToeicLevel`, `getLevelRange`, `getRandomQuestions`, `findRankedMatch`
- クライアント: `lib/levels.ts` の `ratingToToeicLevel`, `getLevelRangeForToeic` / `app/(tabs)/battle.tsx` の `ratingForLevel` → `toeicLevel` → `getRandomListeningQuestionIds`

## テスト方法（難易度が変わることの確認）

通常プレイではレートが 900–1100 付近に収まりやすいため、**常に 600 帯** になりがちです。難易度の切り替わりを確認するには、次のいずれかが有効です。

### 1. Firestore でレートを一時変更する（手軽）

1. Firebase Console（またはエミュレータの Firestore UI）で `users/<自分のuid>` を開く。
2. ランクマで使うレートを一時的に変更する:
   - **4択**: `ratingChoice` を 1200 → 730 帯、850 → 860 帯 など
   - **リスニング**: `ratingListening`
   - **ディクテーション**: `ratingDictation`
   - **GrandMaster**: `ratingOverall` または `rating`
3. その状態でランクマッチを開始し、出題される問題の難しさ（語彙・文の長さなど）が変わるか確認。
4. 確認後、レートを元の値に戻す。

### 2. エミュレータのログで「レート → 難易度」を確認

ランクマッチで **新規マッチを作成したとき**（既存の待機マッチに参加した場合は出ない）、Functions のログに次のように出ます:

```
ランクマッチ出題難易度: { userRating: 1234, toeicLevel: 730, questionLevelRange: '5-6' }
```

- `userRating`: そのユーザーのレート
- `toeicLevel`: 上記表に従って決まった TOEIC 帯（400/600/730/860/990）
- `questionLevelRange`: Firestore の `question.level` で絞り込む範囲（1–10）

レートを変えてマッチを作り直すたびに、この 3 つが上記表どおりに変われば、レート→難易度の連動は正しく動いています。

### 3. 新規アカウントでレート帯を跨いでプレイ

- 初期レート 1000 → 600 帯。
- 連勝で 1100 超 → 730 帯に切り替わるタイミングを確認。
- 連敗で 900 未満 → 400 帯に切り替わるタイミングを確認。

問題バンクに level 1–2 / 5–6 / 7–8 などが十分に入っていれば、帯が変わる前後で「明らかに易しい／難しい」と体感できるはずです。

## 問題が足りない場合

`getRandomQuestions` は、指定した level 範囲で問題が足りないと **level ±1** に広げて補充します。それでも足りない場合は `Not enough questions for this level` でエラーになります。  
Firestore の `questions` コレクションで、`level` と `active === true`, `qualityStatus === 'ok'` の件数を各帯で確認するとよいです。
