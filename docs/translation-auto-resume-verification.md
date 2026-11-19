# 翻訳の自動再開（2026-11-19）
- 実装公開: 134e8aa、画面 v255、Worker 01381810-fa3a-4561-893b-efc0939b4bcc。
- 公開配信アセットのスマホ幅で、3分割のうち中央の翻訳に504を一度返す模擬障害を注入。利用者の再試行なしで完了、中央だけ2回、完成した両端は各1回、画像プレビュー維持を確認。
- 検証: PLAYWRIGHT_PACKAGE を既存ランタイムの playwright に指定し、LIVE_PHOTO_PREVIEW=1 node tools/check-photo-resume.mjs。
- 公開アセットで tools/check-photo-pinch.mjs も合格。模擬OCR・訳文応答を使い、実翻訳サービスの障害を起こした試験ではない。
- 資料QAのページ内チェックポイントは tests/translation-checkpoint.mjs で完了グループの再利用と未完了グループだけの再実行を確認。実資料を用いた公開サービス障害試験・物理iPhone Safariは未実施。
- 自動再開は一時的な時間切れ・通信障害に対し最大3回。明示的な認証・課金・利用枠停止を繰り返さない。画面を閉じた後は追加再試行しない。
