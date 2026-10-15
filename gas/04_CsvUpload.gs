/**
 * CSV import server: bound to the user's copied spreadsheet.
 * The client transmits only whitelisted canonical arrays, NEVER raw CSV.
 * The old live sheets are untouched until all staged data is validated.
 */
const VAS_DATASETS_ = Object.freeze({
  applicationData:{stage:'95_作業応募',live:'20_突合データ',backup:'98_復旧応募',
    headers:VAS_APPLICATION_HEADERS},
  jobAnalysisMaster:{stage:'96_作業求人',live:'93_求人分析マスタ',backup:'99_復旧求人',
    headers:VAS_JOB_HEADERS},
  imageCandidates:{stage:'97_作業画像',live:'94_画像マスタ',backup:'100_復旧画像',
    headers:VAS_IMAGE_MASTER_HEADERS}
});
const VAS_UPLOAD_MAX_CHARS_ = 250000;
const VAS_UPLOAD_MAX_ROWS_ = 200;
const VAS_SESSION_STALE_MS_ = 45*60*1000;

function vasInclude_(fileName) {
  if(fileName!=='CsvImportLogic')throw new Error('このHTMLファイルは読み込めません。');
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

function openCsvDialog() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const check=vasInspectExistingTemplate_(ss);
  if(check.errors.length||check.missing.length) {
    SpreadsheetApp.getUi().alert(
      'テンプレートを先に作成・点検してください。\n' +
      check.errors.concat(check.missing).join('\n')
    );
    return;
  }
  const ui=HtmlService.createTemplateFromFile('CsvImport')
    .evaluate().setWidth(900).setHeight(730);
  SpreadsheetApp.getUi().showModalDialog(ui,'CSV取込・全件更新');
}

function vasImportLock_() {
  const lock=LockService.getDocumentLock();
  if(!lock||!lock.tryLock(30000))throw new Error('ほかの更新処理が実行中です。');
  return lock;
}
function vasStateGet_(key) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('92_運用管理');
  const last=Math.max(sheet.getLastRow(),2);
  const vals=sheet.getRange(2,1,last-1,2).getValues();
  for(const [k,v] of vals)if(k===key)return v;
  return '';
}
function vasStateSet_(key,value) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('92_運用管理');
  const last=Math.max(sheet.getLastRow(),2);
  const vals=sheet.getRange(2,1,last-1,1).getValues();
  for(let i=0;i<vals.length;i++)if(vals[i][0]===key){
    sheet.getRange(i+2,2).setValue(value);return;
  }
  sheet.getRange(last+1,1,1,2).setValues([[key,value]]);
}
function vasStatus_() {return String(vasStateGet_('import_status')||'UNIMPORTED');}
function vasImportAssertId_(id) {
  if(!id||String(vasStateGet_('upload_session'))!==String(id))
    throw new Error('取込セッションが一致しません。最初からやり直してください。');
}
function vasStageSheet_(spec) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(spec.stage);
  if(sheet)return sheet;
  sheet=ss.insertSheet(spec.stage);
  const headers=spec.headers;
  if(sheet.getMaxColumns()<headers.length)
    sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.hideSheet();
  return sheet;
}
function vasDeleteIfExists_(name) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sh=ss.getSheetByName(name);
  if(sh)ss.deleteSheet(sh);
}
function vasCleanStages_() {
  Object.keys(VAS_DATASETS_).forEach(k=>vasDeleteIfExists_(VAS_DATASETS_[k].stage));
}
function vasCleanBackups_() {
  Object.keys(VAS_DATASETS_).forEach(k=>vasDeleteIfExists_(VAS_DATASETS_[k].backup));
}
function vasUploadExpected_(kind) {
  return Number(vasStateGet_('expected_'+kind))||0;
}
function vasMakeId_() {
  return Utilities.getUuid().replace(/-/g,'').slice(0,24);
}
function vasSafeCell_(value) {
  if(value===null||value===undefined)return '';
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('数値に無効な値が含まれています。');
    return value;
  }
  if(typeof value!=='string'&&typeof value!=='boolean')
    throw new Error('送信データに許可されない型が含まれています。');
  const text=String(value);
  if(text.length>45000)throw new Error('セルの文字数が上限を超えています。');
  // setValues() evaluates formulas beginning with "=". The apostrophe is
  // interpreted as an explicit text prefix by Google Sheets.
  return /^[=+@]/.test(text)?("'"+text):text;
}
function vasValidatedRows_(kind,rows) {
  const spec=VAS_DATASETS_[kind];
  if(!spec)throw new Error('不正なデータセットです。');
  if(!Array.isArray(rows)||rows.length>VAS_UPLOAD_MAX_ROWS_)
    throw new Error('一度に送れる行数の上限を超えました。');
  const text=JSON.stringify(rows);
  if(text.length>VAS_UPLOAD_MAX_CHARS_)
    throw new Error('一度に送れる文字数の上限を超えました。');
  return rows.map((r,i)=>{
    if(!Array.isArray(r)||r.length!==spec.headers.length)
      throw new Error('データの列数が一致しません：'+kind+' の '+(i+1)+' 行目');
    return r.map(vasSafeCell_);
  });
}
function vasEnsureRows_(sheet,n) {
  if(sheet.getMaxRows()<n)sheet.insertRowsAfter(sheet.getMaxRows(),n-sheet.getMaxRows());
}
function vasReadVisibleRange_(sh,columns) {
  const last=sh.getLastRow();
  if(last<2)return [];
  return sh.getRange(2,1,last-1,columns).getValues();
}

/**
 * New upload discards abandoned STAGING only after its lease expires.
 * PUBLISHING / RECOVERY_REQUIRED are never overwritten automatically.
 */
function beginVASImport(summary,expected) {
  const lock=vasImportLock_();
  try {
    const state=vasStatus_();
    if(state==='PUBLISHING'||state==='RECOVERY_REQUIRED')
      throw new Error('前回の更新が復旧待ちです。「取込状態を確認」を実行してください。');
    if(state==='STAGING'||state==='PREPARED'){
      const started=Number(vasStateGet_('upload_started_ms'))||0;
      if(Date.now()-started<VAS_SESSION_STALE_MS_)
        throw new Error('別のCSV取込が進行中です。終了するか、しばらく後にやり直してください。');
    }
    if(!summary||typeof summary!=='object'||!expected||typeof expected!=='object')
      throw new Error('取込サマリがありません。');
    const names=Object.keys(VAS_DATASETS_);
    names.forEach(kind=>{
      const n=expected[kind];
      if(!Number.isInteger(n)||n<0||n>1000000)
        throw new Error('データ件数が無効です：'+kind);
    });
    if(expected.applicationData<1)throw new Error('応募データが0件です。更新できません。');
    if(Number(summary.totalApplications)!==expected.applicationData||
       Number(summary.jobRecords)!==expected.jobAnalysisMaster||
       Number(summary.imageTargets)!==expected.imageCandidates)
      throw new Error('取込件数に不整合があります。');
    // READY leftovers are safe post-publish cleanup artifacts. Non-READY
    // backups may be needed for recovery and must not be discarded.
    if(state==='READY')vasCleanBackups_();
    for(const k of names)if(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VAS_DATASETS_[k].backup))
      throw new Error('復旧用データが残っています。新規取込の前に状態を点検してください。');
    vasCleanStages_();
    for(const k of names)vasStageSheet_(VAS_DATASETS_[k]);
    const id=vasMakeId_();
    const prior=(state==='STAGING'||state==='PREPARED')
      ? String(vasStateGet_('previous_import_status')||'UNIMPORTED') : state;
    vasStateSet_('previous_import_status',prior);
    vasStateSet_('upload_session',id);
    vasStateSet_('upload_started_ms',Date.now());
    vasStateSet_('upload_summary',JSON.stringify({
      incomingApplications:Number(summary.incomingApplications)||0,
      duplicateCount:Number(summary.duplicateCount)||0,
      totalApplications:Number(summary.totalApplications)||0,
      matchedApplications:Number(summary.matchedApplications)||0,
      embeddedApplications:Number(summary.embeddedApplications)||0,
      jobRecords:Number(summary.jobRecords)||0,
      imageTargets:Number(summary.imageTargets)||0
    }));
    for(const kind of names){
      vasStateSet_('expected_'+kind,expected[kind]);
      vasStateSet_('next_'+kind,0);
    }
    vasStateSet_('import_status','STAGING');
    return {sessionId:id};
  } finally {lock.releaseLock();}
}

function appendVASImportChunk(sessionId,kind,index,rows) {
  const lock=vasImportLock_();
  try {
    vasImportAssertId_(sessionId);
    if(vasStatus_()!=='STAGING')throw new Error('このセッションは受付中ではありません。');
    const expectedIndex=Number(vasStateGet_('next_'+kind))||0;
    if(index<expectedIndex)return {ok:true,duplicate:true};
    if(index!==expectedIndex)throw new Error('データの送信順序が正しくありません。');
    const validated=vasValidatedRows_(kind,rows);
    const spec=VAS_DATASETS_[kind],sheet=vasStageSheet_(spec);
    const written=Math.max(0,sheet.getLastRow()-1);
    if(written+validated.length>vasUploadExpected_(kind))
      throw new Error('予定件数を超える行を受信しました。');
    if(validated.length){
      vasEnsureRows_(sheet,written+validated.length+1);
      sheet.getRange(written+2,1,validated.length,spec.headers.length)
        .setValues(validated);
    }
    vasStateSet_('next_'+kind,expectedIndex+1);
    return {ok:true,rows:written+validated.length};
  } finally {lock.releaseLock();}
}

function vasImportCheckAll_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  for(const kind of Object.keys(VAS_DATASETS_)){
    const spec=VAS_DATASETS_[kind];
    const sh=ss.getSheetByName(spec.stage);
    if(!sh)throw new Error('作業領域が見つかりません：'+kind);
    if(sh.getLastRow()-1!==vasUploadExpected_(kind))
      throw new Error('取込件数が一致しません：'+kind);
    const h=sh.getRange(1,1,1,spec.headers.length).getDisplayValues()[0];
    if(h.some((x,i)=>x!==spec.headers[i]))throw new Error('作業領域の列定義が不正です：'+kind);
  }
  const app=vasReadVisibleRange_(ss.getSheetByName(VAS_DATASETS_.applicationData.stage),VAS_APPLICATION_HEADERS.length);
  const jobs=vasReadVisibleRange_(ss.getSheetByName(VAS_DATASETS_.jobAnalysisMaster.stage),VAS_JOB_HEADERS.length);
  const refs=new Map();
  for(const r of jobs){
    const ref=String(r[0]||'');
    if(!ref||refs.has(ref))throw new Error('求人参照IDが空欄または重複しています。');
    refs.set(ref,r[1]);
  }
  for(const r of app){
    if(r[3]&&!refs.has(String(r[3])))throw new Error('存在しない求人参照IDがあります。');
    if(Number(r[4])===1&&(!r[3]||refs.get(String(r[3]))!=='JOB_CSV'))
      throw new Error('求人CSV突合フラグと求人マスタの情報源が一致しません。');
  }
  return {applications:app.length,jobs:jobs.length};
}
