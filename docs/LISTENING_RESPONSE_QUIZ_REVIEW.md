# Listening Response Quiz — 実装前レビュー

## コード・データを踏まえた結論

**指令の内容はそのまま実装可能で、方針も妥当です。** 以下の点だけ事前に揃えておくと安全です。

---

## 1. 良い点・そのままでよい点

- **Study 専用・ローカル JSON・PvP しない**  
  → 既存の match/createMatch/getQuestionForMatch に手を入れずに済む。
- **既存 `Question` の prompt / choices / answerIndex / level / explanation を流用**  
  → `normalizeQuestion` は `...q` で透過するので、`type` と `speechAct` を足すだけでよい。
- **speechAct を必須にして誤答品質を設計に組み込む**  
  → 今後の半自動生成（同 speechAct 避け・無関係1つなど）と相性が良い。
- **TTS は Expo Speech の流用**  
  → 既存の Dictation と同じで、追加依存なし。
- **promptVisibleAfterAnswer で回答後に prompt 表示**  
  → 既存の「間違った回答」の解説表示と UX が揃う。

---

## 2. データの分離（推奨）

**現状**

- `lib/study-questions.ts` は `data/corpus-questions.json` のみを参照し、`getQuestionsByLevel(level)` で **level だけ** でフィルタしている（`type` は見ていない）。
- その結果が「Review wrong answers」の **choice 一覧** に使われている。

**懸念**

- `listening_response` を同じ `corpus-questions.json` の同じ level キーに混ぜると、  
  「問題一覧」に **空欄補充とリスニング応答が混在** し、一覧で prompt をそのまま出したときに意図が分かりにくくなる。

**推奨**

- **リスニング用は別ファイルにする**
  - 例: `data/listening-response.json`（レベル別配列 or 単一配列で level フィールド）
- **読み込みも分ける**
  - 例: `getListeningResponseQuestions(toeicLevel)` を `lib/study-questions.ts`（または `lib/listening-response-questions.ts`）に追加し、**Listening Quiz のときだけ** それを読む。
- これで「既存の choice 一覧・間違った回答」は一切触らず、**既存構造を壊さない** ままにできる。

---

## 3. 型拡張の具体的な置き方

- **`QuestionDocType`**  
  `'cloze' | 'reading'` に **`'listening_response'`** を追加する。
- **`Question`**
  - `type?: QuestionDocType` のままでよい（既存は `cloze`/`reading`、新規は `listening_response`）。
  - 追加:
    - `speechAct?: SpeechActType`  
      （`listening_response` では必須だが、既存全問題には不要なので optional のままでよい）
    - `promptVisibleAfterAnswer?: boolean`  
      （指定がなければ「回答後に prompt 表示」でよいなら default true で実装してよい）
- **`SpeechActType`**  
  指令の列挙（`greeting` | `apology` | `suggestion` | ...）をユニオン型で定義する。

`normalizeQuestion` は `Record<string, unknown>` を広く受けているので、**中身を変えずに** 型定義だけ拡張すればよい。

---

## 4. Study UI の置き場所

- 現在: **タブ2本**  
  - 「Review wrong answers」（choice: list / 間違った回答）  
  - 「Dictation」
- 指令: **「Listening Quiz」を Study に追加**。

**案**

- **タブを 3 本にする**  
  - 「Review wrong answers」 / 「Dictation」 / **「Listening Quiz」**
- 「Listening Quiz」を押したときだけ、  
  レベル選択 → `getListeningResponseQuestions(level)` で取得 → 1問ずつクイズ（TTS → 4択 → 正誤 → prompt + explanation）に進む。

既存の `activeTab` が `'choice' | 'dictation'` なので、ここに `'listening_quiz'` を足す形で自然に拡張できる。

---

## 5. 出題フロー（1問ずつ）について

- 現在の Study の「choice」は **一覧** と **間違った回答の復習** だけで、**1問ずつ回答して次へ** というモードはない。
- Dictation は **1語ずつ TTS → 入力 → Next** の流れがある。

**Listening Quiz では**

- **Dictation に近い構成**でよい:  
  「1問表示 → 自動 TTS（+ 再生ボタン）→ 4択選択 → 正誤表示 → prompt + explanation 表示 → Next」。
-  state は「現在インデックス / 正答数 / 回答済みか」など、Dictation より少しシンプルでよい。

既存の choice 用スタイル（`questionCard`, `choicesContainer`, `explanationContainer` など）を流用し、**prompt の表示だけ**「回答前は非表示、回答後は表示」で切り替えればよい。

---

## 6. 誤答設計と speechAct（データ作成時）

- 指令の「同レベル帯・speechAct 異なる・無関係1つ」は **データ作成ルール** としてそのまま採用でよい。
- 今回 **10問を手で作る** なら、各問に `speechAct` を必ず付与し、誤答3つは手で「別 speechAct / 無関係」を意識して選べば、将来の半自動生成のテンプレートになる。
- JSON では **choices の並びはシャッフルしない**（保存時は正解が何番目かは `answerIndex` で持つ）。  
  アプリ側で「表示用に choices をシャッフルし、answerIndex を付け替える」か、または「表示時だけ並び替えて、正誤判定は元の answerIndex と選択インデックスの対応で行う」かのどちらかにするとよい（後者は実装が少しややこしくなるので、**シャッフルして answerIndex を更新** の方が扱いやすい）。

---

## 7. 実装順序の確認

指令の優先順位で問題ない:

1. **型拡張**（`QuestionDocType`, `Question.speechAct`, `promptVisibleAfterAnswer`, `SpeechActType`）
2. **JSON データ**（`data/listening-response.json` に 10問、level 3–4、speechAct 付き）
3. **データ読み込み**（`getListeningResponseQuestions(toeicLevel)` など、Listening 専用）
4. **Study UI**（タブ「Listening Quiz」追加、レベル選択 → クイズ画面）
5. **出題フロー**（1問表示、TTS 自動再生 + 再生ボタン、4択、正誤、回答後に prompt + explanation）
6. （必要なら）**選択肢のシャッフル**（初回表示時に配列をシャッフルし answerIndex を更新）

---

## 8. まとめ

| 項目 | コメント |
|------|----------|
| 指令の実現可能性 | そのまま実装可能。 |
| データ分離 | 既存を壊さないため、**listening_response は別 JSON + 専用 getter** を推奨。 |
| 型 | `QuestionDocType` に `listening_response`、`Question` に `speechAct` と `promptVisibleAfterAnswer` を追加すれば足りる。 |
| UI | Study にタブ「Listening Quiz」を1本追加し、その中でレベル選択 → 1問ずつクイズ。 |
| 出題体験 | 既存の 4択・解説スタイルを流用し、**回答前は prompt 非表示＋TTS のみ** にすれば指令どおり。 |

この前提で進めれば、既存の choice / dictation / Firestore に影響を与えずに Listening Response Quiz だけを足せます。実装に進んでよい内容だと思います。
