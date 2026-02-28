# 本番リリース作業一覧

本番に出すためにやることを順番に整理したリストです。

---

## 1. アプリ設定（必須）

| # | 作業 | 内容 | 状態 |
|---|------|------|------|
| 1.1 | **エミュレータを本番でオフにする** | 開発は `useEmulator: true` のまま、本番ビルドだけ `false` にしたい場合は **1.2 を実施**。手動で切り替えるだけなら `app.json` の `"useEmulator": true` を `false` に変更してからビルド。 | 1.2 で対応済み |
| 1.2 | **app.config.js で環境別に切り替え（推奨）** | `app.json` をベースに `app.config.js` で `EXPO_PUBLIC_USE_EMULATOR === 'true'` のときだけ `extra.useEmulator: true`。未設定なら本番で `false`。開発でエミュレータを使う場合は `.env` に `EXPO_PUBLIC_USE_EMULATOR=true`（`.env.example` をコピーして `.env` にリネーム）。 | ✅ 済 |
| 1.3 | **Firebase 設定の確認** | `extra.firebase` の projectId（`my-english-battle`）が本番用プロジェクトで正しいか確認。別プロジェクトで本番運用する場合はここを差し替える。 | 未 |

---

## 2. Firebase 本番デプロイ

| # | 作業 | コマンド・確認 | 状態 |
|---|------|----------------|------|
| 2.1 | **Firestore ルール** | `firebase deploy --only firestore:rules`。手順: `docs/FIREBASE_DEPLOY.md` | 未 |
| 2.2 | **Firestore インデックス** | `firebase deploy --only firestore:indexes`。手順: `docs/FIREBASE_DEPLOY.md` | 未 |
| 2.3 | **Cloud Functions** | `firebase deploy --only functions`。手順: `docs/FIREBASE_DEPLOY.md` | 未 |
| 2.4 | **Firebase Console 確認** | Authentication（メール/パスワード有効）、Firestore、Functions が有効。必要なら請求・クォータ設定を確認。 | 未 |

---

## 3. ビルド・配布

| # | 作業 | 内容 | 状態 |
|---|------|------|------|
| 3.1 | **本番用ビルド** | `useEmulator: false` の状態で `eas build` または `expo prebuild` + ネイティブビルド。EAS を使う場合は `eas.json` の profile で本番用を用意し、環境変数で `EXPO_PUBLIC_USE_EMULATOR` を設定しない。 | 未 |
| 3.2 | **ストア申請準備（必要な場合）** | ストア用アイコン・スクリーンショット・説明文・プライバシーポリシー・アプリの権限説明など。 | 未 |

---

## 4. セキュリティ・運用（推奨）

| # | 作業 | 内容 | 状態 |
|---|------|------|------|
| 4.1 | **Firebase API キー制限** | Firebase Console の「アプリの認証」で、本番アプリのパッケージ名（iOS/Android）や Web のドメインを制限。 | 未 |
| 4.2 | **本番動作確認** | 本番ビルド（または TestFlight/内部テスト）で、認証・対戦・学習・プロフィール・友達機能を一通り確認。 | 未 |

**リリース前の最終チェック**: `docs/FINAL_RELEASE_CHECKLIST.md` の項目を実施すること。

---

## 進め方の目安

1. **まず 1.1 または 1.2** で本番ビルド時にエミュレータがオフになるようにする。  
2. **2.1〜2.3** で Firebase（ルール・インデックス・Functions）を本番にデプロイ。  
3. **1.3・2.4** で本番プロジェクトと Console を確認。  
4. **3.1** で本番用ビルドを実行。  
5. **4.1・4.2** でセキュリティと動作を確認。  
6. ストアに出す場合は **3.2** を並行して準備。

---

## 参照

- 詳細チェック項目: `docs/RELEASE_CHECKLIST.md`
