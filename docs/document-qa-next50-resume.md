# 再開メモ 2026-11-22

最初の50＋追加50は受入条件の確認を完了。正本はdocument-qa-improvement50.json、document-qa-next50.json、詳細はdocument-qa-next50-completion.md。これは一般正答率100％ではない。

検証済みの代替経路：Windows PowerShellの既存Wrangler CLIでWorker公開、既存Git認証でHEAD:mainをpush。tools/verify-release.mjsで公開HTML/依存255資材を照合。右IABの管理者→資料QAでもv280と英語回答・1ページの黄色マーカーを目視。ヘッドレスChromeはPLAYWRIGHT_PACKAGEを既存キャッシュのplaywrightへ設定し実行。ブラウザー制御を実機Safariとは表現しない。

通信中断/IME/待機期限/Save-Dataはtools/check-document-answer-recovery.mjs、check-document-interaction-upgrades.mjs、check-document-prefetch-recovery.mjsのLIVE_DOCUMENT_UPGRADES=1で公開資材を操作（APIは制御）。実APIの翻訳/質問はcheck-document-query-terminology-live.mjs、check-document-shared-terms-live.mjs。架空資料はfinallyで削除、削除済みを結果JSONに記録。

既存のdocs/document-qa-30-verification.mdとdocs/publish-recovery.mdの未コミット変更、探索用tools、checksは元からあり、まとめてコミット/削除しない。認証情報の表示は避ける。

未確認/既知制約：実機Safari、冷間4Mbps/150msの登録30秒（既測定39〜46秒）、長文訳の元矩形内全量表示。これらを完了済みの受入件数に混同しない。
