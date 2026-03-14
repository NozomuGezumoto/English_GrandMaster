# Study Time Tracking 機能 設計書（ローカル保存版）

## 前提

**保存は AsyncStorage のみ**。Firestore やクラウド同期は想定しない。

---

## 目的

- **日々の行動を促す**: Today / This week
- **長期努力を可視化する**: Total / Year review

---

## 1. データ構造（AsyncStorage）

### ストレージキー

```
@studyHistory
```

### 保存形式

```ts
// 日付 YYYY-MM-DD をキーとした Map
Record<string, StudyHistoryDay>

interface StudyHistoryDay {
  date: string;         // YYYY-MM-DD
  studySeconds: number; // その日の学習時間（秒）合計
  flashcards: number;   // フラッシュカード復習数
  dictation: number;    // ディクテーション解答数
  battles: number;      // 対戦数
}
```

### 例

```json
{
  "2026-03-14": {
    "date": "2026-03-14",
    "studySeconds": 170,
    "flashcards": 54,
    "dictation": 2,
    "battles": 0
  }
}
```

### 保持期間

- **Total / Year review** のために、古い日付も残す
- 上限は例えば **400日分**（1年 + 余裕）を想定
- 超過分は古い日付から削除

---

## 2. 既存実装との統合

### 現状

| データ | 保存先 | 備考 |
|--------|--------|------|
| 学習時間（秒） | study-time-today.ts | 14日分、モード別（AsyncStorage） |
| フラッシュカード数 | study-reviews-today.ts | 別管理（AsyncStorage） |
| battles, dictation | プロフィール表示用 | 各画面で集計 |

### 方針

1. **既存の study-time-today を拡張**  
   同じキーや別キーで、日付ごとの `studySeconds` + `flashcards` + `dictation` + `battles` を保存
2. **1つのストアに集約**  
   `@studyHistory` に日付単位で保持し、既存の `addStudyTimeToday` / `recordStudyReview` から更新
3. **battles の扱い**  
   対戦の学習時間を `addStudyTimeToday('battle')` で記録しているため、そのタイミングで `battles` も +1

---

## 3. 実装方針

### 3.1 書き込み

`addStudyTimeToday` / `recordStudyReview` 呼び出し時に、`@studyHistory` を更新する。

| モード | studySeconds | flashcards | dictation | battles |
|--------|--------------|------------|-----------|---------|
| flashcards | +elapsed | +1 | - | - |
| dictation | +elapsed | - | +1 | - |
| battle | +elapsed | - | - | +1 |
| choice / listening | +elapsed | - | - | - |

### 3.2 データ移行

- 既存の `@studyTimeToday` の日付分を `@studyHistory` に移行する処理を 1 回だけ実行
- 移行後も、しばらくは `@studyTimeToday` を残して互換性を維持（任意）

---

## 4. 表示ロジック

### Today

- 今日の日付キーの `studySeconds` を参照
- フォーマット: `< 60分 → Xm`, `>= 60分 → Xh Ym`

### This week

- 今日を含む直近 7 日分の `studySeconds` を合計

### Total study

- 全エントリの `studySeconds` を合計

### Year review（別画面）

- 指定年のエントリのみを抽出して集計
- Total study time, Total battles, Total flashcards, Total dictation
- Best study day = studySeconds 最大の日
- Highest rating = ユーザーデータから別途取得

---

## 5. UI 配置

### プロフィール画面（常時表示）

```
Today
  2m 50s

This week
  3h 20m

Total study
  62h
```

Today's learning カード内か、その直下に配置。

### Year review（別ページ）

- プロフィールに「Year review」ボタンを追加
- `/year-review` または `/profile/year-review` へ遷移
- 年選択 → 表示

---

## 6. フォーマット関数

```ts
function formatStudySeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}
```

---

## 7. 実装フェーズ

### Phase 1: AsyncStorage 基盤（ローカル）

1. `lib/study-history.ts` を作成
   - `incrementStudyHistory(mode, seconds, counts)` … AsyncStorage の `@studyHistory` を更新
   - `getTodayStudySeconds()` … 今日の秒数
   - `getWeekStudySeconds()` … 直近7日合計
   - `getTotalStudySeconds()` … 全期間合計
2. `addStudyTimeToday` / `recordStudyReview` 呼び出し時に `incrementStudyHistory` を呼ぶ

### Phase 2: プロフィール UI

1. Today / This week / Total study の表示を追加
2. 既存の「Time」表示と統合 or 併存の判断

### Phase 3: Year review

1. Year review 画面の作成
2. 年選択と集計ロジック

### Phase 4（将来）: 学習カレンダー

- Contribution Graph 風の表示
- クライアントで日ごとの studySeconds を色分け

---

## 8. オフライン・未ログイン時の扱い

- **全般的**: 保存は AsyncStorage のみのため、ログイン状態・オンライン状態に依存しない
- 常にローカルに読み書きし、他端末との同期も行わない

---

## 9. 既存コードとの整合

- **Today's learning カード**: 既存の Battles, W-L, Dictation, Flashcards, Time はそのまま
- **目標時間・進捗バー**: 既存の `study-time-today` と `@studyHistory` のどちらを表示に使うか、Phase 2 で統一する（同期して同一値になる設計ならどちらでも可）
