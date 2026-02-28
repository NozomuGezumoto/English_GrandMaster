# 本番環境移行の注意点チェックリスト（Expo + Firebase）

## ゴール

- 本番ビルドではエミュレータ接続が一切発生しない
- 本番 Firebase（Auth / Firestore / Functions）にのみ接続
- レート戦の勝敗確定・レート更新がサーバー権威で破綻しない
- TestFlight / 内部テストで主要フローを通してからリリース

---

## 1. 環境切替（最重要：混線防止）

| 項目 | 内容 | 当プロジェクトの状態 |
|------|------|----------------------|
| useEmulator の制御 | 本番ビルドでは **必ず false**。推奨：`app.config.js` + `EXPO_PUBLIC_USE_EMULATOR` で制御（開発=true / 本番=false）。 | ✅ `app.config.js` で環境変数により制御。本番では未設定で `false`。 |
| エミュレータ接続の分離 | Auth / Firestore / Functions の emulator 接続は **useEmulator === true のときだけ** 実行する。 | ✅ `lib/firebase.ts` で `if (useEmulator) { ... connect*Emulator }` のみ実行。 |
| Firebase 接続先の識別 | projectId 等を環境で分ける。「開発用 projectId を本番で参照」または「本番を開発で汚す」を防ぐ。 | ⚠️ 要確認。`app.json` の `extra.firebase` が本番用プロジェクト 1 つのみ。開発用プロジェクトを分ける場合は projectId を環境で切り替えること。 |

---

## 2. Firebase 本番デプロイ順と確認ポイント

### デプロイ順（安全）

1. **Firestore Rules**
2. **Firestore Indexes**（必要なら）
3. **Cloud Functions**

### Rules（超重要）

| 確認項目 | 内容 | 当プロジェクトの状態 |
|----------|------|----------------------|
| 最小権限 | users / matches / friendRequests などが過不足ないか。 | ✅ 現行ルールで整合。 |
| 勝敗・レートの直接更新禁止 | クライアントから「勝敗確定」「レート更新」「不戦敗確定」が **直接** できない設計。 | ✅ **matches**: `allow update: if false`（Functions のみ更新）。**friendRequests**: `allow write: if false`。 |
| レートはサーバー権威のみ | レート計算・結果確定は **Functions のみ**。 | ✅ `recordMatchComplete` → `finalizeMatchInternal` で `updateUserRating`。クライアントは `recordMatchComplete` を呼ぶだけ。 |

**補足（users コレクション）**: ルールを強化済み。クライアントは **rating / wins / losses / rank 等のサーバー権威フィールドを書けない**。`edit-profile` は表示名・国・lastActiveAt・avatarUrl のみ送信し、`merge: true` で他フィールドは保持。create 時も同様の禁止キーを含む書き込みは拒否。

### Functions（超重要）

| 確認項目 | 内容 | 当プロジェクトの状態 |
|----------|------|----------------------|
| リージョン | リージョンを固定（後から変えるとクライアントの設定変更が発生）。 | 要確認（未指定ならデフォルトリージョン）。 |
| 呼び出し方式 | callable / onRequest が本番想定どおりか。 | ✅ Callable のみ使用。 |
| 本番用ログ | エミュレータ接続を示すログが本番で出ないか。 | ✅ エミュレータ用環境変数が設定されているときのみログ出力。本番では出ない。 |

---

## 3. 本番データ運用の注意（事故りやすい）

| 項目 | 内容 |
|------|------|
| テストデータの混在 | 本番 DB にテストデータが残り続けないよう、`env: "prod" \| "dev"` のような区別フィールドや、コレクション分離で混在防止を検討。 |
| テスト用アカウント | 自分用テストアカウントを固定し、初期データの汚染を最小化。 |
| 料金・負荷 | 勝敗確定・レート更新が Functions で行われるため、無駄なトリガー実行や多重呼び出しがないか確認（現状は `ratingProcessed` で二重実行防止済み）。 |

---

## 4. 本番移行前に必ず通すテスト（TestFlight / 内部テスト）

本番接続で成立することを確認する最低限のフロー：

| # | 項目 | 内容 |
|---|------|------|
| 4.1 | 認証 | 新規登録 → ログイン → プロフィール作成 |
| 4.2 | ランクマッチ | マッチング → 10 問 → 勝敗 → レート更新 → 履歴（プロフィール戦績）反映 |
| 4.3 | 切断・放置 | 片方が落ちる・戻る・放置 → 不戦敗 / 中断処理が想定どおり |
| 4.4 | 友達戦 | 作成 → 参加 → 開始 → 終了 |
| 4.5 | iPhone 音声 | リスニング / ディクテーションの自動再生が本番でも動くか。iOS はユーザー操作なし自動再生が制限されるため、初回の導線（タップ開始など）を実機で確認。 |

---

## 5. セキュリティ・保険（推奨）

| 項目 | 内容 |
|------|------|
| App Check | 可能なら導入（不正クライアント対策）。 |
| Crashlytics | 本番で有効化（移行直後の事故検知）。 |
| API キー制限 | 補助として有効。本丸は **Rules + サーバー権威**。 |

---

## 6. リリース前の最終チェック（見落とし多い）

→ **実施用チェックリスト**: `docs/FINAL_RELEASE_CHECKLIST.md` を参照。

- [ ] 本番ビルドで **useEmulator=false** がログで確認できること（`[Firebase] Using production Cloud Functions` が出ること）。
- [ ] Firebase Console で Auth / Firestore / Functions が正常に動いていること。
- [ ] 本番ルール適用後、クライアント側の読み書きが「必要な箇所だけ」通ること。
- [ ] 「本番でだけ起きる」iPhone 周り（音声・バックグラウンド・通信）を実機で確認すること。

---

## まとめ

- このチェックリストは **Expo + Firebase の本番移行で押さえるべき点をよく整理している**。当プロジェクトの構成（Callable のみ・matches 更新禁止・レートは Functions のみ）とも整合している。
- **最優先**: 本番ビルドで `useEmulator` を確実に `false` にすること（`app.config.js` + 環境変数推奨）。
- **次点**: Firebase のデプロイ順（Rules → Indexes → Functions）、TestFlight/実機での主要フロー確認、必要に応じた `users` ルールの強化や App Check / Crashlytics の検討。
