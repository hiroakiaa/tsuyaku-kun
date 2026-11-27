# キーボード上を資料スクロール領域にする（2026-11-27）

対象: 資料QA v303 / CSS118 / admin315、実装15cc8f1。ユーザーの追加要望に合わせ、v302までの「入力中も会話欄を表示」の配分を変更する。

## 変更
- キーボード表示中は会話欄と分割境界を一時的に畳み、上をPDF、下を入力欄の2行にする。履歴はDOMと保存領域に保持し、キーボードを閉じると元の会話・52%などユーザー設定の分割へ戻す。
- 管理者の親dialogをvisualViewportのtop/heightへ合わせ、iframeを100%へ収める。子画面は親から管理済みの通知を受けたらローカル座標top=0を使う。親・子の二重補正や親画面外への押し出しを避ける。親連携がない既存埋め込みには従来の境界計算を残す。
- postMessageは同一originかつ対象iframeのwindowを検査。外部へ情報は送信しない。
- 入力欄から送信ボタンへ触れたときは、OSキーボードが閉じるまでモードを保ってクリックが外れないようにする。
- 原文マーカーの28%黄色/multiply、枠なし・影なし、API・モデル・料金・予算に変更なし。

## ローカル検証
全56テストコマンド成功。親連携のorigin/source拒否、viewportパン更新、close復元を単体検証。UIは単独、実際の親ヘルパー＋admin CSSのdialog/iframe、親連携のない縮小iframeの3条件。

390x844ブラウザーでvisualViewportを480px、offset110pxへ模擬。タッチ操作はCDP Input.dispatchTouchEventで実際にtouchStart/Move/Endを送り、資料のscrollTopが40px以上増えることを検査。スクロール中もquestionがフォーカス中のまま。逆方向にもスワイプし、viewportのoffsetを160pxへ変えても入力欄が可視範囲内に残る。2ページ・送信による9 AMのモック回答受信・キーボードを閉じた後の438.9pxと52%復元、履歴保持を確認。

資料表示面積は通常の親連携では約311px（v302は約112px）、旧親連携なし・iframe縮小時も約201px。画像で資料・操作行・入力欄が同時に見えることを目視した。キーボード表示中は会話を隠す仕様で、閉じた後に再表示する。

## 残る確認
最終公開ファイル照合とLIVE_KEYBOARD=1での公開JS/CSS確認を残す。データ/PDF/API/認証/visualViewportはfixtureなので実機SafariのOSキーボード確認ではない。実機Safari確認済みと報告しない。公開保管庫へ試験資料を作らず外部AIを呼ばない。

## 再開
最新作業の続きは../RESUME-multifile.md。tools/check-document-mobile-keyboard.mjsへLIVE_KEYBOARD=1、EMBEDDED_KEYBOARD=1で親ヘルパー付き公開UI、さらにEMBEDDED_RESIZE_FRAME=1で古い親の縮小iframe経路。物理Safariではない。スクリーンショットはchecks/mobile-keyboardのケース別ファイル。以前の24%/42%へ安易に戻さない。管理者側の外枠と子画面の座標の両方を検証する。

## 最終公開確認
公開v303のHTML + 276 assets + API buildが一致。LIVE_KEYBOARD=1で公開されたJS/CSS/親ヘルパーを読み込み、単独・親連携あり・旧親縮小iframeの3条件が成功。親連携では親dialogがdocument-keyboardになり、iframeの実測y=110px・height=480pxとなることも明示検査した。touchStart/Move/Endで資料が上下にスクロールし、その間もquestionのフォーカスを保持。可視領域のoffset110→160→110でも入力欄を範囲内に保ち、送信/9 AMのモック回答受信/キーボード終了後の会話と分割復元まで成功。

公開UIのembedded-focused.pngを目視し、キーボード相当の領域上が資料と入力欄で埋まることを確認。OSキーボード・認証・PDF・回答APIはfixtureであり、実機Safari検証ではない。公開保管庫に試験資料は登録していない。キーボード回帰は既存Pages workflowで継続実行する。総合CI全成功とは主張しない。

## 公開CIとマーカー検査の保守
今回の公開CIでキーボード3条件と画像保存はsuccess。マーカー色別試験はコードがCSS v116を固定期待しており、CSS118へ更新したため失敗していた。見た目の変更ではない。ローカルdocuments.htmlのCSS番号と公開hrefを照合する形へ直し、色別の6背景・原文/翻訳・枠/影なしの検査を維持。公開CSS118でPASSし色別スクリーンショットも目視。既存資料の総合スモークには別の失敗が残るため、全CI成功とは報告しない。
