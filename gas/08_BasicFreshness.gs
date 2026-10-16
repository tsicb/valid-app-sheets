/**
 * Applied conditions and freshness detection for 40_基本分析.
 * The home displays LAST APPLIED settings, not live editable settings.
 * No applicant/job data is read here: this is lightweight for onEdit/onOpen.
 */
const VAS_BASIC_SETTING_CELLS_ = Object.freeze([
  'B5','B6','B9','B10','B13','B14','B17','B18',
  'B19','B20','B21','B22','B23','B24','B25'
]);
function vasBasicReadMasterRows_(sheet) {
  if(!sheet)return [];
  const last=sheet.getLastRow();
  if(last<5)return [];
  return sheet.getRange(5,1,last-4,7).getValues();
}
function vasBasicSnapshotFromSheet_(settings,masterSheet) {
  const input={};
  // One range read instead of 15 individual Spreadsheet service calls.
  const column=settings.getRange('B5:B25').getValues();
  VAS_BASIC_SETTING_CELLS_.forEach(a1=>{
    input[a1]=column[Number(a1.slice(1))-5][0];
  });
  const toggles=settings.getRange(5,7,VAS_DISPLAY_ITEMS.length,3).getValues();
  const enabled=new Map(toggles.map(r=>[String(r[0]),r[2]===true]));
  return {
    options:vasParseSettings_(input),
    enabled:VAS_BASIC_AXES_.map(([id])=>[id,enabled.get(id)===true]),
    // Track active keywords/company labels only. Notes/disabled rows do
    // not affect the resulting basic analysis.
    masters:vasExtractBasicMasters_(vasBasicReadMasterRows_(masterSheet))
  };
}
function vasAgeLabel_(min,max) {
  if(min!=null&&max!=null)return min+'～'+max+'歳';
  if(min!=null)return min+'歳以上';
  if(max!=null)return max+'歳以下';
  return '全年齢';
}
function vasPeriodLabel_(opts){
  if(!opts.start&&!opts.end)return '全期間';
  return (opts.start||'指定なし')+' ～ '+(opts.end||'指定なし');
}
function vasWriteAppliedBasicConditions_(ss,snapshot){
  const home=ss.getSheetByName('00_ホーム');
  const settings=ss.getSheetByName('30_分析設定');
  const o=snapshot.options;
  home.getRange('B8').setValue(vasPeriodLabel_(o));
  home.getRange('B9').setValue(
    '対象：'+vasAgeLabel_(o.ageMin,o.ageMax)+
    ' ／ ターゲット：'+vasAgeLabel_(o.targetMin,o.targetMax)+
    (o.targetMin==null&&o.targetMax==null?'（年齢不明を除く）':'')
  );
  home.getRange('B15').setValue('基本分析反映済み');
  settings.getRange('B38').setValue('基本分析反映済み');
}
/**
 * Normalize a stored snapshot as a JSON string, in stable field order.
 */
function vasCompareBasicSnapshot_(settings,state){
  const applied=String(state.basic_applied_config||'');
  if(!applied)return '基本分析の再集計が必要';
  if(String(state.basic_analysis_generation||'')!==
     String(state.active_generation||''))return 'CSV更新後・基本分析未反映';
  try{
    const sheet=SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('31_マスタ編集');
    const current=vasBasicSnapshotFromSheet_(settings,sheet);
    if(JSON.stringify(current)!==applied)return '設定変更あり・再集計未反映';
    return '基本分析反映済み';
  }catch(_){
    return '設定値を確認・再集計未反映';
  }
}
function vasRefreshBasicStatus_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const home=ss.getSheetByName('00_ホーム');
  const settings=ss.getSheetByName('30_分析設定');
  const control=ss.getSheetByName('92_運用管理');
  if(!home||!settings||!control)return;
  const state=vasStateSnapshot_();
  // CSV import transaction owns these statuses until its end.
  if(String(state.import_status)!=='READY')return;
  const next=vasCompareBasicSnapshot_(settings,state);
  if(String(home.getRange('B15').getDisplayValue())!==next)
    home.getRange('B15').setValue(next);
  if(String(settings.getRange('B38').getDisplayValue())!==next)
    settings.getRange('B38').setValue(next);
}
function vasOnEditBasicStatus_(e) {
  if(!e||!e.range)return;
  const r=e.range;
  const tab=r.getSheet().getName();
  if(tab!=='30_分析設定'&&tab!=='31_マスタ編集')return;
  const inRows=(lo,hi)=>r.getRow()<=hi&&r.getLastRow()>=lo;
  const inCol=column=>r.getColumn()<=column&&r.getLastColumn()>=column;
  if(tab==='31_マスタ編集') {
    // A:B = priority KW/enable; E:G = enterprise ID/label/enable.
    if(inRows(5,Math.max(5,r.getSheet().getLastRow()))&&
       (inCol(1)||inCol(2)||inCol(5)||inCol(6)||inCol(7)))
      vasRefreshBasicStatus_();
    return;
  }
  const inputTouched=inCol(2)&&VAS_BASIC_SETTING_CELLS_.some(a1=>{
    const row=Number(a1.slice(1));
    return inRows(row,row);
  });
  const togglesTouched=inCol(9)&&inRows(5,4+VAS_DISPLAY_ITEMS.length);
  if(inputTouched||togglesTouched)vasRefreshBasicStatus_();
}
