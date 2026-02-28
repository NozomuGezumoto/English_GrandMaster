# Firebase設定ガイド

## 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `english-battle`）
4. Google Analyticsは任意（オフでも可）
5. プロジェクトを作成

## 2. Webアプリの追加

1. Firebase Consoleでプロジェクトを開く
2. プロジェクトの設定（⚙️アイコン）をクリック
3. 「マイアプリ」セクションで「</>」アイコン（Web）をクリック
4. アプリのニックネームを入力（例: `English Battle Web`）
5. 「このアプリのFirebase Hostingも設定します」はチェック不要
6. 「アプリを登録」をクリック

## 3. 設定情報の取得

登録後、以下のような設定情報が表示されます：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## 4. app.jsonの更新

`app.json`の`extra`セクションに上記の値を設定してください：

```json
{
  "expo": {
    ...
    "extra": {
      "firebaseApiKey": "AIzaSy...",
      "firebaseAuthDomain": "your-project.firebaseapp.com",
      "firebaseProjectId": "your-project-id",
      "firebaseStorageBucket": "your-project.appspot.com",
      "firebaseMessagingSenderId": "123456789",
      "firebaseAppId": "1:123456789:web:abcdef"
    }
  }
}
```

## 5. Firebase Authenticationの設定

1. Firebase Consoleで「Authentication」を開く
2. 「始める」をクリック
3. 「Sign-in method」タブを開く
4. 「匿名」を有効にする（Anonymous）
   - 「匿名」をクリック
   - 「有効にする」をトグル
   - 「保存」をクリック

## 6. Firestore Databaseの作成

1. Firebase Consoleで「Firestore Database」を開く
2. 「データベースを作成」をクリック
3. セキュリティルールを選択：
   - **開発モード**: テスト用（30日間のみ）
   - **本番モード**: セキュリティルールを適用（推奨）
4. ロケーションを選択（例: `asia-northeast1` - 東京）
5. 「有効にする」をクリック

## 7. Firestoreセキュリティルールのデプロイ

```bash
firebase deploy --only firestore:rules
```

## 8. Cloud Functionsのセットアップ

1. Firebase Consoleで「Functions」を開く
2. 「始める」をクリック
3. 料金プランを確認（Blazeプランが必要）

### Functionsのデプロイ

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

## 9. 問題データの追加

Firestore Consoleで`questions`コレクションを作成し、以下の形式でデータを追加：

```json
{
  "lang": "en",
  "exam": "toeic",
  "level": 5,
  "prompt": "Choose the correct answer.",
  "choices": [
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "answerIndex": 0,
  "explanation": "This is the correct answer because..."
}
```

### サンプル問題の追加方法

1. Firestore Consoleで「データ」タブを開く
2. 「コレクションを開始」をクリック
3. コレクションID: `questions`
4. ドキュメントID: 自動生成
5. フィールドを追加（上記の形式に従う）

## 10. 動作確認

1. アプリを起動：
   ```bash
   npm start
   ```

2. エミュレータまたは実機でテスト
3. 「AI対戦開始」をクリックして動作確認

## トラブルシューティング

### エラー: "Firebase: Error (auth/configuration-not-found)"
- `app.json`の`extra`セクションが正しく設定されているか確認
- アプリを再起動（`npm start`）

### エラー: "Permission denied"
- Firestoreセキュリティルールが正しくデプロイされているか確認
- Authenticationが有効になっているか確認

### Functionsが動作しない
- Functionsがデプロイされているか確認
- Firebase ConsoleのFunctionsタブでログを確認




