# 有効応募分析・スプレッドシート版（valid-app-sheets）

Google Sheetsを分析画面に使う、`valid-app` の派生プロジェクト。現在は**空テンプレート生成GASの初版を実装済み**です。CSV取込・求人突合・本集計・画像取得はまだ未実装です。

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
- 基本分析・カスタム分析のデータ候補は**CSV取込機能の実装までは空**。応募進捗グラフ、画像、タグの実データ集計もまだ表示されない。

### 自動テスト

Node.jsが使えるローカル環境なら、依存パッケージ不要で次を実行できます。

```bash
node tests/run.cjs
```

モックテストは初回14タブ生成、2回目の値・書式保持、意図的なヘッダー異常での中止を検査します。**実Google Sheets上での動作検証は別途必要**です。

## セキュリティ

**このGitHubリポジトリは公開設定。** 求人／応募の生CSV、個人情報、実データ、アクセスキー、Google Apps ScriptのScript Properties、認証情報などをコミットしない。

## 開発を始めるとき

このREADMEおよび表示仕様書を確認し、未決定事項を整理してからGAS／テンプレートの実装に進むこと。
