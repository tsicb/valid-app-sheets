/**
 * Publish staged canonical datasets while preserving live-tab formatting.
 * Recovery copies are retained until the new generation is READY.
 * This is not a truly atomic transaction: RECOVERY_REQUIRED is explicitly
 * reported if even rollback fails.
 */
function vasCopyBackup_(spec) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const old=ss.getSheetByName(spec.live);
  if(!old)throw new Error('保存先タブが見つかりません：'+spec.live);
  if(ss.getSheetByName(spec.backup))throw new Error('復旧用タブが残っています：'+spec.backup);
  const copy=old.copyTo(ss);
  copy.setName(spec.backup);
  copy.hideSheet();
}
function vasReplaceFromSheet_(destination,source,headers) {
  const width=headers.length;
  const realHeader=destination.getRange(1,1,1,width).getDisplayValues()[0];
  if(realHeader.some((v,i)=>v!==headers[i]))
    throw new Error(destination.getName()+' の列名が変わっています。');
  const last=Math.max(destination.getLastRow(),1);
  if(last>1)destination.getRange(2,1,last-1,width).clearContent();
  const dataCount=Math.max(0,source.getLastRow()-1);
  vasEnsureRows_(destination,dataCount+1);
  const size=500;
  for(let offset=0;offset<dataCount;offset+=size) {
    const n=Math.min(size,dataCount-offset);
    const values=source.getRange(2+offset,1,n,width).getValues()
      .map(row=>row.map(vasSafeCell_));
    destination.getRange(2+offset,1,n,width).setValues(values);
  }
  SpreadsheetApp.flush();
}
function vasRestoreBackups_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  for(const key of Object.keys(VAS_DATASETS_)){
    const spec=VAS_DATASETS_[key];
    const backup=ss.getSheetByName(spec.backup);
    const live=ss.getSheetByName(spec.live);
    if(!backup||!live)throw new Error('復旧データが不足しています：'+spec.live);
    vasReplaceFromSheet_(live,backup,spec.headers);
  }
}
function vasUpdateHomeAfterImport_(summary,generation) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const home=ss.getSheetByName('00_ホーム');
  if(!home)return;
  const total=Number(summary.totalApplications)||0;
  const matches=Number(summary.matchedApplications)||0;
  home.getRange('B4').setValue(total);
  home.getRange('D4').setValue('集計待ち');
  home.getRange('F4').setValue('集計待ち');
  home.getRange('H4').setValue(total?matches/total:0).setNumberFormat('0.0%');
  home.getRange('J4').setValue(Number(summary.embeddedApplications)||0);
  home.getRange('B12').setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
  home.getRange('B14').setValue(generation);
  home.getRange('B15').setValue('CSV取込済み・分析未計算');
  const settings=ss.getSheetByName('30_分析設定');
  if(settings)settings.getRange('B38').setValue('CSV取込後・分析未計算');
}
function finalizeVASImport(sessionId) {
  const lock=vasImportLock_();
  let hasBackups=false;
  try {
    vasImportAssertId_(sessionId);
    if(vasStatus_()!=='STAGING')throw new Error('このセッションは受付中ではありません。');
    const verification=vasImportCheckAll_();
    const sum=JSON.parse(String(vasStateGet_('upload_summary')||'{}'));
    if(verification.applications!==Number(sum.totalApplications)||
       verification.jobs!==Number(sum.jobRecords))
      throw new Error('送信行数とアップロードサマリが一致しません。');

    vasStateSet_('import_status','PREPARED');
    const keys=Object.keys(VAS_DATASETS_);
    for(const kind of keys)vasCopyBackup_(VAS_DATASETS_[kind]);
    hasBackups=true;
    vasStateSet_('import_status','PUBLISHING');

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    for(const kind of keys) {
      const spec=VAS_DATASETS_[kind];
      vasReplaceFromSheet_(
        ss.getSheetByName(spec.live),
        ss.getSheetByName(spec.stage),
        spec.headers
      );
    }
    const generation=String(sessionId);
    vasUpdateHomeAfterImport_(sum,generation);
    vasStateSet_('active_generation',generation);
    vasStateSet_('last_import_at',new Date());
    vasStateSet_('last_analysis_at','');
    vasStateSet_('last_import_error','');
    vasStateSet_('upload_session','');
    vasStateSet_('import_status','READY');
    SpreadsheetApp.flush();

    // Cleanup errors do not turn a successful publish into a false failure.
    try{vasCleanStages_();vasCleanBackups_();}
    catch(cleanupError){
      vasStateSet_('last_cleanup_warning',String(cleanupError.message||cleanupError));
    }
    return {applications:verification.applications,jobs:verification.jobs,generation};
  } catch(e) {
    const state=vasStatus_();
    if(state==='PUBLISHING'||(state==='PREPARED'&&hasBackups)) {
      try {
        vasRestoreBackups_();
        vasStateSet_('import_status',String(vasStateGet_('previous_import_status')||'UNIMPORTED'));
        vasStateSet_('last_import_error','CSV更新失敗・前回データを復旧しました：'+String(e.message||e));
        const home=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('00_ホーム');
        if(home)home.getRange('B15').setValue('更新失敗・前回データを復旧');
        vasStateSet_('upload_session','');
        try{vasCleanStages_();vasCleanBackups_();}catch(_){}
      }catch(recoveryError){
        vasStateSet_('import_status','RECOVERY_REQUIRED');
        vasStateSet_('last_import_error','復旧に失敗：'+String(recoveryError.message||recoveryError));
      }
    } else if(state==='PREPARED') {
      // Live sheets were not modified. Keep the previous generation.
      vasStateSet_('import_status',String(vasStateGet_('previous_import_status')||'UNIMPORTED'));
      vasStateSet_('upload_session','');
      try{vasCleanStages_();}catch(_){}
    }
    throw e;
  } finally {lock.releaseLock();}
}
function cancelVASImport(sessionId) {
  const lock=vasImportLock_();
  try {
    if(!sessionId||String(vasStateGet_('upload_session'))!==String(sessionId))
      return {cancelled:false};
    if(vasStatus_()!=='STAGING')return {cancelled:false};
    vasCleanStages_();
    vasStateSet_('import_status',String(vasStateGet_('previous_import_status')||'UNIMPORTED'));
    vasStateSet_('upload_session','');
    return {cancelled:true};
  } finally {lock.releaseLock();}
}
function abandonVASImport() {
  const ui=SpreadsheetApp.getUi();
  if(vasStatus_()!=='STAGING'){
    ui.alert('中断可能なCSV取込はありません。');
    return;
  }
  if(ui.alert('未完了のCSV取込を破棄',
      '作業中の取込データを削除します。前回の正常な分析データは変更しません。',
      ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  const lock=vasImportLock_();
  try{
    vasCleanStages_();
    vasStateSet_('import_status',String(vasStateGet_('previous_import_status')||'UNIMPORTED'));
    vasStateSet_('upload_session','');
    ui.alert('未完了の取込を破棄しました。CSVをあらためて選択できます。');
  }finally{lock.releaseLock();}
}
function recoverVASImport() {
  const ui=SpreadsheetApp.getUi();
  const choice=ui.alert('CSVデータの復旧',
    '直前の正常なデータへ復旧します。現在の作業中の取込は破棄されます。続けますか？',
    ui.ButtonSet.YES_NO);
  if(choice!==ui.Button.YES)return;
  const lock=vasImportLock_();
  try {
    const state=vasStatus_();
    if(state!=='RECOVERY_REQUIRED'&&state!=='PUBLISHING'&&state!=='PREPARED') {
      ui.alert('復旧が必要な状態ではありません。');
      return;
    }
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const allBackups=Object.keys(VAS_DATASETS_)
      .every(k=>!!ss.getSheetByName(VAS_DATASETS_[k].backup));
    if(!allBackups)
      throw new Error('復旧用タブがそろっていません。データを変更せず停止しました。');
    vasRestoreBackups_();
    vasStateSet_('import_status',String(vasStateGet_('previous_import_status')||'UNIMPORTED'));
    vasStateSet_('upload_session','');
    vasStateSet_('last_import_error','利用者操作で旧データを復旧しました。');
    try{vasCleanStages_();vasCleanBackups_();}catch(_){}
    ss.getSheetByName('00_ホーム').getRange('B15').setValue('前回データを復旧');
    ui.alert('旧データへの復旧が完了しました。');
  } catch(e) {
    vasStateSet_('import_status','RECOVERY_REQUIRED');
    vasStateSet_('last_import_error',String(e.message||e));
    ui.alert('復旧できませんでした。\n'+String(e.message||e));
    throw e;
  } finally {lock.releaseLock();}
}
function checkVASImportStatus() {
  const ui=SpreadsheetApp.getUi();
  const s=vasStatus_();
  const error=String(vasStateGet_('last_import_error')||'');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const counts=Object.keys(VAS_DATASETS_).map(k=>{
    const spec=VAS_DATASETS_[k];
    const sh=ss.getSheetByName(spec.live);
    return spec.live+'：'+(sh?Math.max(0,sh.getLastRow()-1):'?')+' 行';
  }).join('\n');
  ui.alert('CSV取込状態','状態：'+s+'\n'+counts+
    '\n\n最終正常データ世代：'+String(vasStateGet_('active_generation')||'未取込')+
    (error?'\n\n最後のエラー：'+error:''),
    ui.ButtonSet.OK);
}
