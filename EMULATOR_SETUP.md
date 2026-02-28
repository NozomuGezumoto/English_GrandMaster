# Firebase エミュレータセットアップ（無料で開発）

## 概要

Cloud Functionsをデプロイせずに、ローカルエミュレータで開発できます。完全無料です。

## セットアップ手順

### 1. エミュレータを起動

```bash
firebase emulators:start
```

これで以下が起動します：
- Firestore Emulator (ポート: 8080)
- Functions Emulator (ポート: 5001)
- Authentication Emulator (ポート: 9099)
- Emulator UI (ポート: 4000)

（ポート一覧・変更方法は `docs/PORTS.md` 参照）

### 2. アプリ側でエミュレータを使用する設定

`app.json`の`extra`セクションに以下を追加：

```json
{
  "expo": {
    ...
    "extra": {
      "firebase": { ... },
      "useEmulator": true
    }
  }
}
```

### 3. アプリを起動

別のターミナルで：

```bash
npm start
```

## 注意事項

- エミュレータはローカルでのみ動作します
- データはエミュレータ内に保存され、本番環境とは別です
- エミュレータを停止するとデータは消えます

## 本番環境にデプロイする場合

本番環境で使用する場合は、Blazeプランにアップグレードして：

```bash
firebase deploy --only functions
```

Blazeプランでも無料枠（月間200万回の呼び出しまで）があるので、小規模な使用なら無料です。




