# 有効応募分析・スプレッドシート版（valid-app-sheets）

Google Sheetsを分析画面に使う、`valid-app` の派生プロジェクト。現在は**表示・データ・更新仕様の設計段階**で、アプリ／GASの実装はまだありません。

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

## セキュリティ

**このGitHubリポジトリは公開設定。** 求人／応募の生CSV、個人情報、実データ、アクセスキー、Google Apps ScriptのScript Properties、認証情報などをコミットしない。

## 開発を始めるとき

このREADMEおよび表示仕様書を確認し、未決定事項を整理してからGAS／テンプレートの実装に進むこと。
