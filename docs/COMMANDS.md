# 正常動作に必要なコマンド一覧

**前提:** プロジェクトルートは `c:\My_Apps\English_Battle`（`package.json` があるフォルダ）。

---

## 初回だけ（依存関係のインストール）

```powershell
cd c:\My_Apps\English_Battle
npm install
cd functions
npm install
cd ..
```

---

## 毎回の起動（エミュレータで開発する場合）

**ターミナルを 3 つ（Web で使う場合は 4 つ）開いて、順に実行する。**

### ターミナル 1: Firebase エミュレータ（必須）

```powershell
cd c:\My_Apps\English_Battle
firebase emulators:start --only functions,firestore,auth
```

- Functions（5001）・Firestore（8080）・Auth（9099）・Emulator UI（4000）が起動する
- **止めない**（起動したままにする）
- 「port taken」のときは `docs/PORTS.md` の手順でポート変更

---

### ターミナル 2: アプリ（必須）

```powershell
cd c:\My_Apps\English_Battle
npm start
```

- Expo が起動する
- **PC のブラウザ:** http://localhost:8081  
- **携帯のブラウザ:** http://&lt;PCのIP&gt;:8081（同じ Wi‑Fi・PCのIP は `ipconfig` で確認）

---

### ターミナル 3: CORS プロキシ（Web で使う場合のみ必須）

```powershell
cd c:\My_Apps\English_Battle
npm run cors-proxy
```

- **Web**（ブラウザ）でアプリを開くときだけ必要
- 5052 で待ち受け、Functions（5001）へ中継する
- Expo Go（実機アプリ）だけで使う場合は不要

---

### ターミナル 4（任意）: 問題データの投入

```powershell
cd c:\My_Apps\English_Battle
node seedEmulator.js
```

- エミュレータに問題データを入れる（ランクマ・AI 用）
- **ターミナル 1 のエミュレータが起動してから**実行
- 初回やデータをリセットしたあとに 1 回でよい

---

## コマンド一覧（コピー用）

| 用途 | コマンド | どこで |
|------|----------|--------|
| 依存関係（初回） | `npm install` | プロジェクトルート |
| 依存関係（初回） | `cd functions && npm install` | プロジェクトルートの次 |
| **エミュレータ起動** | `firebase emulators:start --only functions,firestore,auth` | プロジェクトルート |
| **アプリ起動** | `npm start` | プロジェクトルート |
| **CORS プロキシ（Web 用）** | `npm run cors-proxy` | プロジェクトルート |
| 問題データ投入（任意） | `node seedEmulator.js` | プロジェクトルート |

---

## 起動順の目安

1. **ターミナル 1** で `firebase emulators:start --only functions,firestore,auth` → 起動完了を待つ  
2. **ターミナル 2** で `npm start`  
3. **Web で開くときだけ** **ターミナル 3** で `npm run cors-proxy`  
4. （任意）**ターミナル 4** で `node seedEmulator.js`

---

## その他のコマンド（参考）

| 用途 | コマンド |
|------|----------|
| Web だけ起動 | `npm run web` |
| Android エミュレータで起動 | `npm run android` |
| iOS シミュレータで起動 | `npm run ios` |
| Functions を本番デプロイ | `cd functions && npm run deploy` |
| 問題データを検証 | `npm run validate:questions` |

---

## トラブル時

- **「port taken」:** 他ターミナルで同じコマンドが動いていないか確認。必要なら `docs/PORTS.md` の手順でポート変更。
- **携帯でアプリが使えない:** PC と携帯を同じ Wi‑Fi にし、アドレスを `http://<PCのIP>:8081` にする。
- **フレンドコードが取れない:** ターミナル 1 のエミュレータが起動しているか確認。
