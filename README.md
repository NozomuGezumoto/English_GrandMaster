# English Battle - TOEIC対戦アプリ

英語学習PvPアプリ。TOEIC形式の問題でAIや友達と対戦できます。

## 技術スタック

- **フロントエンド**: React Native (Expo) + TypeScript
- **バックエンド**: Firebase (Firestore + Cloud Functions)
- **ルーティング**: Expo Router

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
cd functions
npm install
cd ..
```

### 2. Firebase設定

詳細は `FIREBASE_SETUP.md` を参照してください。

**簡易手順:**

1. Firebaseプロジェクトを作成
2. Webアプリを追加して設定情報を取得
3. `app.json`の`extra`セクションに設定値を入力：

```json
{
  "expo": {
    ...
    "extra": {
      "firebaseApiKey": "YOUR_API_KEY",
      "firebaseAuthDomain": "YOUR_PROJECT.firebaseapp.com",
      "firebaseProjectId": "YOUR_PROJECT_ID",
      "firebaseStorageBucket": "YOUR_PROJECT.appspot.com",
      "firebaseMessagingSenderId": "YOUR_SENDER_ID",
      "firebaseAppId": "YOUR_APP_ID"
    }
  }
}
```

4. Firebase CLIでログイン：

```bash
firebase login
firebase use --add
```

### 3. Firestoreセキュリティルールのデプロイ

```bash
firebase deploy --only firestore:rules
```

### 4. Cloud Functionsのデプロイ

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

### 5. 問題データのインポート（1000問でアプリを使う）

**実行場所:** 以下のコマンドはすべて **プロジェクトルート**（`English_Battle/`、`package.json` がある階層）で実行してください。

```
English_Battle/          ← ここでターミナルを開く
├── package.json
├── seedEmulator.js
├── scripts/
│   ├── add-sample-questions.js
│   └── question-bank.js
└── serviceAccountKey.json   （本番用はここに配置）
```

アプリは Cloud Functions 経由で Firestore の `questions` コレクションから問題を取得します。**ここで1000問を投入しないと、対戦で問題が足りません。**

| 使う環境 | 手順 |
|----------|------|
| **本番（クラウド）** | 1. ルートに `serviceAccountKey.json` を配置<br>2. **ルートで** `npm run add-questions` を1回実行 → 1000問が本番 Firestore に追加される |
| **ローカル（エミュレータ）** | 1. **ルートで** `firebase emulators:start --only functions,firestore,auth` でエミュレータ起動<br>2. 別ターミナルで **ルートに移動して** `node seedEmulator.js` → 1000問がエミュレータに追加される |

どちらも問題の元データは `scripts/question-bank.js` 共通（レベル1〜10で各100問）。一度投入すれば、アプリのレベル選択（400/600/730/860/990）に応じて自動で適切な問題が選ばれます。

**反映の流れ:**  
`question-bank.js`（1000問） → スクリプトで Firestore に投入 → Cloud Functions の `getRandomQuestions` がレベル範囲で取得 → アプリの対戦で出題

### 6. アプリの起動

```bash
npm start
```

## 機能

### MVP機能

- ✅ AI対戦（疑似PvP）
- ✅ 友達対戦（ルームコード）
- ✅ 問題表示・回答・採点
- ✅ 結果表示・復習

### 後回し

- ランクマッチ（Eloレート）
- 複数人対戦
- 観戦機能
- 統計・履歴

## ディレクトリ構成

```
English_Battle/
├── app/                    # Expo Router
│   ├── (tabs)/
│   ├── match/[id].tsx      # 対戦画面
│   ├── result/[id].tsx     # 結果画面
│   └── index.tsx           # ホーム画面
├── functions/              # Cloud Functions
│   ├── src/
│   │   └── index.ts        # Functions実装
│   └── package.json
├── types/                  # 共通型定義
│   └── firestore.ts
├── lib/                    # 共通ユーティリティ
│   └── firebase.ts
├── DESIGN.md              # 設計書
└── package.json
```

## 開発

詳細な設計は `DESIGN.md` を参照してください。

