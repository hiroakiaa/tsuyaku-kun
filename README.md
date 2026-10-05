# 通訳君

1対1の通訳と、数学の授業字幕をひとつのアプリで利用するWebアプリです。画面の配布先はGitHub Pages、通話・字幕・翻訳APIはCloudflare Workersです。

## 操作

- **通訳**：名前、話すことば、表示することばを選び、相手へ招待リンクまたはQRコードを渡します。
- **授業**：先生がGoogleログインして単元を指定し、生徒へ招待リンクを渡します。先生だけが字幕を送信します。生徒は字幕中心で参加し、音声は初期状態でミュートです。
- **よく使う文／ことば辞典**：通話中もタブを切り替えて利用できます。
- **翻訳音声**：各文の▶で端末の音声合成を再生します。端末に対応言語の音声がない場合は利用できません。
- **履歴**：IndexedDBで端末に保存し、CSVまたはJSONでダウンロードできます。

## スプレッドシート

[参照元](https://docs.google.com/spreadsheets/d/1Y0Je_hRWRfxgN4SoWdIla1L5uivw-9J1mhR1MYkjf8M/edit)

既存の `languages`、`phrase_cards`、`school_terms`、`lesson_corrections` を利用します。空白行を除く初期データは文例20件、ことば584件です。

追加したシート：

- `tsuyaku_math_glossary`：数学用語24語の日本語・英語・説明。`approved` 行が用語ヒントになります。その他の言語はAIが原文から直接翻訳します。
- `tsuyaku_term_candidates`：アプリから送信する用語候補。候補を確認し、採用する訳は数学辞書へ登録します。未確認の候補を自動で正式辞書へ入れません。

`sheets/Code.gs` は通訳君専用の独立したApps Scriptプロジェクトとしてデプロイします。既存のつたえる君のコードは変更しません。APIはFirebaseトークンを検証し、候補の追記にはGoogleログインを要求します。公開カタログには生徒・先生の情報、授業履歴、会話全文を含めません。`interpreter_translation_bank` は完全一致検索で利用する設計です。

## 仕組み

音声はWebRTC＋STUN/TURNで端末間へ送ります。字幕と接続制御はDurable ObjectsのWebSocketで配信します。日本語の途中字幕は既存の電話アプリのストリーミング音声認識を利用し、切断時とその他の言語はWhisperによる短い発話区間の認識へ切り替えます。外国語の途中字幕には対応していません。

翻訳は原文、直前の最大3文、単元、数学用語を渡し、日本語・選択言語・英語を直接生成します。翻訳失敗は失敗として表示し、送信者が再試行できます。文例の完全一致は保存済みの翻訳を再利用します。数学の発言から不明な数式を自動で推測しません。

ルームは最長6時間、授業終了後は1時間で削除します。音声は保存しません。字幕はルームの一時ストレージと、利用者が保存操作を行った端末だけに保存します。

## 開発と公開

Node.js 22以上で `npm test`。`npm run serve` で `http://localhost:8787`。

1. Firebase AuthenticationでGoogleログインを有効にし、`hiroakiaa.github.io` を承認済みドメインに登録します。既存の匿名認証をゲスト参加に使います。
2. 独立したApps Scriptへ `sheets/Code.gs` を保存し、ウェブアプリとして公開します。実行者は所有者、エンドポイントへのアクセスはアプリのFirebase認証で制御します。
3. 取得したURLを `wrangler.jsonc` の `SHEETS_BRIDGE` に設定します。
4. Cloudflareの既存アカウントで `wrangler deploy`。AI、Durable Objects、rate limitのバインディングを設定に従って作成します。
5. GitHub PagesのSourceをGitHub Actionsに設定します。`pages.yml` がテスト後、Web用ファイルのみを公開します。

APIキーやログイン用トークンをGitHubへ保存しません。Firebaseの公開設定用APIキーは認証用の秘密鍵ではありません。

## 検証

単体テストは、認証トークンの署名・期限、生徒の権限、途中字幕の即配信、翻訳の重複統合、失敗時の再試行、終了後の削除、数式とCSVの扱いを検証します。実際の2台通話、学校回線でのTURN、各言語の聞き取り精度、授業の遅延は公開環境での確認が必要です。

## 参照

- [Workers AI Gemma](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [Durable Objects WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [QR Code Generator](https://github.com/kazuhikoarase/qrcode-generator)（MIT。ライセンスはweb/QRCODE-LICENSE.txt）
