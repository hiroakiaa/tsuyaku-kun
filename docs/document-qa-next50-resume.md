# 再開メモ 2026-11-22

最初の50＋追加50は受入条件の確認を完了。正本はdocument-qa-improvement50.json、document-qa-next50.json、詳細はdocument-qa-next50-completion.md。これは一般正答率100％ではない。

検証済みの代替経路：Windows PowerShellの既存Wrangler CLIでWorker公開、既存Git認証でHEAD:mainをpush。tools/verify-release.mjsで公開HTML/依存255資材を照合。右IABの管理者→資料QAでもv280と英語回答・1ページの黄色マーカーを目視。ヘッドレスChromeはPLAYWRIGHT_PACKAGEを既存キャッシュのplaywrightへ設定し実行。ブラウザー制御を実機Safariとは表現しない。

通信中断/IME/待機期限/Save-Dataはtools/check-document-answer-recovery.mjs、check-document-interaction-upgrades.mjs、check-document-prefetch-recovery.mjsのLIVE_DOCUMENT_UPGRADES=1で公開資材を操作（APIは制御）。実APIの翻訳/質問はcheck-document-query-terminology-live.mjs、check-document-shared-terms-live.mjs。架空資料はfinallyで削除、削除済みを結果JSONに記録。

既存のdocs/document-qa-30-verification.mdとdocs/publish-recovery.mdの未コミット変更、探索用tools、checksは元からあり、まとめてコミット/削除しない。認証情報の表示は避ける。

未確認/既知制約：実機Safari、冷間4Mbps/150msの登録30秒（既測定39〜46秒）、長文訳の元矩形内全量表示。これらを完了済みの受入件数に混同しない。

## 検証資料の削除方針（ユーザーの追加指示）

ユーザーは「あなたの判断で削除してください。今後同じことがあっても削除資料はあなたが削除しましょう」と指示済み。私が作成した架空の検証資料と、ユーザーが削除対象に指定した資料は、既存の許可の範囲で私が削除し、同じ確認を繰り返さない。ユーザーの通常資料を勝手に削除しない。原則として作成した接続/所有者認証を検証終了まで保持し、finallyで削除、可能なら404まで確認する。認証を移したり安全制限を迂回したりしない。

残件：以前のright-browser-fixture 1件は資料専用タブから存在を確認したが、追加メニューがクリック/キーボードとも反応せず未削除。資料専用タブ・停止した作業タブのクローズも試したが復旧せず。全ホスト画面参照は過去の自動審査で拒否されたため行わない。今回新しく作成した他の試験資料は削除済みであり混同しない。削除したと報告しない。

### 2026-11-22 元の資料内翻訳へ修正
ユーザーは白い文章ページへの再構成を希望していない。元の写真・図・罫線・ページ寸法を保持し文字領域だけ翻訳する。公開0fbf72b/v283/CSS110。詳細は document-scan-inplace-20261122.md。公開APIの架空スキャンを390/1280で確認し削除済み。右IABは新規タブの直接資料URLで表示確認し作業タブを閉じた。IAB入力が反応しない場合は所有者を保持した別Chromeコンテキストで操作検証し、同じ共有架空資料URLを右IABで読む経路が使える。私有原資料・実機Safariは未確認。

### 2026-11-22 写真翻訳の描画を資料QAへ共通化
公開60c97d3、資料v284/admin303。スキャンはphoto-overlay.jsのdrawPhotoOverlayを直接利用。縦書き/図形混在でも旧HTMLの12px床へ戻らない。原画像の文字領域にクリップして描き、透明な操作領域だけHTMLに置く。段落は元の座標範囲内、写真を横切る場合はまとめない。画像の外部送信は増やさず取得済みOCR/訳文を再利用。公開259資材一致、公開ポルトガル語390/1280検証・右IAB表示確認。今回の試験資料削除済み。添付原資料と実機Safari未確認。詳細document-photo-compositor-20261122.md。
