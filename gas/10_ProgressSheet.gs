/**
 * Publish monthly progress to the existing 41 and hidden 91 tabs.
 * 41 F28:K59 is a visible native-chart data source, not manually editable.
 * Its formulas change between daily/cumulative WITHOUT GAS, based on B28.
 */
const VAS_PROGRESS_CHART_TITLE_ = '応募進捗｜最新月と過去月';
function vasProgressFormula_(col,row){
  return "IF('91_進捗キャッシュ'!"+col+row+'="","",' +
    "'91_進捗キャッシュ'!"+col+row+')';
}
function vasProgressChartFormulas_(){
  return Array.from({length:31},(_,i)=>{
    const r=i+2;
    const mode=(daily,cumulative)=>
      'IF($B$3="日別",'+vasProgressFormula_(daily,r)+','+
        vasProgressFormula_(cumulative,r)+')';
    return [
      "='91_進捗キャッシュ'!A"+r,
      '='+mode('B','C'),
      '=IF(AND($B$3="累積",\'30_分析設定\'!$B$29),'+
        vasProgressFormula_('D',r)+',"")',
      '=IF(\'30_分析設定\'!$B$30>=1,'+mode('E','F')+',"")',
      '=IF(\'30_分析設定\'!$B$30>=2,'+mode('G','H')+',"")',
      '=IF(\'30_分析設定\'!$B$30>=3,'+mode('I','J')+',"")'
    ];
  });
}
function vasProgressAppliedSettings_(opts){
  return JSON.stringify({
    start:opts.start||'',end:opts.end||'',
    ageMin:opts.ageMin??null,ageMax:opts.ageMax??null,
    targetMin:opts.targetMin??null,targetMax:opts.targetMax??null
  });
}
function vasProgressCheckStatus_(ss){
  const state=vasStateSnapshot_();
  if(String(state.import_status)!=='READY')return;
  const sheet=ss.getSheetByName('41_応募進捗');
  const settings=ss.getSheetByName('30_分析設定');
  if(!sheet||!settings)return;
  let label='';
  if(!state.progress_applied_config)label='応募進捗の再集計が必要';
  else if(String(state.progress_generation)!==String(state.active_generation))
    label='CSV更新後・応募進捗未反映';
  else {
    try {
      const input={};
      const cells=settings.getRange('B5:B14').getValues();
      ['B5','B6','B9','B10','B13','B14'].forEach(a1=>{
        input[a1]=cells[Number(a1.slice(1))-5][0];
      });
      const opts=vasParseSettings_({
        ...input,B17:7,B18:6,B19:50,B20:1000,
        B21:50000,B22:500000,B23:300,B24:1,B25:5
      });
      label=vasProgressAppliedSettings_(opts)!==String(state.progress_applied_config)
        ?'期間・年齢設定変更あり：応募進捗を再集計':'応募進捗反映済み';
    }catch(_){label='応募進捗の設定値を確認してください';}
  }
  const shown=String(sheet.getRange('A6').getDisplayValue());
  if(shown!==label&&!shown.startsWith(label+'｜'))
    sheet.getRange('A6').setValue(label);
}
function vasProgressOnEdit_(e) {
  if(!e||!e.range||e.range.getSheet().getName()!=='30_分析設定')
    return;
  const r=e.range;
  if(r.getColumn()>2||r.getLastColumn()<2)return;
  const watched=[5,6,9,10,13,14,28,29,30];
  if(!watched.some(n=>r.getRow()<=n&&r.getLastRow()>=n))return;
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(r.getRow()<=14){
    vasProgressCheckStatus_(ss);
    return;
  }
  // Progress mode and forecast checkbox are instant formula switches;
  // the only limited input is the number of Web comparison series.
  if(r.getRow()<=30&&r.getLastRow()>=30){
    try{vasProgressSettings_(ss.getSheetByName('30_分析設定'));}
    catch(e){ss.getSheetByName('41_応募進捗').getRange('A6')
      .setValue(String(e.message||e));}
  }
}
function vasProgressEnsureChart_(sheet){
  const charts=sheet.getCharts();
  const existing=charts.find(chart=>{
    try{
      return chart.getOptions().get('title')===VAS_PROGRESS_CHART_TITLE_;
    }catch(_){return false;}
  });
  const builder=existing?existing.modify():sheet.newChart();
  builder.clearRanges()
    .setChartType(Charts.ChartType.COMBO)
    .addRange(sheet.getRange('F28:K59'))
    .setNumHeaders(1)
    .setPosition(7,1,0,0)
    .setOption('title',VAS_PROGRESS_CHART_TITLE_)
    .setOption('height',440)
    .setOption('width',1000)
    .setOption('legend',{position:'bottom'})
    .setOption('hAxis',{title:'月内日'})
    .setOption('vAxis',{title:'応募数',minValue:0})
    .setOption('series',{
      0:{type:'bars'},
      1:{type:'line',lineDashStyle:[6,4],lineWidth:2},
      2:{type:'line',lineWidth:2},
      3:{type:'line',lineWidth:2},
      4:{type:'line',lineWidth:2}
    });
  const chart=builder.build();
  if(existing)sheet.updateChart(chart);
  else sheet.insertChart(chart);
}
/**
 * Explicit operation: analysis source and chart source are fully recomputed.
 * B28/B29/B30 are worksheet-driven, so toggling them never executes GAS.
 */
function applyProgressAnalysis(){
  const lock=vasImportLock_();
  try {
    if(vasStatus_()!=='READY')
      throw new Error('CSV全件取込が正常完了してから実行してください。');
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const settings=ss.getSheetByName('30_分析設定');
    vasProgressSettings_(settings); // fail on unsupported comparison counts
    const snapshot=vasBasicSnapshotFromSheet_(settings,
      ss.getSheetByName('31_マスタ編集'));
    const apps=vasReadVisibleRange_(
      ss.getSheetByName('20_突合データ'),VAS_APPLICATION_HEADERS.length
    );
    const result=vasProgressCalculate_(apps,snapshot.options);
    const cache=ss.getSheetByName('91_進捗キャッシュ');
    const view=ss.getSheetByName('41_応募進捗');
    if(!cache||!view)throw new Error('応募進捗の表示またはキャッシュタブがありません。');
    if(view.getRange('A28:D28').getDisplayValues()[0]
      .some((v,i)=>v!==VAS_PROGRESS_MONTH_HEADERS_[i]))
      throw new Error('応募進捗の月別集計見出しが変わっています。');
    // The existing empty-template cache had an older four-column header.
    // This area is internal and not user-edited; migrate it in place.
    if(cache.getMaxColumns()<VAS_PROGRESS_CACHE_HEADERS_.length)
      cache.insertColumnsAfter(cache.getMaxColumns(),
        VAS_PROGRESS_CACHE_HEADERS_.length-cache.getMaxColumns());
    vasEnsureRows_(cache,32);
    const last=Math.max(32,cache.getLastRow());
    if(last>1)cache.getRange(2,1,last-1,10).clearContent();
    cache.getRange(1,1,1,10).setValues([VAS_PROGRESS_CACHE_HEADERS_]);
    const blankRows=Array.from({length:31},(_,i)=>[
      i+1,null,null,null,null,null,null,null,null,null
    ]);
    cache.getRange(2,1,31,10).setValues(
      result.visible?result.cacheRows:blankRows
    );
    // Retain the original output table and the user-facing formatting.
    const outputLast=Math.max(view.getMaxRows(),59);
    vasEnsureRows_(view,Math.max(outputLast,result.monthlyRows.length+29));
    view.getRange(29,1,view.getMaxRows()-28,4).clearContent();
    if(result.monthlyRows.length){
      const width=250;
      for(let pos=0;pos<result.monthlyRows.length;pos+=width){
        const subset=result.monthlyRows.slice(pos,pos+width);
        view.getRange(29+pos,1,subset.length,4).setValues(subset);
      }
    }
    view.getRange('D29:D'+Math.max(59,view.getMaxRows()))
      .setNumberFormat('0.0%');
    view.getRange('F28:K28').setValues([[
      '月内日',result.visible?result.latestMonthLabel+' 実績':'最新月・実績',
      '着地予測',
      result.comparisons[0]?.enabled?result.comparisons[0].label:'前月',
      result.comparisons[1]?.enabled?result.comparisons[1].label:'前々月',
      result.comparisons[2]?.enabled?result.comparisons[2].label:'前年同月'
    ]]);
    view.getRange('F29:K59').setFormulas(vasProgressChartFormulas_());
    // Preserve the formula from the originally created template.
    if(view.getRange('B3').getFormula()!=="='30_分析設定'!B28")
      view.getRange('B3').setFormula("='30_分析設定'!B28");
    view.getRange('D3').setValue(
      result.visible?result.latestMonthLabel+' 実績：'+result.actual+'件':
        '対象期間に応募データがありません'
    );
    view.getRange('F3').setFormula(
      '=IF(\'30_分析設定\'!B29,'+
      (result.projected===null?'"着地予測なし"':'"着地予測：'+result.projected+'件"')+
      ',"着地予測OFF")'
    );
    view.getRange('H3').setValue('比較：前月・前々月・前年同月（最大3系列）');
    if(result.visible)vasProgressEnsureChart_(view);
    SpreadsheetApp.flush();
    vasStateBulkSet_({
      progress_generation:vasStateGet_('active_generation'),
      progress_applied_config:vasProgressAppliedSettings_(snapshot.options),
      progress_last_calculated_at:new Date()
    });
    view.getRange('A6').setValue(result.visible?
      '応募進捗反映済み｜最新データ：'+result.latestDate+
      '｜予測は選択期間内の応募ペースによる単純換算':
      '対象期間に応募データがありません');
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert(
      result.visible?'応募進捗を更新しました。\n最新月：'+
        result.latestMonthLabel+'\n観測日：'+result.latestDate+
        '\n実績：'+result.actual+'件\n月別一覧：'+
        result.monthlyRows.length+'か月分':
        '集計対象となる応募日付がありません。応募進捗は空表示にしました。'
    );
  }catch(e){
    SpreadsheetApp.getUi().alert('応募進捗の更新に失敗しました。\n'+
      String(e.message||e));
    throw e;
  }finally{lock.releaseLock();}
}
