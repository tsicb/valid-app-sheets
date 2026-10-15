# 有効応募分析・スプレッドシート版（valid-app-sheets）

Google Sheetsを分析画面に使う、`valid-app` の派生プロジェクト。現在は**空テンプレート生成とCSV全件取込・求人突合・安全な保存処理までの初版コードを実装済み**です。基本分析・カスタム分析・進捗グラフ・画像Workerへの実接続などの集計機能はまだ未実装です。

## 既存版との関係

- 既存Web版：[tsicb/valid-app](https://github.com/tsicb/valid-app)
- 既存版の正本仕様：[分析軸30種類](https://github.com/tsicb/valid-app/blob/main/docs/ANALYSIS_AXIS_AVAILABILITY.md)
- CSV_A/B正規化、求人CSV突合、応募CSV由来求人情報の補完、指標の利用可能条件、求人CSV突合率の定義などは既存版を参考にする。
- Google Sheets側の画面・書式・キャッシュ・設定・アクセス制御は別実装とする。

## 現在の設計ドキュメント

- [docs/DISPLAY_SPEC_DRAFT.md](docs/DISPLAY_SPEC_DRAFT.md)：表示タブ・固定列・カスタム分析・専用表・運用方針。**一部確定、その他は提案。**
- [docs/JOINED_DATA_MODEL_DRAFT.md](docs/JOINED_DATA_MODEL_DRAFT.md)：応募明細＋求人マスタの2層保存、画像候補マスタ、分析30軸の保存列対応。
- [docs/CSV_IMPORT_UPDATE_SPEC_DRAFT.md](docs/CSV_IMPORT_UPDATE_SPEC_DRAFT.md)：CSV全件取込、氏名を使った重複判定後の削除、段階書込、旧データ復旧の設計。
- [docs/TEMPLATE_LAYOUT_SPEC_DRAFT.md](docs/TEMPLATE_LAYOUT_SPEC_DRAFT.md)：各タブのセル配置、基本分析の切替式、設定・マスタ編集位置、更新関数の書込権限の設計。

## 想定する方向性

1. スプレッドシートのメニューから開くGAS HTMLダイアログで、CSVをブラウザ内正規化・突合。
2. RAW個人情報はシートに取り込まず、分析に必要な項目に削減した突合後明細を保存。個人識別リスクの評価は継続。
3. 基本分析は1タブに集約し、年代列固定＋指標プルダウンで切替。応募年月の列軸はカスタム分析へ。
4. 応募進捗、カスタム分析、TOP画像、Indeedタグは専用タブ。
5. 「全データ更新」「分析設定反映」と「閲覧だけのプルダウン変更」を分離する。
6. **GASはコンテナバインド型で確定**。利用者が空テンプレートをコピーして任意のマイドライブフォルダで完結して使えることを最優先にする。
7. 初期レイアウト作成と日常の値更新を分離し、ユーザーが変更した列幅・色・罫線などを極力保持する。

## 実装済み：コンテナバインドGASのテンプレート初期設定

- [gas/00_Config.gs](gas/00_Config.gs)：タブ／列／33表示定義／初期設定値
- [gas/01_EntryPoint.gs](gas/01_EntryPoint.gs)：`onOpen()`、`setupTemplate()`、`verifyTemplate()`、ヘルプ
- [gas/02_TemplateBase.gs](gas/02_TemplateBase.gs)：既存タブ構造の検査、**新規タブだけ**の作成・書式適用
- [gas/03_TemplateViews.gs](gas/03_TemplateViews.gs)：ホーム、設定、マスタ、分析画面の初期レイアウト
- [gas/appsscript.json](gas/appsscript.json)：V8・日本時間のマニフェスト
- [tests/template-smoke.js](tests/template-smoke.js)、[tests/run.cjs](tests/run.cjs)：GASのモックによる初期作成・再実行・ヘッダー異常検知テスト

### 初回の導入手順

1. Google Driveに**空のスプレッドシート**を新規作成する。
2. シートの「拡張機能」→「Apps Script」を開く（**このシートに紐づくコンテナバインドGAS**）。
3. `gas/` 内の4つの `.gs` ファイルの内容を、Apps Scriptエディタに同名のスクリプトファイルとしてコピーする。必要ならマニフェスト`appsscript.json`も反映する。
4. エディタで `setupTemplate()` を選択して実行し、Googleから求められたアクセス承認を行う。
5. スプレッドシートを再読込すると「有効応募分析」メニューが表示される。**「初期テンプレートを作成・確認」**または**「テンプレート状態を点検」**を使用する。
6. 空テンプレートが完成したら、その**スプレッドシート自体をコピー**して各メンバーへ配布できる。コピーしたシートにはコンテナバインドGASが付属する（初回承認は各利用者側で必要）。

**注意**：GitHubリポジトリにコミットしただけでは、Google Apps Scriptエディタやコピー済みスプレッドシートのコードは自動更新されません。連携・更新の自動化は初版の対象外です。

### 現時点の動作範囲

- 画面用9タブ＋内部5タブを作成し、入力セル・チェックボックス・選択候補の参照範囲を準備。
- Web版と同じ**33表示項目**、基本分析の**年代8区分**、カスタム分析の**3指標**を定義。
- 応募23列、求人20列（求人備考の**全文保存欄**を含む）、画像マスタ5列の見出しを準備。
- `setupTemplate()`を繰り返しても、**既に存在するタブの値や書式は上書きしない**。ヘッダーが設計と異なる場合、破壊的な修復をせず停止する。
- 基本分析・カスタム分析の候補は**集計・候補作成機能の実装までは空**。CSV取込後も応募進捗グラフ、画像、タグの実データ集計はまだ表示されない。

### 自動テスト

Node.jsが使えるローカル環境なら、依存パッケージ不要で次を実行できます。

```bash
node tests/run.cjs
```

モックテストは初回14タブ生成、2回目の値・書式保持、意図的なヘッダー異常での中止を検査します。**実Google Sheets上での動作検証は別途必要**です。

## 実装済み：CSVアップローダー v0.1（2026-10-16）

### 追加したソースコード

- [gas/04_CsvUpload.gs](gas/04_CsvUpload.gs)：シート内CSVダイアログ、取込セッション、CSV受信、型・参照関係の検証
- [gas/05_CsvPublish.gs](gas/05_CsvPublish.gs)：段階保存→旧データの復旧用コピー→全件置換→旧データ復旧
- [gas/CsvImport.html](gas/CsvImport.html)：応募／求人CSVのドラッグ＆ドロップ、件数プレビュー、取込実行、進捗・エラー表示
- [gas/CsvImportLogic.html](gas/CsvImportLogic.html)：ブラウザ内CSV解析、CSV_A/Bの列名正規化、名前＋月による重複排除、企業ID＋仕事番号の求人JOIN、ホワイトリスト出力
- [gas/01_EntryPoint.gs](gas/01_EntryPoint.gs)：上部メニューにCSV取込・状態確認・中断破棄・旧データ復旧を追加
- [tests/csv-import.test.cjs](tests/csv-import.test.cjs)：CSV_A/B、重複除外、求人備考全文・画像候補、直接個人情報非送信
- [tests/import-lifecycle.test.cjs](tests/import-lifecycle.test.cjs)：GAS模擬環境で段階保存・旧世代入替・中断時復旧・未完了取込の取消

### すでにテンプレート生成済みのスプレッドシートへ追加する

**スプレッドシート本体を再作成したり、`setupTemplate()`を再実行したりする必要はありません。**

1. 既存のスプレッドシートから「拡張機能」→「Apps Script」を開く。
2. `01_EntryPoint.gs`をGitHub上の最新内容に**丸ごと差し替え**る（上部メニュー用）。
3. `04_CsvUpload.gs`・`05_CsvPublish.gs`の**スクリプトファイル（.gs）**を追加する。
4. `CsvImport.html`・`CsvImportLogic.html`の**HTMLファイル**を追加する。GitHubファイルの内容をそのままコピーする。`CsvImportLogic.html`はJavaScriptだけでなく、`<script>`タグも含める。
5. 保存してスプレッドシートを再読込し、上部の「有効応募分析」→「CSV取込・全件更新」を開く。Googleの追加の承認を求められたら内容を確認して許可する。
6. 初回は**架空の応募／求人CSV**で取込をテストする。件数プレビューを確認した後、全件更新を実行する。

必要な既存ファイル：`00_Config.gs`・`02_TemplateBase.gs`・`03_TemplateViews.gs`はテンプレート生成時のままでよい。

### 取込結果

- `20_突合データ`：応募1件＝1行、23列。氏名・メール・電話・住所の詳細は非保存。
- `93_求人分析マスタ`：求人1件＝1行、20列。**求人備考全文を保存**。
- `94_画像マスタ`：画像ファイル名と公開求人管理番号の候補を保存。WorkerによるURL取得は後続工程。
- `00_ホーム`：CSV取込件数、突合率、最終CSV取込日とステータスを更新する。ただし**ターゲット数・ターゲット率は「集計待ち」**であり、まだ基本分析を実行しない。
- エラー時には、先に作業用非表示タブ（95～97）に送ったデータを検証する。入替前に復旧用コピー（98～100）を作り、途中失敗時は復旧を試みる。複数タブの原子更新は保証できないので、復旧できなければ「復旧待ち」を表示する。
- `基本分析`・`応募進捗`・`カスタム分析`・`TOP画像`・`Indeedタグ`の本集計とWorker取得は**まだ未実装**。

### 自動テスト

```bash
node tests/run.cjs
node tests/csv-import.test.cjs
node tests/import-lifecycle.test.cjs
```

ブラウザ側・GAS側のロジックは架空CSVと模擬スプレッドシートでテスト済み。**Googleの実サーバー上でのCSV取込・権限・速度・復旧動作はまだ未検証**なので、実応募CSVの前に必ず架空データで試す。

## 2026-10-16 Web版A/Bルールに合わせたJOIN修正

- [CSV突合ルールの監査とSTAGING残留への対応](docs/CSV_JOIN_TROUBLESHOOTING.md)
- **前回追加した「応募求人ID → 求人管理番号」の補助突合を撤回**。Web版の正式ルールに合わせ、企業ID＋正規化した仕事番号（応募CSV A: 仕事番号／お仕事NO、B: 応募求人ID）でのみ突合。
- A/B形式の列判定・正規化をファイル単位に統一。求人CSVは同一複合キーの先頭行を使用し、未突合分は応募CSV内の求人情報を補完。
- 取込プレビューで応募CSV形式（A／B／GENERIC）、求人CSV行数、仕事番号一致件数・企業IDの不足状況を診断できる。
- Web版未定義の「勤務場所名1」「雇用形態区分」「職種コード」等に対する独自変換は削除。今後の拡張は別途仕様として検討。
- 今回の**差し替え／追加対象は4ファイル**：`CsvImport.html`、`CsvImportLogic.html`、`04_CsvUpload.gs`、新規 `CommonMasters.html`。Web版の共通コード変換マスタも取り込んで、求人原稿文字数の計算を合わせる。
- 前回の取込が`STAGING`で止まっている場合は、他の取込が動作中でないことを確認して「有効応募分析 → 中断したCSV取込を破棄」を実行。既存テンプレートの再生成は不要。

## セキュリティ

**このGitHubリポジトリは公開設定。** 求人／応募の生CSV、個人情報、実データ、アクセスキー、Google Apps ScriptのScript Properties、認証情報などをコミットしない。

## 開発を始めるとき

このREADMEおよび表示仕様書を確認し、未決定事項を整理してからGAS／テンプレートの実装に進むこと。
