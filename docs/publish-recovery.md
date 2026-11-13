# 公開が止まったときの復旧手順

公開は「成功したはず」ではなく、GitHub Pagesの画面とCloudflare APIが同じビルド番号になった時点で完了とします。

## 通常経路

1. 最新の `origin/main` を取得し、作業履歴が公開版より古くないことを確認する。
2. 意図した変更だけをコミットする。
3. `npm run publish:verified` を実行する。
4. スクリプトが全テスト、GitHubへのpush、画面とAPIの版一致まで確認する。

## GitHub認証が使えない場合

1. CodexのGitHub連携を接続し、現在のコミットを `main` へ公開する。
2. 接続済み連携が利用できない場合だけ、ログイン済みの右側ブラウザーを使う。
3. ブラウザーでは複数ファイルを一つずつ貼り替えない。欠落や途中公開を避けるため、GitHub連携または正式なGitクライアントの認証を復旧する。
4. 認証情報、個人アクセストークン、パスワードを会話・ログ・リポジトリへ書かない。

## ブラウザー操作が止まった場合

- URL判定やファイル選択が失敗しても、実装・テスト・コミットを取り消さない。
- 接続済みGitHub連携、Git CLI、公開スクリプトの順に別経路を確認する。
- 本人操作が必要なのは、新しいGitHub接続を承認する一回だけにする。
- 再開時は `git status --short`、`git log -1 --oneline`、`git fetch origin main` から始める。

## 公開後の確認

- 画面: `https://hiroakiaa.github.io/tsuyaku-kun/`
- API: `https://tsuyaku-kun-api.allinone-hiroakiaa.workers.dev/health`
- `node tools/verify-release.mjs` が成功すること。
