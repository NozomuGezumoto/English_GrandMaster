# ポート設定一覧（エミュレータ・開発）

開発時に使うポートを一覧にしています。**「port taken」が出た場合は、以下 3 ファイルの該当ポートをまとめて変更してください。**

## 一覧

| 用途 | ポート | 設定場所 |
|------|--------|----------|
| **Functions エミュレータ** | 5001 | `firebase.json` → `emulators.functions.port` |
| **Firestore エミュレータ** | 8080 | `firebase.json` → `emulators.firestore.port` |
| **Auth エミュレータ** | 9099 | `firebase.json` → `emulators.auth.port` |
| **Emulator UI** | 4000 | `firebase.json` → `emulators.ui.port` |
| **CORS プロキシ**（Web→Functions 経由） | 5052 | `scripts/cors-proxy.js` → `PROXY_PORT`（アプリはここに接続） |
| **Expo Web 開発サーバー** | 8081 | Expo デフォルト（アプリの URL: http://localhost:8081 または http://<PCのIP>:8081） |

## アプリが参照するポート

- **lib/firebase.ts**:  
  - Functions: **Web** なら `5052`（プロキシ経由）、**ネイティブ/実機**なら `5001`  
  - Firestore: `8080`  
  - Auth: `9099`
- **scripts/cors-proxy.js**: `TARGET_PORT = 5001`（Functions の実ポート）、`PROXY_PORT = 5052`

## ポートを変えるとき（例: 5001 → 5003）

1. **firebase.json**  
   `emulators.functions.port` を `5003` に変更。  
   （必要なら `emulators.ui.port` も変更。例: 4000 → 4003）

2. **lib/firebase.ts**  
   `typeof window !== 'undefined' ? 5052 : 5001` の **5001** を **5003** に変更。

3. **scripts/cors-proxy.js**  
   `TARGET_PORT` を **5003** に変更。

4. エミュレータを再起動し、`npm run cors-proxy` も再実行。

## 関連ドキュメント

- 起動手順: `README_EMULATOR.md` / `EMULATOR_SETUP.md`
- 機能・CORS: `docs/APP_FEATURES.md`
