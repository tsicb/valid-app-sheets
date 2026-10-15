/**
 * valid-app-sheets v0.1
 * Container-bound GAS. This phase creates only the template layout.
 * All named ranges / headers here are the source of truth for the template.
 */
const VAS_TEMPLATE_VERSION = '0.1.0';
const VAS_THEME = Object.freeze({
  navy: '#18324D',
  blue: '#236CA0',
  pale: '#EAF3FA',
  input: '#FFF6DC',
  green: '#E7F5ED',
  muted: '#607286',
  border: '#D6E1E8',
  white: '#FFFFFF',
  soft: '#F6F9FC'
});

const VAS_SHEETS = Object.freeze([
  {name:'00_ホーム', visible:true, kind:'home'},
  {name:'40_基本分析', visible:true, kind:'basic'},
  {name:'41_応募進捗', visible:true, kind:'progress'},
  {name:'42_カスタム分析', visible:true, kind:'custom'},
  {name:'43_TOP画像', visible:true, kind:'images'},
  {name:'44_Indeedタグ', visible:true, kind:'tags'},
  {name:'20_突合データ', visible:true, kind:'applications'},
  {name:'30_分析設定', visible:true, kind:'settings'},
  {name:'31_マスタ編集', visible:true, kind:'masters'},
  {name:'90_基本集計キャッシュ', visible:false, kind:'basicCache'},
  {name:'91_進捗キャッシュ', visible:false, kind:'progressCache'},
  {name:'92_運用管理', visible:false, kind:'state'},
  {name:'93_求人分析マスタ', visible:false, kind:'jobs'},
  {name:'94_画像マスタ', visible:false, kind:'imageMaster'}
]);

const VAS_AGE_LABELS = Object.freeze(['10代','20代','30代','40代','50代','60代','70代','その他']);
const VAS_BASIC_HEADERS = Object.freeze([
  '分類','総応募数','ターゲット応募数','ターゲット率',
  ...VAS_AGE_LABELS
]);
const VAS_APPLICATION_HEADERS = Object.freeze([
  'レコードID','企業ID','仕事番号','求人参照ID','求人データ突合フラグ',
  '応募日付','応募年月','月内応募日','応募曜日','応募時間',
  '応募数','対応状況','応募媒体','年齢','性別','氏名文字種区分',
  '居住都道府県','勤務地・居住都道府県一致','職種','雇用形態',
  '勤務地都道府県','求人勤務地名称','求人分析情報ソース'
]);
const VAS_JOB_HEADERS = Object.freeze([
  '求人参照ID','求人分析情報ソース','企業ID','仕事番号','求人管理番号',
  '仕事名','職種','雇用形態','募集背景','求人勤務地名称',
  '勤務地都道府県','求人備考','給与区分コード','給与金額MIN',
  'メイン画像ファイル名','求人画像枚数','求人動画あり',
  'Indeed求人タグコード','Indeed求人タグ数','求人原稿文字数'
]);
const VAS_IMAGE_MASTER_HEADERS = Object.freeze([
  '画像ファイル名','公開求人候補ID','画像URL','取得状態','最終取得日時'
]);
const VAS_BASIC_CACHE_HEADERS = Object.freeze([
  '指標ID',...VAS_BASIC_HEADERS
]);
const VAS_TAG_HEADERS = Object.freeze([
  'タグコード','タグ名称','対象求人数','総応募数','ターゲット応募数',
  'ターゲット率',...VAS_AGE_LABELS
]);
const VAS_IMAGE_HEADERS = Object.freeze([
  '画像','画像ファイル名','対象求人数','総応募数','ターゲット応募数',
  'ターゲット率',...VAS_AGE_LABELS
]);

// Matches the Web version's 33 display switches; these are not the 30 custom axes.
const VAS_DISPLAY_ITEMS = Object.freeze([
  ['month-progress','月間応募進捗',true],
  ['age','年代構成',true],
  ['status','対応状況別',true],
  ['month','応募月別',true],
  ['media','応募媒体別',true],
  ['enterprise','企業ID別',false],
  ['gender','性別ごと',true],
  ['name-script','氏名文字種区分別',true],
  ['residence','居住都道府県別',true],
  ['job-category','職種別',true],
  ['employment','雇用形態別',true],
  ['job-location-name','求人勤務地名称別',true],
  ['job-prefecture','勤務地都道府県別',true],
  ['prefecture-match','勤務地・居住都道府県一致別',true],
  ['job-keyword','仕事名KW別',true],
  ['job-full-keyword','仕事名フルKW別',true],
  ['recruit-background','募集背景別',true],
  ['month-day','月内応募日別',true],
  ['weekday','応募曜日別',true],
  ['hour','応募時間帯別',true],
  ['hourly-salary','時給下限別',true],
  ['daily-salary','日給下限別',true],
  ['monthly-salary','月給下限別',true],
  ['annual-salary','年収下限別',true],
  ['text-length','求人原稿文字数別',true],
  ['main-image','メイン画像有無別',true],
  ['image-count','求人画像枚数別',true],
  ['job-video','求人動画有無別',true],
  ['indeed-tag-count','Indeed求人タグ数別',true],
  ['note-detail','求人備考1行目別応募傾向',true],
  ['indeed-tag-detail','Indeed求人タグ別応募傾向',true],
  ['top-image-detail','TOP画像別応募傾向',true],
  ['custom-analysis','カスタム分析',true]
]);

// Cell coordinates from docs/TEMPLATE_LAYOUT_SPEC_DRAFT.md.
const VAS_SETTING_SPECS = Object.freeze([
  ['B5','集計開始日','date',null],
  ['B6','集計終了日','date',null],
  ['B9','集計対象年齢下限','int',null],
  ['B10','集計対象年齢上限','int',null],
  ['B13','ターゲット年齢下限','int',null],
  ['B14','ターゲット年齢上限','int',null],
  ['B17','月内応募日バケット幅','positive',7],
  ['B18','応募時間帯バケット幅','positive',6],
  ['B19','時給下限バケット幅','positive',50],
  ['B20','日給下限バケット幅','positive',1000],
  ['B21','月給下限バケット幅','positive',50000],
  ['B22','年収下限バケット幅','positive',500000],
  ['B23','求人原稿文字数バケット幅','positive',300],
  ['B24','求人画像枚数バケット幅','positive',1],
  ['B25','Indeed求人タグ数バケット幅','positive',5],
  ['B28','応募進捗表示モード','progress-mode','日別'],
  ['B29','月間着地予測','bool',true],
  ['B30','比較グラフの月数','positive',3],
  ['B33','TOP画像タブの表示','bool',true],
  ['B34','Indeedタグタブの表示','bool',true]
]);

const VAS_MASTER_HEADERS = Object.freeze({
  keywords:['仕事名KW','有効','補足'],
  enterprises:['企業ID','表示名','有効'],
  tags:['Indeedタグコード','タグ名称','有効']
});
