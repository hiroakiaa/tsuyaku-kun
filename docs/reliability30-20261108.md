# 信頼性改善30項目（2026-11-08）

対象ビルド: 20261108-reliability30-1。項目は実装修正と回帰検証の強化を含む。テスト用の音声入力・認識応答・通信を使用し、教室での認識精度を測ったものではない。

|番号|修正・検証項目|回帰検証|
|---|---|---|
|1|不正なnull認識区間で停止しない|tests/reliability30.mjs R30-1|
|2|不正な区間データ形式を字幕にしない|tests/reliability30.mjs R30-2|
|3|信頼度の範囲外値を拒否する|tests/reliability30.mjs R30-3|
|4|非有限値・文字列の信頼度を信頼済みにしない|tests/reliability30.mjs R30-4|
|5|長すぎる認識結果を途中で切らない|tests/reliability30.mjs R30-5|
|6|制御文字を含む結果を除外する|tests/reliability30.mjs R30-6|
|7|空の上位配列で下位の信頼度情報を隠さない|tests/reliability30.mjs R30-7|
|8|モデル無音と信頼度不足を区別する|tests/reliability30.mjs R30-8|
|9|認識区間数と診断処理量を制限する|tests/reliability30.mjs R30-9|
|10|不正な信頼度を本文なしの数値で記録する|tests/reliability30.mjs R30-10|
|11|除外判断と旧テキストAPIの判定を共通化する|tests/reliability30.mjs R30-11|
|12|信頼度未取得を高精度と見なさないことを検証する|tests/reliability30.mjs R30-12|
|13|信頼度不足の除外件数を無音から分ける|tests/reliability30.mjs R30-13|
|14|分析に不確かな区間の除外を説明する|tests/reliability30.mjs R30-14|
|15|信頼度不足が連続した場合にもマイクを停止する|tests/reliability30.mjs R30-15|
|16|ブラウザー認識の除外を集計と停止判定へ接続する|tests/reliability30.mjs R30-16|
|17|停止時にブラウザー認識の全コールバックを解放する|tests/reliability30.mjs R30-17|
|18|不正なブラウザー認識インデックスを拒否する|tests/reliability30.mjs R30-18|
|19|文字列以外の認識結果で停止しない|tests/reliability30.mjs R30-19|
|20|ブラウザー認識のnetworkエラーを保持する|tests/reliability30.mjs R30-20|
|21|PCM時刻のない別のブラウザー確定結果を結合しない|tests/reliability30.mjs R30-21|
|22|古い送信通知で最新字幕の状態を変更しない|tests/reliability30.mjs R30-22|
|23|前版の表示確認を新版へ引き継がない|tests/reliability30.mjs R30-23|
|24|遅れた受付・表示確認で翻訳失敗を隠さない|tests/reliability30.mjs R30-24|
|25|再送バッチ外の字幕の再試行回数を消費しない|tests/reliability30.mjs R30-25|
|26|不正な表示確認人数・版番号を拒否する|tests/reliability30.mjs R30-26|
|27|重複した受付・受信・表示確認の診断を重複計上しない|tests/reliability30.mjs R30-27|
|28|退室時に配信診断のメモリーも消去する|tests/reliability30.mjs R30-28|
|29|読み上げ用の言語欄名を自分・相手の表示と一致させる|tests/reliability30.mjs R30-29|
|30|Whisperの予算予約単価を共通定義へ統一する|tests/reliability30.mjs R30-30|

## 検証範囲

- tests/run.mjs、lesson-economy、group-chat、chat-recovery、reliability20の既存検査。
- tools/check-reliability30.mjs: 390px・1024pxの実画面で架空の信頼度不足応答を8回入力し、字幕未生成・マイク停止・別件数集計・秘密情報の非出力・言語欄のアクセシブル名を検査。
- 時刻のあるPCMの連続発話の結合は維持する。ブラウザー認識の別の確定結果は、時刻を推定して結合しない。
- malformedな提供元応答を除外すると取りこぼしが増える可能性がある。信頼度情報がない結果を正確とは判定しない。
- 複数の人の声を本人から分離する機能ではない。教室での誤字幕率、取りこぼし率、理解度、50分連続利用は別途実測が必要。

追加確認: ブラウザー認識のno-speechを8回受けた実画面でも停止・集計を検査。処理費0円の利用中セッションを分析に一時的に含め、0円履歴の永続保存は増やさない。
