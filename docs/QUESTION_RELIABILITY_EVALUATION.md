# 問題の信頼性向上提案 — 妥当性評価

変更は行わず、ChatGPT 提案の妥当性のみ評価する。

---

## 1) スキーマ拡張（type, passage, source, active, qualityStatus, qaNotes）

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 妥当 |
| **理由** | 現状の `Question` は `lang, exam, level, prompt, choices, answerIndex, explanation` のみ。`type`（cloze/reading）で出題可否を分けられ、`passage` の有無で読解系を制御できる。`active` + `qualityStatus === "ok"` で出題対象を明示するのは運用しやすい。既存ドキュメントは新フィールドを省略可能にすれば互換は保てる。 |
| **注意** | `types/firestore.ts` の `Question` 型と、Functions の取得クエリ（`.where('active','==',true)` 等）の追加が必要。 |

---

## 2) 問題バリデータ（scripts/validate-questions.js）

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 妥当 |
| **理由** | choices 4つ・answerIndex 0–3・正答が空でない・空欄文の簡易チェックは必須。reading 系で passage なしなら fail は (1) のルールと一貫。NG 表現（eligible to renewal, held at Monday, on yesterday）や不可算（feedbacks）のルールベース検出は、現状のテンプレ誤りを防ぐのに有効。`--fix` で qualityStatus を "needs_fix" にする運用も現実的。 |
| **注意** | バリデータが Firestore を読む場合は、本番/エミュレータの切り替え（環境変数）か、読み取り対象を「ローカルで生成した JSON/配列」に限定する設計のどちらかにすると安全。 |

---

## 3) question-bank.js の致命バグ修正

コードベースで該当箇所を確認済み。

| バグ | 現状 | 評価 |
|------|------|------|
| **Level2: The [A] will be held _____ [B].** | [B]=Monday, Tuesday, next week, this afternoon... / choices=`['in','on','at','by']` / **answerIndex=2（"at"）**。説明文も "at" を正解としている。 | ✅ 指摘どおり誤り。曜日は "on Monday"。**修正案どおり**、choices の順序を維持するなら answer を "on"（index 1）にするか、[B] を 3 p.m., 10 a.m., noon 等に寄せて "at" を正解にするかのどちらかが必要。 |
| **Level2: We received your [A] _____ [B].** | [B]=yesterday, last week, recently（コードは "recently"  typo）, on time, safely, intact... / 前置詞4択。 | ✅ 指摘どおり不整合。「We received your order yesterday」は前置詞なし。このテンプレは**削除 or [B] を曜日/日付のみ（on Monday 等）に限定**するのが妥当。 |
| **Level7: eligible to renewal** | 現状: `The agreement is _____ to renewal next year.` / 正答="eligible" → 文は "eligible **to** renewal"。 | ✅ 文法的に誤り。正しくは "eligible **for** renewal"。**prompt を "for renewal" に変更**し、正答は "eligible" のままが妥当。 |
| **Level5/6/8: 本文なし読解系** | 「What is the main purpose of the email?」「According to the passage, what is the primary concern?」「Which of the following is NOT mentioned in the article?」が passage なしで存在。 | ✅ 指摘どおり。本文なしで出題するのは不適切。**type="reading" + passage 必須**とし、本文未整備の間は **qualityStatus="blocked"** で出題除外とする方針は妥当。 |

---

## 4) Seeder / インポート時のバリデーション強制

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 妥当 |
| **理由** | `add-sample-questions.js` と `seedEmulator.js` で、Firestore に書き込む前に `validateQuestion(q)` を通し、fail 時は投入しないか qualityStatus="needs_fix" で隔離するのは、壊れた問題の混入を防げる。 |
| **注意** | 既存 Firestore にすでに入っている問題は、別途「既存データ用バリデーション＋一括更新」スクリプトか、手動で blocked/needs_fix を付与する運用が必要。 |

---

## 5) 出題ロジックの保険（level±1、足りなければエラー）

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 妥当 |
| **理由** | 現状の `getRandomQuestions` は `active`/`qualityStatus` を見ておらず、level の fallback もない。**qualityStatus は緩めず**、必要数取れない場合は level±1 で補充、それでも足りなければマッチ開始前にエラーを返す方針は、無理に出題するより安全。 |
| **注意** | Firestore のクエリに `.where('active','==',true).where('qualityStatus','==','ok')` を追加し、reading の場合は `passage` が存在するドキュメントに限定する必要がある。複合クエリはインデックスが必要になる可能性あり。 |

---

## 6) コマンド整備（package.json）

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 妥当 |
| **理由** | `validate:questions` と `seed:questions` の追加は運用しやすい。現状は `add-questions` のみなので、`seed:questions` を `add-questions` のエイリアスにするか、どちらか一方に統一するかは好みでよい。 |

---

## 7) CI（PR で validate 必須）

| 項目 | 評価 |
|------|------|
| **妥当性** | ✅ 任意として妥当 |
| **理由** | バリデータが「Firestore 接続なしで、生成される問題配列だけを検証する」形にすれば、CI で `npm run validate:questions` を回してマージ可否に使うのは現実的。 |

---

## 総合判定

- **実施してよい提案**：1〜6 および 7（任意）はいずれも妥当で、現状のバグ（Level2 の2テンプレ、Level7 の eligible、読解系の本文なし）とも一致している。
- **優先順位の目安**：  
  - 最優先：**(3) question-bank.js の致命バグ修正**（誤った問題の混入を止める）。  
  - 次：(1) スキーマ拡張と (5) 出題ロジックの条件追加（読解系のブロックと active/quality の適用）。  
  - その後：(2) バリデータ作成、(4) シード時のバリデーション、(6) コマンド整備。

---

## 補足：現状コードで確認した具体箇所

- **question-bank.js**
  - L182–189: Level2 "held _____ [B]" → answerIndex 2（at）、[B] に Monday 等。要修正。
  - L212–219: Level2 "We received your [A] _____ [B]" → [B] に yesterday, recently 等。要削除 or [B] 限定。
  - L479: Level7 "eligible to renewal" → prompt を "for renewal" に変更。
  - L451, L464, L491: 読解系（email/passage/article）→ type=reading + passage 必須化、未整備時は blocked 推奨。
- **functions/src/index.ts**  
  - `getRandomQuestions`: 現状は lang, exam のみでフィルタ。active / qualityStatus / reading 時の passage 有無の条件が未実装。

以上を踏まえ、提案どおり進めて問題ないと判断できる。
