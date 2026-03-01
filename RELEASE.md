# 本番リリース手順

English GrandMaster を本番環境にリリースする手順です。

---

## 事前確認

- [ ] `firebase use` で本番プロジェクトを選択済み（例: `firebase use my-english-battle`）
- [ ] 本番 Firebase で Blaze プランが有効（Cloud Functions に必要）
- [ ] **`EXPO_PUBLIC_USE_EMULATOR` を設定していない**（本番ビルドでは必ず未設定）

---

## 1. Firebase をデプロイ（ルール・Functions）

```bash
npm run release:firebase
```

または個別に：

```bash
# ルール（Firestore + Storage）を先に
firebase deploy --only firestore:rules,firestore:indexes,storage

# Cloud Functions
firebase deploy --only functions
```

---

## 2. Web をデプロイ（Firebase Hosting）

```bash
npm run release:web
```

- `expo export --platform web` で `dist/` にビルド
- `firebase deploy --only hosting` で本番にデプロイ
- デプロイ後、`https://<project-id>.web.app` でアクセス可能

---

## 3. iOS / Android アプリ（EAS Build）

```bash
# 本番用ビルド（EXPO_PUBLIC_USE_EMULATOR 未設定で実行）
eas build --profile production --platform ios
eas build --profile production --platform android
```

### ストア提出（任意）

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

---

## リリース後の確認

1. Web: `https://<project-id>.web.app` で動作確認
2. アプリ: TestFlight（iOS）/ 内部テスト（Android）で主要フローを確認
3. Firebase Console で使用量を確認

詳細チェックリストは `docs/FINAL_RELEASE_CHECKLIST.md` を参照してください。
