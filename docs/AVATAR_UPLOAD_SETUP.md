# アバター画像アップロード（Firebase Storage）設定

## 概要

アバターアップロードは **@react-native-firebase/storage** の `putFile()` を使用しています。
Firebase Web SDK の `uploadBytes` は React Native で ArrayBuffer/Blob 周りで失敗するため、ネイティブ SDK に切り替えています。

- **Web**: Firebase Web SDK（uploadBytes + data URL → Blob）
- **iOS/Android**: @react-native-firebase/storage（putFile + file:// URI）

## 必要作業（EAS ビルド前）

### 1. ネイティブ用 Firebase 設定ファイルの配置

`@react-native-firebase/app` を使用するには、以下2ファイルをプロジェクト直下に配置してください。

| ファイル | 取得元 |
|----------|--------|
| `google-services.json` | [Firebase Console](https://console.firebase.google.com/) → プロジェクト設定 → アプリ → Android アプリ → ダウンロード |
| `GoogleService-Info.plist` | 同上 → iOS アプリ → ダウンロード |

既存の Firebase プロジェクトに Android / iOS アプリが未登録の場合は、先に登録が必要です。

- Android: パッケージ名 `com.englishbattle.app`
- iOS: バンドル ID `com.englishbattle.app`

### 2. EAS で再ビルド

ネイティブモジュールを追加したため、**Expo Go では動きません**。開発ビルド（expo-dev-client）または EAS Build が必要です。

```bash
# 依存関係インストール
npm install

# EAS ビルド（例：iOS）
eas build --profile development --platform ios
```

### 3. ph:// URI について

expo-image-picker で `allowsEditing: true` の場合は通常 `file://` が返るため、そのまま `putFile` に渡せます。
`ph://`（iOS フォトライブラリ直接参照）が返る場合は、内部で一時ファイルにコピーしてからアップロードします。
