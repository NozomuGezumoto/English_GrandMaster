# エミュレータで無料開発

**実行場所:** すべてのコマンドは **プロジェクトルート**（`English_Battle/`、`package.json` と `seedEmulator.js` がある階層）で実行してください。

```
English_Battle/          ← ここでターミナルを開く
├── package.json
├── seedEmulator.js
└── ...
```

## 起動方法

### 1. エミュレータを起動（ターミナル1）

プロジェクトルートで：

```bash
firebase emulators:start --only functions,firestore,auth
```

エミュレータが起動すると、以下が利用可能になります：
- Functions Emulator: http://localhost:5001
- Firestore Emulator: http://localhost:8080
- Auth Emulator: http://localhost:9099
- Emulator UI: http://localhost:4000

（ポートを変更する場合は `docs/PORTS.md` を参照）

### 2. 問題データをエミュレータにインポート（ターミナル2）

エミュレータが起動したら、**別のターミナルでプロジェクトルートに移動して**：

```bash
node seedEmulator.js
```

これで1000問（レベル別100問）がエミュレータに追加されます。問題の元データは `scripts/question-bank.js` で共通です。

### 3. アプリを起動（ターミナル3）

プロジェクトルートで：

```bash
npm start
```

## 注意事項

- エミュレータはローカルでのみ動作します
- エミュレータを停止するとデータは消えます
- 本番環境で使用する場合は、Blazeプランにアップグレードが必要です

## エミュレータUI

ブラウザで http://localhost:4000 を開くと、エミュレータの管理画面が表示されます。




