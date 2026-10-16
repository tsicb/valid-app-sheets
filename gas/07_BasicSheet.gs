/** Build cached basic tables without re-importing CSV data. */
function applyBasicAnalysis(){
  const lock=vasImportLock_();
  try{
    if(vasStatus_()!=='READY')throw new Error('CSV全件取込が正常完了してから実行してください。');
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const settings=ss.getSheetByName('30_分析設定');
    const snapshot=vasBasicSnapshotFromSheet_(
      settings,ss.getSheetByName('31_マスタ編集')
    );
    const options={...snapshot.options,masters:snapshot.masters};
    const app=vasReadVisibleRange_(ss.getSheetByName('20_突合データ'),VAS_APPLICATION_HEADERS.length);
    const jobs=vasReadVisibleRange_(ss.getSheetByName('93_求人分析マスタ'),VAS_JOB_HEADERS.length);
    const result=vasCalculateBasic_(app,jobs,options);
    const cache=ss.getSheetByName('90_基本集計キャッシュ');
    const basic=ss.getSheetByName('40_基本分析');
    const state=ss.getSheetByName('92_運用管理');
    const enabled=new Map(snapshot.enabled);
    const labels=VAS_BASIC_AXES_.filter(([id])=>result.available.includes(id)&&enabled.get(id));
    // Preflight before touching output: spill height and every old header.
    const actual=cache.getRange(1,1,1,13).getDisplayValues()[0];
    if(actual.some((v,i)=>v!==VAS_BASIC_CACHE_HEADERS[i]))
      throw new Error('基本分析キャッシュの列名が異なります。');
    const baseHeader=basic.getRange(8,1,1,12).getDisplayValues()[0];
    if(baseHeader.some((v,i)=>v!==VAS_BASIC_HEADERS[i]))
      throw new Error('基本分析表の見出しが異なります。');
    const required=Math.max(1000,result.rows.length+1);
    vasEnsureRows_(cache,required);
    const displayRows=Math.max(1000,1+Math.max(...VAS_BASIC_AXES_.map(([id])=>
      result.rows.filter(r=>r[0]===id).length),0)+8);
    vasEnsureRows_(basic,displayRows);
    const prevRows=Math.max(0,cache.getLastRow()-1);
    if(prevRows)cache.getRange(2,1,prevRows,13).clearContent();
    if(result.rows.length){
      const n=1000;
      for(let offset=0;offset<result.rows.length;offset+=n)
        cache.getRange(2+offset,1,Math.min(n,result.rows.length-offset),13)
          .setValues(result.rows.slice(offset,offset+n).map(r=>[
            r[0],vasSafeCell_(r[1]),...r.slice(2)
          ]));
    }
    // Keep selection labels separate from cache rows and away from state A:B.
    state.getRange('G2:H1000').clearContent();
    if(labels.length)state.getRange(2,7,labels.length,2).setValues(labels);
    const selected=String(basic.getRange('B3').getValue()||'');
    if(!labels.some(x=>x[1]===selected))
      basic.getRange('B3').setValue(labels.length?labels[0][1]:'');
    basic.getRange('B3').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(state.getRange('H2:H1000'),true)
        .setAllowInvalid(false).build()
    );
    basic.getRange('A9:L'+basic.getMaxRows()).clearContent();
    if(labels.length){
      basic.getRange('A9').setFormula(
        '=IFNA(FILTER(\'90_基本集計キャッシュ\'!B2:M,'+
        '\'90_基本集計キャッシュ\'!A2:A=INDEX(\'92_運用管理\'!G2:G,'+
        'MATCH($B$3,\'92_運用管理\'!H2:H,0))),"該当するデータはありません")'
      );
    }else basic.getRange('A9').setValue('現在利用できる基本分析項目はありません。');
    const supported=new Set(VAS_BASIC_AXES_.map(r=>r[0]));
    const status=VAS_DISPLAY_ITEMS.map(([id])=>[
      !supported.has(id)?'別機能':
        result.available.includes(id)?'利用可能':'未取得'
    ]);
    settings.getRange(5,10,status.length,1).setValues(status);
    const home=ss.getSheetByName('00_ホーム');
    const ratio=result.total?result.targetTotal/result.total:0;
    home.getRange('B4').setValue(result.total);
    home.getRange('D4').setValue(result.targetTotal);
    home.getRange('F4').setValue(ratio).setNumberFormat('0.0%');
    basic.getRange('B5').setValue(result.total);
    basic.getRange('D5').setValue(result.targetTotal);
    basic.getRange('F5').setValue(ratio).setNumberFormat('0.0%');
    basic.getRange('H5').setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
    basic.getRange('D3').setValue('分析済み');
    home.getRange('B13').setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
    // Persist "applied" settings only after the cache and KPIs have been
    // written. Live settings are not used directly for the home display.
    SpreadsheetApp.flush();
    vasStateBulkSet_({
      last_analysis_at:new Date(),
      basic_analysis_generation:vasStateGet_('active_generation'),
      basic_applied_config:JSON.stringify(snapshot)
    });
    vasWriteAppliedBasicConditions_(ss,snapshot);
    settings.getRange('C3').setValue('設定変更後は「基本分析を再集計」を実行してください。');
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert('基本分析を更新しました。\n対象応募：'+result.total+
      ' 件\n利用可能な基本分析：'+labels.length+'項目。\n40_基本分析のB3で切替できます。');
  }catch(e){
    SpreadsheetApp.getUi().alert('基本分析の更新に失敗しました。\n'+String(e.message||e));
    throw e;
  }finally{lock.releaseLock();}
}
