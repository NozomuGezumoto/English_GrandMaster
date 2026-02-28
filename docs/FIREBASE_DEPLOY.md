# Firebase 本番デプロイ手順

本番プロジェクトへデプロイするときの**順序**と**コマンド**です。  
ルールを先に適用してからインデックス・Functions をデプロイすると安全です。

---

## デプロイ順序の理由

1. **Rules を先**: 本番データを最小権限で保護してから、インデックス・Functions を有効にする。
2. **Indexes を 2 番目**: クエリが失敗しないように。Functions が Firestore を読む前にインデックスを用意。
3. **Functions を最後**: 本番のクライアントが呼ぶ Callable を、正しいルール・インデックスが効いた状態で動かす。

---

## 前提

- `firebase use` で本番プロジェクトを選択済みであること（`firebase use my-english-battle` など）
- 本番用プロジェクトで課金（Blaze）が有効であること（Functions に必要）

---

## 1. Firestore ルール

```bash
firebase deploy --only firestore:rules
```

**確認ポイント**

- デプロイ成功後、Firebase Console → Firestore → ルール で「本番に公開」されていること
- クライアントから **matches の update** ができない（Functions のみ）
- **friendRequests の write** ができない（Functions のみ）

---

## 2. Firestore インデックス

```bash
firebase deploy --only firestore:indexes
```

**確認ポイント**

- 初回やインデックス追加後は、Console → Firestore → インデックス で「ビルド中」→「有効」になるまで待つ
- 次の複合インデックスが定義されていること：
  - `friendRequests`: toUid ASC, status ASC
  - `matches`: status, players.A, createdAt DESC
  - `matches`: status, players.B, createdAt DESC
  - `matches`: mode, status, lang, questionType

---

## 3. Cloud Functions

```bash
firebase deploy --only functions
```

**確認ポイント**

- デプロイ後、Console → Functions で一覧に Callable が並んでいること
- 本番では環境変数 `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` が**未設定**であること（設定されているとエミュレータに接続するため）

---

## 一括デプロイ（ルール＋インデックス＋Functions）

順序を守って一括で実行する場合：

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

※ `firestore` だけなら `firebase deploy --only firestore` でルールとインデックス両方。

---

## デプロイ後の動作確認

1. アプリを本番ビルド（`EXPO_PUBLIC_USE_EMULATOR` 未設定）で起動
2. 認証・ランクマッチ・友達機能など主要フローを 1 回ずつ実行
3. Firebase Console の「使用量」で Firestore 読み書き・Functions 呼び出しが増えていることを確認
