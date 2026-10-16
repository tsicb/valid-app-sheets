/**
 * Sheets custom-analysis UI v0.1.
 * The 92_運用管理 J:K axis list is separate from A:B operational keys
 * and from G:H basic-analysis choices.
 */
function vasCustomSelection_(view){
 const vals=view.getRange('B3:B5').getValues().map(r=>vasStr_(r[0]));
 return {
  rowAxes:vals.filter(Boolean),
  colAxis:vasStr_(view.getRange('E3').getValue()),
  metric:vasStr_(view.getRange('E4').getValue())||'応募数'
 };
}
function vasCustomSignature_(selection,snapshot){
 return JSON.stringify({
  selection,
  options:snapshot.options,
  enabled:snapshot.enabled,
  masters:snapshot.masters
 });
}
function vasCustomRefreshStatus_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const view=ss.getSheetByName('42_カスタム分析');
 const setting=ss.getSheetByName('30_分析設定');
 if(!view||!setting)return;
 const state=vasStateSnapshot_();
 if(String(state.import_status)!=='READY')return;
 let label='カスタム分析を実行してください';
 if(state.custom_applied_config){
  if(String(state.custom_generation)!==String(state.active_generation))
   label='CSV更新後・カスタム分析未反映';
  else{
   try {
    const snap=vasBasicSnapshotFromSheet_(
      setting,ss.getSheetByName('31_マスタ編集'));
    label=vasCustomSignature_(vasCustomSelection_(view),snap)===
      String(state.custom_applied_config)?
       'カスタム分析反映済み':'設定変更あり・カスタム分析未反映';
   }catch(_){label='設定値を確認・カスタム分析未反映';}
  }
 }
 const old=vasStr_(view.getRange('A8').getDisplayValue());
 if(old!==label&&!old.startsWith(label+'｜'))
  view.getRange('A8').setValue(label);
}
function vasCustomOnEdit_(e){
 if(!e||!e.range)return;
 const r=e.range,tab=r.getSheet().getName();
 const touches=(c1,c2,r1,r2)=>
  r.getColumn()<=c2&&r.getLastColumn()>=c1&&
  r.getRow()<=r2&&r.getLastRow()>=r1;
 if(tab==='42_カスタム分析'){
  if(touches(2,2,3,5)||touches(5,5,3,4))vasCustomRefreshStatus_();
  return;
 }
 if(tab==='30_分析設定'){
  if(touches(2,2,5,25)||touches(9,9,5,4+VAS_DISPLAY_ITEMS.length))
   vasCustomRefreshStatus_();
 }else if(tab==='31_マスタ編集'){
  if(r.getLastRow()>=5&&(touches(1,2,5,r.getLastRow())||
       touches(5,7,5,r.getLastRow())))
    vasCustomRefreshStatus_();
 }
}
function vasCustomInstallChoices_(ss,choices,withDefaults){
 const control=ss.getSheetByName('92_運用管理');
 const view=ss.getSheetByName('42_カスタム分析');
 if(!control||!view)throw new Error('カスタム分析の操作タブがありません。');
 const last=Math.max(100,choices.length+1);
 if(control.getMaxRows()<last)vasEnsureRows_(control,last);
 // Restrict to our own K:J axis lookup columns, not state A:B.
 control.getRange(2,10,control.getMaxRows()-1,2).clearContent();
 if(choices.length){
  const rows=choices.map(name=>[
    VAS_CUSTOM_AXIS_BY_NAME_.get(name)[1],name
  ]);
  control.getRange(2,10,rows.length,2).setValues(rows);
 }
 const axisRange=control.getRange(2,11,Math.max(1,choices.length),1);
 const v=SpreadsheetApp.newDataValidation()
  .requireValueInRange(axisRange,true).setAllowInvalid(false).build();
 if(withDefaults&&choices.length){
  const axes=vasCustomSelection_(view);
  const used=new Set();
  const preserved=axes.rowAxes.filter(name=>{
    if(!choices.includes(name)||used.has(name))return false;
    used.add(name);return true;
  });
  const first=preserved[0]||choices[0];
  const column=axes.colAxis&&choices.includes(axes.colAxis)&&
    axes.colAxis!==first?axes.colAxis:
      (choices.find(x=>x!==first)||'');
  view.getRange('B3').setValue(first);
  // Preserve valid secondary row dimensions; discard removed axes.
  for(let i=1;i<3;i++){
   const value=preserved[i]&&preserved[i]!==column?preserved[i]:'';
   view.getRange('B'+(3+i)).setValue(value);
  }
  view.getRange('E3').setValue(column);
  if(!VAS_CUSTOM_METRICS_.includes(axes.metric))
    view.getRange('E4').setValue('応募数');
 }
 view.getRange('B3:B5').setDataValidation(v);
 view.getRange('E3').setDataValidation(v);
 view.getRange('E4').setDataValidation(
  SpreadsheetApp.newDataValidation()
    .requireValueInList([...VAS_CUSTOM_METRICS_],true)
    .setAllowInvalid(false).build()
 );
}
function vasCustomSources_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 if(vasStatus_()!=='READY')
  throw new Error('まずCSV全件取込を完了してください。');
 const settings=ss.getSheetByName('30_分析設定');
 const snapshot=vasBasicSnapshotFromSheet_(
  settings,ss.getSheetByName('31_マスタ編集'));
 const apps=vasReadVisibleRange_(
  ss.getSheetByName('20_突合データ'),VAS_APPLICATION_HEADERS.length);
 const jobs=vasReadVisibleRange_(
  ss.getSheetByName('93_求人分析マスタ'),VAS_JOB_HEADERS.length);
 const enabled=new Map(snapshot.enabled);
 const choices=vasCustomAxisChoices_(apps,jobs,snapshot.masters,enabled);
 return {ss,snapshot,apps,jobs,choices};
}
/** Refresh the list independently of current period/age filters. */
function refreshCustomAxes(){
 const lock=vasImportLock_();
 try {
  const src=vasCustomSources_();
  vasCustomInstallChoices_(src.ss,src.choices,true);
  vasCustomRefreshStatus_();
  SpreadsheetApp.getUi().alert('分析軸の候補を更新しました：'+
    src.choices.length+'項目。\nB3～B5とE3で軸を選び、'+
    '「カスタム分析を実行」を押してください。');
 }catch(e){
  SpreadsheetApp.getUi().alert('カスタム分析候補の更新に失敗しました。\n'+
    String(e.message||e));
  throw e;
 }finally{lock.releaseLock();}
}
function vasCustomPreflight_(ss,view,result){
 const neededRows=12+Math.max(1,result.rows.length)+1;
 const neededCols=result.numCols;
 const colsLimit=18278,gridLimit=10000000;
 if(neededCols>colsLimit)throw new Error(
  '分析列がGoogle Sheetsの列数上限を超えます。集計対象を変更してください。');
 // Check global capacity before expanding any sheet; do not truncate.
 let grid=0;
 for(const sheet of ss.getSheets()){
  const rows=sheet===view?Math.max(sheet.getMaxRows(),neededRows):
   sheet.getMaxRows();
  const cols=sheet===view?Math.max(sheet.getMaxColumns(),neededCols):
   sheet.getMaxColumns();
  grid+=rows*cols;
 }
 if(grid>gridLimit)throw new Error(
  '全カテゴリを表示するとスプレッドシート全体のセル上限'+
  '（1,000万セル）を超えます。データや軸の組合せを見直してください。'+
  ' 集計結果は省略せず、実行を中止しました。');
 return {neededRows,neededCols};
}
function vasCustomPublish_(ss,view,result,snapshot,selection){
 const state=vasStateSnapshot_();
 const previousRows=Math.max(0,Number(state.custom_output_rows)||0);
 const previousCols=Math.max(0,Number(state.custom_output_cols)||0);
 const {neededRows,neededCols}=vasCustomPreflight_(ss,view,result);
 vasEnsureRows_(view,neededRows);
 vasEnsureColumns_(view,neededCols);
 const clearRows=Math.max(previousRows,neededRows-11,1);
 const clearCols=Math.max(previousCols,neededCols,5);
 // All writes restricted to A12 onward; keep user colors and column widths.
 view.getRange(12,1,clearRows,clearCols).clearContent();
 const headers=result.headers.map(x=>vasSafeCell_(x));
 view.getRange(12,1,1,neededCols).setValues([headers]);
 const body=result.rows.map(row=>row.map(vasSafeCell_));
 if(result.used===0){
  view.getRange('A13').setValue(
    '該当するデータがありません。期間・年齢・分析軸をご確認ください。');
 }else{
  const packetRows=Math.max(1,Math.floor(10000/neededCols));
  for(let pos=0;pos<body.length;pos+=packetRows){
   const rows=body.slice(pos,pos+packetRows);
   view.getRange(13+pos,1,rows.length,neededCols).setValues(rows);
  }
  view.getRange(13+body.length,1,1,neededCols).setValues([
   result.totals.map(vasSafeCell_)
  ]);
  const fmt=result.metric==='ターゲット率'?'0.0%':'#,##0';
  view.getRange(13,4,body.length+1,neededCols-3).setNumberFormat(fmt);
 }
 view.getRange(12,1,1,neededCols)
   .setBackground(VAS_THEME.blue).setFontColor(VAS_THEME.white)
   .setFontWeight('bold');
 // Explicitly mark the applied generation and configuration after output.
 SpreadsheetApp.flush();
 vasStateBulkSet_({
  custom_generation:vasStateGet_('active_generation'),
  custom_applied_config:vasCustomSignature_(selection,snapshot),
  custom_output_rows:Math.max(1,body.length+2),
  custom_output_cols:neededCols,
  custom_last_calculated_at:new Date()
 });
 view.getRange('A8').setValue(
  'カスタム分析反映済み｜'+result.scope+
  '｜対象応募：'+result.used+'件｜'+new Date().toLocaleString('ja-JP')
 );
 SpreadsheetApp.flush();
}
/** Explicit analysis execution. No computation in an edit handler. */
function applyCustomAnalysis(){
 const lock=vasImportLock_();
 try{
  const src=vasCustomSources_();
  // Update choices, but do not silently reinterpret selected axes.
  vasCustomInstallChoices_(src.ss,src.choices,false);
  const view=src.ss.getSheetByName('42_カスタム分析');
  const selection=vasCustomSelection_(view);
  if(!selection.rowAxes.length||!selection.colAxis)
   throw new Error('先に「カスタム分析候補を更新」を実行し、'+
     '行軸と列軸を選択してください。');
  const result=vasCustomCalculate_(src.apps,src.jobs,{
   ...selection,choices:src.choices,
   settings:src.snapshot.options,masters:src.snapshot.masters
  });
  vasCustomPublish_(src.ss,view,result,src.snapshot,selection);
  SpreadsheetApp.getUi().alert(
   'カスタム分析を更新しました。\n'+
   '対象応募：'+result.used+'件\n'+
   '行カテゴリ：'+result.rows.length+'組合せ\n'+
   '列カテゴリ：'+result.columnLabels.length+'種類。'
  );
 }catch(e){
  SpreadsheetApp.getUi().alert('カスタム分析を更新できませんでした。\n'+
   String(e.message||e));
  throw e;
 }finally{lock.releaseLock();}
}
