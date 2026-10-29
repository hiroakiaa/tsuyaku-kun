# 音声認識の遅延を比較する

通常利用のモデル・言語判定・VADを保ち、Whisper Turbo の候補探索数だけを変えて比較する。指定なしは従来の beam 5、明示した profile=beam1 は beam 1。速度や精度の優劣は実測するまで決めない。

公式のモデル説明は、beam_size を増やすと精度が改善する場合がある一方、速度を犠牲にすると説明している。
https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/

## 再現方法

Windows の System.Speech を使用する tools/create-recognition-fixture.ps1 は合成の日本語・英語4文だけを生成する。マイク・利用者の録音は読まない。環境にインストール済みの日英音声が必要。生成先は既定で checks/recognition-probe（公開対象外）。

node tools/compare-recognition.mjs --live を明示実行すると、各音声を2設定・順番を交互にして2巡（合計16要求）で比較する。既存の匿名認証とアプリ内予算を使い、認識用の費用が生じる。token はファイル・標準出力に保存しない。WAV形式と音声エネルギーを確認してから送信する。結果は同じ checks 配下へ保存する。

数字・否定・質問の指定語の保持と言語判定を確認する簡易検査であり、一般的な正答率ではない。合成音声、4文、同じ声の小標本から、実際の教室・子どもの声・遠距離収音・同時発話の認識精度を結論しない。最初の要求だけの差をモデル設定の因果効果としない。

## リアルタイム方式との関係

Whisper Turbo は音声を送ってから結果を受け取る方式。beam を変えても、録音と認識の直列処理そのものは残る。根本的な候補は、発話中に音声を送り続けるリアルタイム認識である。

Cloudflare Nova-3 は WebSocket と多言語認識を提供する。Cloudflare の認証済み Worker から接続し、APIキーをブラウザーへ渡さない構成が必要。Cloudflare 経由で使える言語・モデル版と Deepgram 直契約の最新版を同一と決めつけない。公式 Cloudflare の説明で確認できる多言語群に日本語・英語が含まれる。
https://developers.cloudflare.com/workers-ai/models/nova-3/
https://developers.cloudflare.com/changelog/post/2026-03-06-realtimekit-multilingual-transcription/
https://github.com/cloudflare/agents/blob/main/packages/agents/src/voice/workers-ai.ts

価格は Whisper Turbo $0.000513/音声分に対して Nova-3 WebSocket $0.0092/音声分（約17.9倍）。さらに連続送信が無音も含める場合、端末のマイクON時間と発話区間の長さの差も影響する。予算上限を引き上げずに、予約・停止・同時接続・切断後の課金処理を検証する必要がある。

暫定文字は原文表示だけに使い、確定前の翻訳を繰り返して利用量を増やさない設計を第一候補とする。言語不明・選択外・混在した結果を確定文へ流さない。読み上げ中のマイク停止、iPhone復帰、バックグラウンド停止、中断・退出、認証期限、通信詰まり、重複結果、料金不明時の扱いまで既存の安全条件を維持する。
