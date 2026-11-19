# 写真翻訳の保存結果再利用（2026-11-19）
- 公開実装: 86a8f1b / UI v260 / Worker 2bffd4c3-5779-4517-8a72-1042eedaa29a。
- 公開APIの実測: 同じ検証文を2回送信。初回 generated、入力160/出力33 tokens。2回目 cache、入力0/出力0 tokens。異なる分割IDでも元のIDへ戻して回答。
- 公開APIのOCR実測: 非個人の合成学校案内画像を2回送信し、2回目は cache。同じ匿名利用者の文字読取回数の増加は1回のみ。画像自体は保存せずOCR文字と座標だけ保存。
- 保存結果は利用者別。原文・元言語・訳先・用語辞書設定が異なる場合は混在させない。同時要求は1つの処理に合流。OCR64件、分割訳256件まで保持し、保存失敗や大きすぎる結果は有効な翻訳の返却を妨げない。
- 資料QAの既存の資料単位共有翻訳キャッシュは維持。写真の非公開結果を他利用者へ共有する変更はしていない。
- テスト: tests/photo-reuse.mjs、photo-progress、photo-ocr、cost-accounting、tests/run.mjs。公開画面は PHOTO_REUSE_UI_TEST=1 LIVE_PHOTO_PREVIEW=1 tools/check-photo-pinch.mjs で再利用案内と操作を確認（画面試験は模擬OCR・訳文応答）。自動再開の公開画面試験も合格。
- 実サービス測定は tools/check-photo-live-reuse.mjs（checks/photo-test/synthetic-clear.jpg が必要）。認証情報や画像データは検証結果へ出力しない。
