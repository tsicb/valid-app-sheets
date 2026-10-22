'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=[
 'gas/01_EntryPoint.gs','gas/16_UnifiedUpdate.gs'
].map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
const alerts=[],menus=[];
const ui={
 ButtonSet:{OK:'OK'},
 createMenu:name=>{
  const menu={name,items:[],addItem(label,fn){this.items.push({label,fn});return this;},
   addSubMenu(sub){this.items.push({submenu:sub});return this;},
   addSeparator(){this.items.push({separator:true});return this;},
   addToUi(){menus.push(this);return this;}};
  return menu;
 },
 alert:(...args)=>{alerts.push(args);}
};
const sheetNames=['30_分析設定','31_マスタ編集',
 '20_突合データ','93_求人分析マスタ','94_画像マスタ',
 '00_ホーム','41_応募進捗','43_TOP画像','44_Indeedタグ'];
const sheets=Object.fromEntries(sheetNames.map(name=>[
 name,{name,cells:{},getRange(cell){return {
  getValue:()=>name==='30_分析設定'&&cell==='I5'?true:'',
  setValue:v=>{this.cells[cell]=v;}
 }}}
]));
const ss={getSheetByName:name=>sheets[name]};
let lockCount=0,releases=0,snapshotReads=0;
const readCount={'20_突合データ':0,'93_求人分析マスタ':0,'94_画像マスタ':0};
const applicants=[[1]],jobs=[[2]],images=[[3]];
const config={options:{start:'',end:''},
 enabled:[['media',true]],masters:{keywords:[],enterprises:[]}};
const use=[],invalidated=[];
const state={import_status:'READY',active_generation:'G1'};
let failProgress=false,failTag=false;
const api={
 SpreadsheetApp:{getUi:()=>ui,getActiveSpreadsheet:()=>ss},
 vasRefreshBasicStatus_:()=>{},vasProgressCheckStatus_:()=>{},
 vasCustomRefreshStatus_:()=>{use.push('custom-status');},
 vasDetailRefreshStatus_:()=>{},vasOnEditBasicStatus_:()=>{},
 vasProgressOnEdit_:()=>{},vasCustomOnEdit_:()=>{},vasDetailOnEdit_:()=>{},
 vasStatus_:()=>state.import_status,
 vasImportLock_:()=>{lockCount++;return {releaseLock(){releases++;}};},
 vasBasicSnapshotFromSheet_:()=>{snapshotReads++;return config;},
 vasReadVisibleRange_:sh=>{
  readCount[sh.name]++;
  return sh.name==='20_突合データ'?applicants:
   sh.name==='93_求人分析マスタ'?jobs:images;
 },
 VAS_APPLICATION_HEADERS:Array(23),VAS_JOB_HEADERS:Array(20),
 VAS_IMAGE_MASTER_HEADERS:Array(5),
 VAS_DISPLAY_ITEMS:[['top-image-detail','TOP画像ファイル名',true]],
 vasRunBasicAnalysis_:ctx=>{
  assert.strictEqual(ctx.app,applicants);
  assert.strictEqual(ctx.jobs,jobs);
  use.push('basic');return {total:1,enabledAxes:29};
 },
 vasRunProgressAnalysis_:ctx=>{
  assert.strictEqual(ctx.apps,applicants);
  use.push('progress');
  if(failProgress)throw new Error('進捗の模擬エラー');
  return {months:2};
 },
 vasDetailTagMaster_:()=>{
  if(failTag)throw Error('タグマスタに重複');
  return new Map([['A','テスト']]);
 },
 vasDetailMasterRows_:()=>[ ['A','テスト',true] ],
 vasRunDetailAnalysis_:ctx=>{
  assert.strictEqual(ctx.apps,applicants);
  assert.strictEqual(ctx.jobs,jobs);
  assert.strictEqual(ctx.imageRows,images);
  use.push('detail');
  return {baseTotal:1,imageCount:1,tagCount:1};
 },
 vasCustomAxisChoices_:(apps,jobs)=>{
  assert.strictEqual(apps,applicants);
  assert.strictEqual(jobs,api.test.jobs);
  return ['応募媒体','応募年月'];
 },
 vasCustomInstallChoices_:(theSs,choices,withDefaults)=>{
  assert.strictEqual(theSs,ss);assert.equal(withDefaults,false);
  assert.deepEqual(choices,['応募媒体','応募年月']);
  use.push('choices');
 },
 vasStateBulkSet_:changes=>{
  Object.assign(state,changes);
  invalidated.push(changes);
 },
 VAS_CUSTOM_AXES_:[],vasStateGet_:key=>state[key],
 VAS_TEMPLATE_VERSION:'0.1',
 test:{jobs}
};
api.vasCustomAxisChoices_=(appRows,jobRows,masters,enabled)=>{
 assert.strictEqual(appRows,applicants);
 assert.strictEqual(jobRows,jobs);
 assert.equal(enabled.get('top-image-detail'),true);
 return ['応募媒体','応募年月'];
};
const entry=new Function(...Object.keys(api),source+
 '\nreturn {onOpen,updateAllAnalysis,vasUnifiedExecute_,vasUnifiedResultText_};'
)(...Object.values(api));
entry.onOpen();
assert.equal(menus.length,1);
const root=menus[0];
assert.equal(root.name,'有効応募分析');
assert.equal(root.items.length,4);
assert.deepEqual(root.items.slice(0,3).map(x=>x.label),[
 'CSVを取り込む・更新','分析結果を更新','カスタム分析を実行'
]);
assert.equal(root.items[3].submenu.name,'その他・管理');
assert.equal(root.items[3].submenu.items.filter(x=>x.submenu).length,4);
const grouped=root.items[3].submenu.items.filter(x=>x.submenu);
assert.deepEqual(grouped.map(x=>x.submenu.name),[
 '画像関連','個別に再集計','CSV取込の管理','保守・復旧'
]);
assert.ok(grouped.find(x=>x.submenu.name==='保守・復旧').submenu.items
 .some(x=>x.fn==='recoverVASImport'));
const outcome=entry.updateAllAnalysis();
assert.equal(alerts.length,1,'unified action must show one dialog only');
assert.equal(outcome.length,4);
assert.equal(outcome.every(x=>x.ok),true);
assert.deepEqual(use.filter(x=>['basic','progress','detail','choices'].includes(x)),[
 'basic','progress','detail','choices'
]);
assert.equal(snapshotReads,1);
assert.deepEqual(Object.values(readCount),[1,1,1]);
assert.equal(lockCount,1);
assert.equal(releases,1);
assert.equal(alerts[0][0],'分析結果の更新完了');
assert.ok(alerts[0][1].includes('正常更新：4項目／要確認：0項目'));
assert.ok(alerts[0][1].includes('候補2軸'));
assert.ok(!use.includes('applyCustomAnalysis'),'custom matrix must stay untouched');
// Deliberately fail only progress. Other reports should still complete.
failProgress=true;
const partial=entry.updateAllAnalysis();
assert.equal(alerts.length,2);
assert.equal(alerts[1][0],'分析結果の更新（一部要確認）');
assert.deepEqual(partial.map(x=>x.ok),[true,false,true,true]);
assert.equal(state.progress_applied_config,'');
assert.equal(sheets['41_応募進捗'].cells.A6,'応募進捗の更新に失敗・再集計が必要');
assert.deepEqual(Object.values(readCount),[2,2,2]);
assert.equal(lockCount,2);assert.equal(releases,2);
// Detail-only master validation failure may not stop basic and progress.
failProgress=false;failTag=true;
const badTags=entry.updateAllAnalysis();
assert.deepEqual(badTags.map(x=>x.ok),[true,true,false,true]);
assert.equal(state.detail_applied_snapshot,'');
assert.equal(state.detail_update_status,'ERROR');
assert.equal(sheets['43_TOP画像'].cells.B3,'専用集計の更新に失敗・再集計が必要');
assert.equal(alerts.length,3);
console.log('Four root menu entries, one shared data read, isolated failures, one outcome alert and unchanged custom matrix passed.');
