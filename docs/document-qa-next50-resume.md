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

### 2026-11-22 続報：実資料の翻訳品質は未解決
ユーザーのIMG_0981スクリーンショットで依然読み取り誤りと不揃いな配置が残る。drawPhotoOverlay共通化だけでは不十分。写真翻訳はserver/photo-ocr.js経由Google Cloud Vision DOCUMENT_TEXT_DETECTIONで段落boxを得る。資料QAはweb/document-ocr.jsで端末内Tesseract/NDLOCRの行boxを得る。原文OCRが違うため描画だけ共通にしても同品質にはならない。
既存checks/scan-translation/cropped-private-fixture.jpg（過去スクリーンショットからの切り出し、元ファイルではない）で画像を外部送信せず端末内OCRを測定。倍率1：confidence62/6つの一般語アンカー中3つ、倍率3：confidence75/6中5つ。倍率増だけで解決としない。ユーザーの過去のPDFページ画像外部送信禁止が残るため、資料QAでもGoogle Cloud Visionへ翻訳ページ画像を送って同じ認識を使ってよいか非同期質問を送信。回答が必要。未許可の画像送信・自動OCR差し替えは行っていない。今回修正済み/公開済みとは報告しない。

### 2026-11-22 Cloud Visionの利用許可後
ユーザー「送って良いです」で資料QAページ画像のGoogle Cloud Vision送信を明示許可。公開8ffb870/v285/admin304、263資材一致。スキャン翻訳は新web/document-vision-translation.js経由で/photo/recognizeと/photo/translateを共通利用。保存済みPDFから認識するため旧資料も対象。QA索引は今回変更していない。セッション内OCRをページ単位、翻訳をセグメント単位で再利用。サーバーのユーザー分離は維持。斜め撮影の段落枠は原文消去範囲を保持し訳文領域を分割。
実資料の既存画面切り出しを私有PDF登録して公開版390/1280で確認。認識経路Vision、重なり0/欠け0/描画省略false、拡大・原文切替・全文合格。今回の試験資料削除済み。切り出しには旧UIの文字が含まれるため認識されるが新アプリのエラーではない。47組テスト、通常PDFの表/写真/罫線回帰合格。原本全体・実機Safari未確認。詳細document-vision-translation-20261122.md。

### 2026-11-22 共通資料のVision翻訳を他利用者でも再利用
公開ceddf07、資料v286/admin305、263資材一致。Worker版3bcde9ba-092f-4b70-b235-0ea94cdc8440。/documents/:id/visionで閲覧権限・ページを検証後、資料ID/revision/ページをサーバーで決めた名前空間でphotoReuseOperationを実行。画像・原文・言語ハッシュによる保存済み結果の再利用と同時生成の集約。私有資料への他利用者アクセスは拒否。差し替え版と別資料を分離。
公開架空共通資料で別匿名利用者を実測：OCR1件・翻訳3件ともcache、追加翻訳input/output tokensすべて0。所有者390/1280の表示・原文往復・全文も合格。試験資料削除済み。48組テスト合格。詳細document-vision-reuse-20261122.md。私有資料のスクリーンショット等は追加していない。

### 2026-11-22 選択言語の全ページ準備・翻訳中を右上へ
公開1c83804、資料v287/CSS111/admin306、265資材一致。新document-translation-queue.jsで選択言語は次の1ページのみから全ページへ拡張。現在ページ最優先、次に残りの選択言語、最後に英語全ページ。保存済みは既存キャッシュ再利用。失敗2回まで、閉じた資料・非表示タブ等では新規ジョブ停止。翻訳中は資料内右上z6、切替はz5、読込中の切替は折り返して重なり防止。
公開実測：見出しが異なる3ページ架空スキャンを共通資料に登録、ポルトガル語・英語全6件をページ1のまま完了。別匿名利用者はOCR3件・翻訳6件ともcache、追加翻訳tokens0。全試験資料削除済み。公開資材の制御UIで右/上8px、切替重なりなし。49組テスト合格。実機Safari未確認。tools/check-all-pages-live.mjsはページ初期言語をcontext.addInitScriptで設定（SPA作成後には実行されない）。同一本文ページはブラウザー内再利用でAPIが省略されるため新規要求件数だけで失敗判定しない。詳細document-all-pages-20261122.md。

### 2026-11-22 目次失敗の根本修正
server/documents.jsの操作許可リストにtoc POSTがなく、生成分岐へ届く前に405で拒否されていた。toc許可を追加し閲覧権限を維持、AI失敗時の本文見出しフォールバックは2文字以上へ改善。50組テスト合格。Worker8bd5e0dc-15da-45c3-8d68-cd0bec649464へ本番反映。公開版で新規2ページPDFの目次POST200/2項目表示/再利用、既存共通通訳君資料POST200/12項目表示を確認。試験資料削除済み。tools/check-document-toc-live.mjs、詳細document-toc-route-20261122.md。ユーザー追加の「ページ操作によらず全ページ翻訳開始」は既公開v287の全ページキューで対応済み、ページ1のままpt/en3ページと他利用者tokens0は前回公開実測。
