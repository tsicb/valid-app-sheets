/**
 * 43_TOP画像 and 44_Indeedタグ: fixed 14-column reports.
 * The importer already stores approved job/image attributes in 93/94.
 * No new CSV ingestion and no changes to original applicant or job data.
 */
function vasDetailMasterRows_(ss){
 const sh=ss.getSheetByName('31_マスタ編集');
 const last=sh.getLastRow();
 return last>=5?sh.getRange(5,9,last-4,3).getValues():[];
}
function vasDetailSettings_(ss) {
 const setting=ss.getSheetByName('30_分析設定');
 const inputs=setting.getRange('B5:B14').getValues();
 const get=i=>inputs[i-5][0];
 const values={B5:get(5),B6:get(6),B9:get(9),B10:get(10),
  B13:get(13),B14:get(14)};
 const opts=vasParseSettings_(values);
 if(opts.start&&opts.end&&opts.start>opts.end)
  throw new Error('集計開始日が集計終了日より後です。');
 if(opts.ageMin!=null&&opts.ageMax!=null&&opts.ageMin>opts.ageMax)
  throw new Error('集計対象年齢が逆転しています。');
 if(opts.targetMin!=null&&opts.targetMax!=null&&opts.targetMin>opts.targetMax)
  throw new Error('ターゲット年齢が逆転しています。');
 return {
  start:opts.start,end:opts.end,ageMin:opts.ageMin,ageMax:opts.ageMax,
  targetMin:opts.targetMin,targetMax:opts.targetMax
 };
}
function vasDetailSnapshot_(ss){
 const options=vasDetailSettings_(ss);
 const tags=vasDetailTagMaster_(vasDetailMasterRows_(ss));
 // Sorted to canonicalize identical master content regardless of empty rows.
 return JSON.stringify({options,tagNames:[...tags].sort((a,b)=>a[0].localeCompare(b[0]))});
}
function vasDetailImageUrl_(value){
 const url=vasStr_(value);
 // External sources are not trusted formulas. Images can come from vendor
 // domains, but may only use normal HTTPS without credentials/quotes.
 if(!/^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/i.test(url)||
  url.length>2048||/["'\\<>\x00-\x1f]/.test(url))return '';
 const host=url.slice(8).split(/[/?#]/)[0].toLowerCase();
 if(host.includes('@')||host.includes(':')||host==='localhost'||
  host.endsWith('.localhost')||host.endsWith('.local')||
  /^\d+(?:\.\d+){3}$/.test(host)||host.startsWith('['))return '';
 return url;
}
function vasDetailImageFormula_(url){
 const accepted=vasDetailImageUrl_(url);
 return accepted?'=IFERROR(IMAGE("'+accepted+'",4,80,120),"")':'';
}
function vasDetailImageMap_(rows){
 const entries=new Map();
 for(const r of rows||[]){
  const name=vasStr_(r[0]),url=vasDetailImageUrl_(r[2]);
  if(name&&url)entries.set(name,url);
 }
 return entries;
}
function vasDetailPreflight_(ss,result){
 let total=0;
 for(const sh of ss.getSheets()){
  const added=sh.getName()==='43_TOP画像'?result.images.length:
    sh.getName()==='44_Indeedタグ'?result.tags.length:0;
  total+=Math.max(sh.getMaxRows(),Math.max(9,8+added))*sh.getMaxColumns();
 }
 if(total>10000000)throw new Error(
  '全カテゴリの出力に必要なセル数がGoogle Sheetsの上限を超えます。'+
  '省略せず中止しました。');
}
function vasDetailEnsureHeader_(sheet,header){
 const actual=sheet.getRange(8,1,1,14).getDisplayValues()[0];
 if(actual.some((cell,i)=>cell!==header[i]))
  throw new Error(sheet.getName()+'の8行目の見出しがテンプレートと異なります。');
}
function vasDetailWriteRows_(sheet,rows,columns,formatter){
 const end=Math.max(9,8+rows.length);
 vasEnsureRows_(sheet,end);
 const previous=Math.max(8,sheet.getLastRow());
 if(previous>=9)sheet.getRange(9,1,previous-8,14).clearContent();
 if(!rows.length){
  sheet.getRange('B9').setValue(
   '集計できる求人CSV突合済みの応募がありません。');
  return;
 }
 const perBatch=250;
 for(let i=0;i<rows.length;i+=perBatch) {
  const packet=rows.slice(i,i+perBatch).map(formatter);
  sheet.getRange(9+i,1,packet.length,14).setValues(packet);
 }
 sheet.getRange(9,columns.rate,rows.length,1).setNumberFormat('0.0%');
}
function vasDetailImageRows_(result,imageUrls){
 return result.images.map(row=>[
  '',vasSafeCell_(row.key),row.jobCount,row.total,row.target,
  row.rate,...row.ages
 ]);
}
function vasDetailTagRows_(result){
 return result.tags.map(row=>[
  row.noValue?'':vasSafeCell_(row.key),vasSafeCell_(row.label),
  row.jobCount,row.total,row.target,row.rate,...row.ages
 ]);
}
function vasDetailSetImageFormulas_(sheet,imageRows,imageMap){
 if(!imageRows.length)return {displayed:0,missing:0};
 const formulas=[];
 let displayed=0,missing=0;
 for(const row of imageRows){
  const url=row.noValue?'':imageMap.get(row.key)||'';
  const formula=vasDetailImageFormula_(url);
  if(formula)displayed++;
  else if(!row.noValue)missing++;
  formulas.push([formula]);
 }
 sheet.getRange(9,1,formulas.length,1).setFormulas(formulas);
 return {displayed,missing};
}
function vasDetailsSyncVisibility_(ss){
 const settings=ss.getSheetByName('30_分析設定');
 if(!settings)return;
 for(const [name,a1] of [['43_TOP画像','B33'],['44_Indeedタグ','B34']]){
  const sh=ss.getSheetByName(name);
  if(!sh)continue;
  const visible=settings.getRange(a1).getValue()===true;
  if(visible&&sh.isSheetHidden())sh.showSheet();
  if(!visible&&!sh.isSheetHidden()){
   const visibleCount=ss.getSheets().filter(s=>!s.isSheetHidden()).length;
   if(visibleCount>1)sh.hideSheet();
  }
 }
}
function vasDetailOnEdit_(e){
 if(!e||!e.range)return;
 const r=e.range,tab=r.getSheet().getName();
 const hit=(r1,r2,c1,c2)=>r.getRow()<=r2&&r.getLastRow()>=r1&&
  r.getColumn()<=c2&&r.getLastColumn()>=c1;
 if(tab==='30_分析設定'){
  if(hit(33,34,2,2))vasDetailsSyncVisibility_(
   SpreadsheetApp.getActiveSpreadsheet());
  if(hit(5,14,2,2))vasDetailRefreshStatus_();
 }else if(tab==='31_マスタ編集'&&hit(5,r.getSheet().getLastRow(),9,11)){
  vasDetailRefreshStatus_();
 }
}
function vasDetailRefreshStatus_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const state=vasStateSnapshot_();
 if(vasStr_(state.import_status)!=='READY')return;
 for(const [sheetName,kind] of [
  ['43_TOP画像','images'],['44_Indeedタグ','tags']
 ]){
  const view=ss.getSheetByName(sheetName);
  if(!view)continue;
  let label='専用集計を実行してください';
  if(vasStr_(state.detail_update_status)==='WRITING')
   label='専用集計の更新が中断されました。再集計してください。';
  else if(state.detail_applied_snapshot){
   if(vasStr_(state.detail_generation)!==vasStr_(state.active_generation))
    label='CSV更新後・専用集計未反映';
   else{
    try {
     label=vasDetailSnapshot_(ss)===state.detail_applied_snapshot?
      '専用集計反映済み':'設定変更あり・専用集計未反映';
    }catch(_){label='マスタ設定を確認してください';}
   }
  }
  const previous=vasStr_(view.getRange('B3').getDisplayValue());
  if(previous!==label&&!previous.startsWith(label+'｜'))
   view.getRange('B3').setValue(label);
 }
}
/** One explicit action updates both 14-column detail tabs. */
/** Publish both detail tabs from shared applicant, job and image rows. */
function vasRunDetailAnalysis_(context){
 const ss=context.ss;
  const imageSheet=ss.getSheetByName('43_TOP画像');
  const tagSheet=ss.getSheetByName('44_Indeedタグ');
  vasDetailEnsureHeader_(imageSheet,VAS_IMAGE_HEADERS);
  vasDetailEnsureHeader_(tagSheet,VAS_TAG_HEADERS);
  const {options:opts,tagNames,apps,jobs,imageRows:sources}=context;
  const result=vasDetailCalculate_(apps,jobs,opts,tagNames);
  vasDetailPreflight_(ss,result);
  const urls=vasDetailImageMap_(sources);
  const snapshot=context.detailSnapshot||vasDetailSnapshot_(ss);
  // A write failure cannot leave the old "applied" flag behind.
  vasStateBulkSet_({detail_update_status:'WRITING',detail_applied_snapshot:''});
  imageSheet.getRange('B3').setValue('専用集計を更新中です');
  tagSheet.getRange('B3').setValue('専用集計を更新中です');
  if(result.images.length)imageSheet.getRange(9,2,result.images.length,1).setNumberFormat('@');
  if(result.tags.length)tagSheet.getRange(9,1,result.tags.length,1).setNumberFormat('@');
  vasDetailWriteRows_(imageSheet,result.images,{rate:6},
    row=>vasDetailImageRows_({images:[row]},urls)[0]);
  const rendered=vasDetailSetImageFormulas_(imageSheet,result.images,urls);
  vasDetailWriteRows_(tagSheet,result.tags,{rate:6},
    row=>vasDetailTagRows_({tags:[row]})[0]);
  imageSheet.getRange('H3').setValue(
   'サムネイル表示：'+rendered.displayed+'件／URL未取得：'+
   rendered.missing+'件（画像がなくても集計値は表示）');
  tagSheet.getRange('A5').setValue(
   '1求人に複数タグがある場合、タグ別応募数の合計は全応募数と一致しません。'+
   ' 集計母数：求人CSV突合済み'+result.baseTotal+'件');
  SpreadsheetApp.flush();
  vasStateBulkSet_({
   detail_update_status:'READY',
   detail_generation:vasStateGet_('active_generation'),
   detail_applied_snapshot:snapshot,
   detail_updated_at:new Date()
  });
  imageSheet.getRange('B3').setValue('専用集計反映済み｜'+result.images.length+'画像分類');
  tagSheet.getRange('B3').setValue('専用集計反映済み｜'+result.tags.length+'タグ分類');
  vasDetailsSyncVisibility_(ss);
  SpreadsheetApp.flush();
  return {baseTotal:result.baseTotal,imageCount:result.images.length,
   tagCount:result.tags.length,imagesResolved:rendered.displayed};
}
/** Individually update both detail tabs for maintenance. */
function applyDetailAnalysis(){
 const lock=vasImportLock_();
 try {
  if(vasStatus_()!=='READY')throw new Error('先にCSV全件取込を完了してください。');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const options=vasDetailSettings_(ss);
  const tagNames=vasDetailTagMaster_(vasDetailMasterRows_(ss));
  const apps=vasReadVisibleRange_(ss.getSheetByName('20_突合データ'),VAS_APPLICATION_HEADERS.length);
  const jobs=vasReadVisibleRange_(ss.getSheetByName('93_求人分析マスタ'),VAS_JOB_HEADERS.length);
  const imageRows=vasReadVisibleRange_(ss.getSheetByName('94_画像マスタ'),VAS_IMAGE_MASTER_HEADERS.length);
  const result=vasRunDetailAnalysis_({ss,options,tagNames,apps,jobs,imageRows});
  SpreadsheetApp.getUi().alert('TOP画像・Indeedタグ集計を更新しました。\n'+
   '求人CSV突合済み応募：'+result.baseTotal+'件\n'+
   '画像分類：'+result.imageCount+'種類\nタグ分類：'+
   result.tagCount+'種類。\n画像URL取得は別操作です。');
 }catch(e){
  try{
   if(vasStateGet_('detail_update_status')==='WRITING'){
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    for(const name of ['43_TOP画像','44_Indeedタグ'])
     ss.getSheetByName(name).getRange('B3').setValue('集計途中で失敗しました。再集計が必要です。');
   }
  }catch(_){}
  SpreadsheetApp.getUi().alert('TOP画像・Indeedタグ集計に失敗しました。\n'+
   String(e.message||e));
  throw e;
 }finally{lock.releaseLock();}
}
