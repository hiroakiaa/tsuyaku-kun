# 請求データの無料閲覧連携

2026-10-22。費用確認そのものの追加課金を避けるため、有料SQL照会の案を撤回した。

## 無料の経路だけを使用

- Google提供・保存料がGoogle負担のFOCUSエクスポートを、既存プロジェクトで有効化済み。データ生成・過去分の反映には時間がかかる。
- 管理者のGoogleログインは本人確認だけに使用する。サーバーの専用IDがBigQuery readonlyスコープでtables.getとtabledata.listのGETだけを利用する。Google公式はtabledata.listによるデータ閲覧を無料としている。
- jobs.query、jobs.insert、SQL、Storage Read API、Cloud Storageへのコピー、有料経路へのフォールバックを実装しない。BigQueryジョブユーザーを付与しない。専用ID tsuyaku-billing-readerには対象の請求データセットだけのBigQueryデータ閲覧者を付与する。プロジェクト権限・ジョブ実行権限は付けない。
- Googleはメタデータを含め2MB、5,000行、5ページで停止。途中までの読み取りで小計を確定しない。読取中のデータ更新も検出して停止する。データ量が増えた場合に有料照会で解決しない。
- Cloudflareは無料のBilling Read APIだけを利用。Billing Readのみの90日トークンを作成、2027-01-20失効。IP制限なしはWorkersの送信元IPが固定でないため。暗号化したランタイムシークレットにのみ保存。支払操作・プラン変更・AI呼出し・DOへの新規保存は実行しない。
- 既存のWorkers Freeを維持し、請求連携のための有料プランやリソースは追加しない。無料プランの上限で止まる場合は未取得表示のまま停止。将来プランを変更する場合はこの前提と料金を再点検する。

## 認証と秘密情報

- 1111はUIの簡易ロックであり請求情報の認可には使わない。
- 独立したFirebaseアプリbilling-adminをinMemoryPersistenceで使用。通常の匿名認証・会話の認証IDをGoogleアカウントへ切り替えない。
- サーバーは署名検証済みFirebase JWTのgoogle.comプロバイダー、email_verified、および管理者メールアドレスのSHA-256ハッシュ一致を検証する。未設定・匿名・別アカウントは403。
- メールの追加クレームを取得するのは/billing/経路のみ。通常の会話やWebSocketの添付情報にメールアドレスを新規保存しない。
- CF_BILLING_READ_TOKEN、BILLING_ADMIN_EMAIL_HASH、GOOGLE_BILLING_DATASET、GOOGLE_BILLING_TABLEを秘密設定へ保存。GOOGLE_BILLING_READER_KEYは承認済み専用IDのJSON鍵としてサーバーの暗号化シークレットに保存する。自動失効期限はなく、削除まで閲覧可能。鍵・Googleアクセストークンをブラウザー、ログ、履歴、公開コードへ渡さない。認証JWTは10分期限・固定のGoogle認証先・readonlyスコープに限定する。
- モーダルを閉じるか確認を終了したら認証とレポートを破棄。通常ユーザーには請求情報を返さない。サーバーのエラーには接続キーや提供元の生応答を含めない。

## 表示範囲と合計

- 無料枠前のアプリ推定値と、提供元のクレジット反映後の請求データを別枠にする。両方を足さない。
- Googleは対象プロジェクトのUTC月のBilledCostをサービス別に集計。BilledCost自体がクレジットを含むので再減算しない。他プロジェクトを除外。通訳君以外も同じプロジェクトを使えば共用費用であり、通訳君専用額とは断定しない。
- Cloudflareはアカウント共通の従量料金。前月から当日までのAPIデータのうち、今月内に収まる課金期間だけを集計。月をまたぐ行・固定費・税・アプリ間配分は未取得。請求サイクルの合計をカレンダー月の合計と誤表示しない。
- 通貨は分けて表示。表示用の円換算設定を実請求の為替として使わない。負の調整金額を保持する。
- 準備中・取得失敗・権限不足・空データを0円にしない。明示的な0円行は表示する。
- 取得できた範囲の小計を表示し、固定費やGitHub/Workspace等の契約が未取得である間、全体の合計は未確定とする。月途中の提供元データは反映遅延・修正があり、確定請求書・引落額ではない。
- 自動巡回や定期ジョブを追加しない。GoogleとCloudflareはサーバープロセスの生存中24時間、画面内でも24時間キャッシュ。再起動や再認証で無料APIを再読取する場合はあるが、有料APIへは進まない。

## 検証

node tests/billing-report.mjs：無料GETだけの利用、権限失敗時の停止、行数/バイト/ページ制限、月/プロジェクト/通貨の分離、クレジット、0円と未取得、管理者認証、キャッシュ、秘密情報の非公開。
node --experimental-vm-modules tests/run.mjs：署名済みJWTによる匿名・別管理者・未確認メールの拒否、正規管理者の許可、POST拒否、通常会話へのメール非保存。
node tools/check-billing.mjs：320x568、568x320、1024x600の表示・操作、詳細、更新抑制、ログアウトとモーダルを閉じたときの消去、権限拒否。

## 公式資料

- https://docs.cloud.google.com/bigquery/docs/best-practices-costs （無料のtabledata.list閲覧）
- https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-focus-setup （FOCUS保存料はGoogle負担）
- https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/list
- https://developers.cloudflare.com/billing/understand/billing-permissions/
- https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v1/
