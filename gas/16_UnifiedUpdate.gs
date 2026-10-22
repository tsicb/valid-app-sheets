/**
 * Unified analysis refresh for everyday users.
 * Read the applicant/job files ONCE, publish independent views one at a
 * time, and show a SINGLE outcome dialog. Never fetch external image URLs.
 * Custom matrix selections/results stay untouched; only choices refresh.
 */
const VAS_UNIFIED_STEPS_=Object.freeze([
  ['basic','基本分析'],
  ['progress','応募進捗'],
  ['detail','TOP画像・Indeedタグ'],
  ['axes','カスタム分析の候補']
]);
function vasUnifiedSources_(ss) {
  const settings=ss.getSheetByName('30_分析設定');
  const master=ss.getSheetByName('31_マスタ編集');
  const snapshot=vasBasicSnapshotFromSheet_(settings,master);
  // These three read operations are shared by every participating view.
  const apps=vasReadVisibleRange_(
    ss.getSheetByName('20_突合データ'),VAS_APPLICATION_HEADERS.length);
  const jobs=vasReadVisibleRange_(
    ss.getSheetByName('93_求人分析マスタ'),VAS_JOB_HEADERS.length);
  const imageRows=vasReadVisibleRange_(
    ss.getSheetByName('94_画像マスタ'),VAS_IMAGE_MASTER_HEADERS.length);
  return {ss,settings,snapshot,apps,jobs,imageRows};
}
function vasUnifiedRefreshAxes_(context) {
  const {ss,settings,snapshot,apps,jobs}=context;
  // TOP file name is custom-only; preserve its independent visibility flag.
  const topIndex=VAS_DISPLAY_ITEMS.findIndex(r=>r[0]==='top-image-detail');
  const enabled=new Map(snapshot.enabled);
  enabled.set('top-image-detail',topIndex>=0&&
    settings.getRange(topIndex+5,9).getValue()===true);
  const choices=vasCustomAxisChoices_(apps,jobs,snapshot.masters,enabled);
  // Do not change the user's selected axes or overwrite custom results.
  vasCustomInstallChoices_(ss,choices,false);
  vasCustomRefreshStatus_();
  return {axes:choices.length};
}
/** Return a structured result so the UI and tests can inspect partial failure. */
function vasUnifiedExecute_(context,runners) {
  const out=[];
  for(const [key,label] of VAS_UNIFIED_STEPS_){
    try {
      const detail=runners[key](context);
      out.push({key,label,ok:true,detail:detail||{}});
    }catch(e) {
      out.push({key,label,ok:false,message:String(e.message||e)});
      // A failed publisher may have left partial cells. Invalidate only
      // that section; already-successful views are not rolled back.
      try {
        if(key==='basic'){
          vasStateBulkSet_({basic_applied_config:''});
          context.ss.getSheetByName('00_ホーム').getRange('B15')
            .setValue('基本分析の更新に失敗・再集計が必要');
        }else if(key==='progress'){
          vasStateBulkSet_({progress_applied_config:''});
          context.ss.getSheetByName('41_応募進捗').getRange('A6')
            .setValue('応募進捗の更新に失敗・再集計が必要');
        }else if(key==='detail'){
          vasStateBulkSet_({
            detail_applied_snapshot:'',detail_update_status:'ERROR'
          });
          for(const name of ['43_TOP画像','44_Indeedタグ'])
            context.ss.getSheetByName(name).getRange('B3')
              .setValue('専用集計の更新に失敗・再集計が必要');
        }
      }catch(_){}
    }
  }
  return out;
}
function vasUnifiedResultText_(results,seconds){
 const succeeded=results.filter(x=>x.ok);
 const failed=results.filter(x=>!x.ok);
 const lines=[
   '正常更新：'+succeeded.length+'項目／要確認：'+failed.length+'項目',
   '処理時間：約'+seconds.toFixed(1)+'秒',''
 ];
 for(const item of results){
  if(!item.ok){
   // Error includes only a bounded developer-controlled message, not CSV
   // source contents or applicant data.
   lines.push('要確認 '+item.label+'：'+item.message.slice(0,260));
   continue;
  }
  let suffix='';
  if(item.key==='basic')
    suffix='（'+item.detail.total+'応募／'+item.detail.enabledAxes+'軸）';
  if(item.key==='progress')
    suffix='（'+item.detail.months+'か月）';
  if(item.key==='detail')
    suffix='（画像'+item.detail.imageCount+'分類／タグ'+item.detail.tagCount+'分類）';
  if(item.key==='axes')suffix='（候補'+item.detail.axes+'軸）';
  lines.push('完了 '+item.label+suffix);
 }
 lines.push('',failed.length?
  '失敗した分析は「その他・管理」から個別に再実行できます。':
  '分析結果を更新しました。画像URLの追加取得は別操作です。');
 return lines.join('\n');
}
/** New single top-level user action. */
function updateAllAnalysis(){
 const lock=vasImportLock_();
 const begun=Date.now();
 try{
  if(vasStatus_()!=='READY')
    throw new Error('CSV取込が完了していません。「CSVを取り込む・更新」から開始してください。');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const context=vasUnifiedSources_(ss);
  const runners={
    basic:ctx=>vasRunBasicAnalysis_(ctx),
    progress:ctx=>vasRunProgressAnalysis_(ctx),
    detail:ctx=>{
      // Tag-master errors affect only the detail reports, not other views.
      const tagNames=vasDetailTagMaster_(vasDetailMasterRows_(ctx.ss));
      const options={
        start:ctx.snapshot.options.start,
        end:ctx.snapshot.options.end,
        ageMin:ctx.snapshot.options.ageMin,
        ageMax:ctx.snapshot.options.ageMax,
        targetMin:ctx.snapshot.options.targetMin,
        targetMax:ctx.snapshot.options.targetMax
      };
      const detailSnapshot=JSON.stringify({
        options,tagNames:[...tagNames].sort((a,b)=>a[0].localeCompare(b[0]))
      });
      return vasRunDetailAnalysis_({...ctx,options,tagNames,detailSnapshot});
    },
    axes:vasUnifiedRefreshAxes_
  };
  const results=vasUnifiedExecute_(context,runners);
  const elapsed=(Date.now()-begun)/1000;
  const failed=results.some(x=>!x.ok);
  SpreadsheetApp.getUi().alert(failed?
    '分析結果の更新（一部要確認）':'分析結果の更新完了',
    vasUnifiedResultText_(results,elapsed),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return results;
 }catch(e){
  SpreadsheetApp.getUi().alert('分析結果を更新できませんでした。\n'+
    String(e.message||e));
  throw e;
 }finally{lock.releaseLock();}
}
