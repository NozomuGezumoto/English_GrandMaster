# App Store リリース手順

## 前提

- **Apple Developer プログラム**（$99/年）に登録済み
- **本番ビルド**：`EXPO_PUBLIC_USE_EMULATOR` を**設定しない**（未設定なら useEmulator は false）

---

## 1. 本番ビルド（EAS）

```bash
eas build --platform ios --profile production
```

- EAS にログインしていなければ `eas login` でログイン
- ビルド完了後、.ipa のダウンロードリンクが表示される（数分〜20分ほど）
- **重要**: 環境変数に `EXPO_PUBLIC_USE_EMULATOR` を設定しないこと

---

## 2. App Store Connect での準備

1. [App Store Connect](https://appstoreconnect.apple.com) にログイン
2. **マイApp** → **+** → **新規App**
3. 基本情報を入力：
   - **プラットフォーム**: iOS
   - **名前**: English GrandMaster
   - **主要言語**: 日本語（または English）
   - **バンドルID**: `com.englishbattle.app`（app.json と一致させる）
4. **App 情報**で以下を登録：
   - 説明文（4000文字以内）
   - キーワード
   - プライバシーポリシーURL（必須）
   - カテゴリ（例: 教育）

5. **スクリーンショット**を用意：
   - iPhone 6.7"、6.5"、5.5" など複数サイズが必要
   - 実機またはシミュレータで撮影し、App Store Connect の要件に合わせてアップロード

---

## 3. ストアに提出

### 方法A: EAS Submit（推奨）

ビルド完了後：

```bash
eas submit --platform ios --latest --profile production
```

初回は Apple ID / App 固有パスワード / App Store Connect API Key の入力を求められます。

### 方法B: Transporter アプリ

1. EAS のビルドページから .ipa をダウンロード
2. Mac の **Transporter** で .ipa をアップロード
3. App Store Connect でビルドを選択し、審査に提出

---

## 4. 審査提出前のチェック

- [ ] アプリの説明・スクリーンショットが揃っている
- [ ] プライバシーポリシーURL を設定している
- [ ] 年齢制限を設定している（該当する場合）
- [ ] **暗号化**: `ITSAppUsesNonExemptEncryption: false` は app.json に設定済み（標準の HTTPS のみ使用なら該当なし）

---

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| ビルド失敗 | `eas build:view` でログ確認。GoogleService-Info.plist の有無を確認 |
| 提出時にエラー | bundleId が App Store Connect で作成した App と一致しているか確認 |
| 審査リジェクト | メールの指示に従い、説明や機能を修正して再提出 |
