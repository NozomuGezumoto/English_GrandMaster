# サービスアカウントキーの取得方法

## 手順

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクト「my-english-battle」を選択
3. 左メニューから「IAMと管理」→「サービスアカウント」を開く
4. 「サービスアカウントを作成」をクリック
5. サービスアカウント名を入力（例: `firebase-admin`）
6. 「作成して続行」をクリック
7. ロールは「Firebase Admin SDK Administrator Service Agent」を選択
8. 「完了」をクリック
9. 作成したサービスアカウントをクリック
10. 「キー」タブを開く
11. 「キーを追加」→「新しいキーを作成」をクリック
12. キーのタイプ: 「JSON」を選択
13. 「作成」をクリック
14. JSONファイルがダウンロードされる
15. ダウンロードしたファイルを `C:\My_Apps\English_Battle\serviceAccountKey.json` にリネームして配置

## 注意事項

- `serviceAccountKey.json` は機密情報なので、`.gitignore`に追加済みです
- このファイルをGitにコミットしないでください




