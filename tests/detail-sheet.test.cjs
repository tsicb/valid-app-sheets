'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=['gas/00_Config.gs','gas/06_BasicCore.gs',
 'gas/13_DetailCore.gs','gas/14_DetailSheet.gs','gas/15_ImageWorker.gs']
 .map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('\n');
const codeCol=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
function parseA1(x){
 const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(x);
 if(!m)throw Error('Unexpected address '+x);
 return [Number(m[2]),codeCol(m[1]),Number(m[4]||m[2]),codeCol(m[3]||m[1])];
}
class Range {
 constructor(sh,r,c,end,ec){Object.assign(this,{sh,r,c,end,ec});}
 getValues(){return Array.from({length:this.end-this.r+1},(_,i)=>
  Array.from({length:this.ec-this.c+1},(_,j)=>
   this.sh.cells.get((this.r+i)+':'+(this.c+j))||''));}
 getDisplayValues(){return this.getValues().map(row=>row.map(x=>String(x)));}
 getValue(){return this.getValues()[0][0];}
 getDisplayValue(){return String(this.getValue());}
 setValues(values){
  assert.equal(values.length,this.end-this.r+1);
  values.forEach((row,i)=>{
   assert.equal(row.length,this.ec-this.c+1);
   row.forEach((value,j)=>this.sh.cells.set((this.r+i)+':'+(this.c+j),value));
  });return this;
 }
 setValue(value){return this.setValues([[value]]);}
 setFormulas(values){return this.setValues(values);}
 clearContent(){
  for(let r=this.r;r<=this.end;r++)
   for(let c=this.c;c<=this.ec;c++)this.sh.cells.delete(r+':'+c);
  return this;
 }
 setNumberFormat(){return this;}
}
class Sheet{
 constructor(name){this.name=name;this.maxRows=1000;this.maxCols=26;
  this.cells=new Map();this.hidden=false;}
 getName(){return this.name;}
 getRange(a,b,n,m){
  return typeof a==='number'?new Range(this,a,b,a+(n||1)-1,b+(m||1)-1):
   new Range(this,...parseA1(a));
 }
 getLastRow(){
  let max=0;for(const k of this.cells.keys())max=Math.max(max,Number(k.split(':')[0]));
  return max;
 }
 getMaxRows(){return this.maxRows;}
 getMaxColumns(){return this.maxCols;}
 insertRowsAfter(_,n){this.maxRows+=n;}
 isSheetHidden(){return this.hidden;}
 hideSheet(){this.hidden=true;}
 showSheet(){this.hidden=false;}
}
const names=['20_突合データ','93_求人分析マスタ','94_画像マスタ',
 '30_分析設定','31_マスタ編集','43_TOP画像','44_Indeedタグ'];
const sheets=Object.fromEntries(names.map(n=>[n,new Sheet(n)]));
const ss={getSheetByName:name=>sheets[name],
 getSheets:()=>Object.values(sheets)};
function app(id,ref,age,flag=1,count=1){
 const r=Array(23).fill('');
 r[0]=id;r[3]=ref;r[4]=flag;r[5]='2026-10-16';r[10]=count;r[13]=age;
 return r;
}
function job(id,file,tags){
 const r=Array(20).fill('');
 r[0]=id;r[1]='JOB_CSV';r[14]=file;r[17]=tags;
 return r;
}
const jobs=[job('J1','one.jpg','A::B'),job('J2','','')];
const apps=[app('1','J1',25),app('2','J1',45),
 app('3','J2',35),app('4','',20,0)];
const imageMaster=[['one.jpg','1234','https://ten.1049.cc/a.jpg','自動取得','']];
const view=sheets['43_TOP画像'],tags=sheets['44_Indeedタグ'];
const headersImage=['画像','画像ファイル名','対象求人数','総応募数',
 'ターゲット応募数','ターゲット率','10代','20代','30代','40代','50代','60代','70代','その他'];
const headersTag=['タグコード','タグ名称','対象求人数','総応募数',
 'ターゲット応募数','ターゲット率','10代','20代','30代','40代','50代','60代','70代','その他'];
view.getRange(8,1,1,14).setValues([headersImage]);
tags.getRange(8,1,1,14).setValues([headersTag]);
sheets['31_マスタ編集'].getRange(5,9,2,3)
 .setValues([['A','第一タグ',true],['B','第二タグ',true]]);
sheets['30_分析設定'].getRange('B13:B14').setValues([[20],[39]]);
sheets['30_分析設定'].getRange('B33:B34').setValues([[true],[true]]);
let state={import_status:'READY',active_generation:'G1'},alerts=[];
const deps={
 SpreadsheetApp:{
  getActiveSpreadsheet:()=>ss,flush(){},
  getUi:()=>({alert:s=>alerts.push(s)})
 },
 Utilities:{formatDate:()=>''},
 vasImportLock_:()=>({releaseLock(){}}),
 vasStatus_:()=>state.import_status,
 vasReadVisibleRange_:sh=>
  sh.name==='20_突合データ'?apps:
  sh.name==='93_求人分析マスタ'?jobs:imageMaster,
 vasStateBulkSet_:x=>Object.assign(state,x),
 vasStateGet_:key=>state[key]||'',
 vasStateSnapshot_:()=>state,
 vasEnsureRows_:(sh,n)=>{if(sh.maxRows<n)sh.maxRows=n;},
 vasSafeCell_:v=>typeof v==='string'&&/^[=+@]/.test(v)?"'"+v:v
};
const core=new Function(...Object.keys(deps),source+
 '\nreturn {applyDetailAnalysis,vasDetailRefreshStatus_,vasDetailOnEdit_,vasDetailImageFormula_,vasDetailImageMap_,vasDetailUpdateImageFormulas_,vasDetailPendingImages_,vasDetailResolveImageBatch_,vasDetailFetchImageResponse_,vasDetailImageUrl_};'
)(...Object.values(deps));
core.applyDetailAnalysis();
assert.equal(alerts.length,1);
assert.equal(view.getRange('B9').getValue(),'one.jpg');
assert.equal(view.getRange('D9').getValue(),2);
assert.equal(view.getRange('E9').getValue(),1);
assert.equal(view.getRange('F9').getValue(),0.5);
assert.equal(view.getRange('C9').getValue(),1);
assert.equal(view.getRange('B10').getValue(),'（TOP画像なし）');
assert.equal(view.getRange('D10').getValue(),1);
assert.equal(view.getRange('A9').getValue(),
 '=IFERROR(IMAGE("https://ten.1049.cc/a.jpg",4,80,120),"")');
assert.equal(view.getRange('A10').getValue(),'');
assert.equal(tags.getRange('A9').getValue(),'B');
assert.equal(tags.getRange('D9').getValue(),2);
assert.equal(tags.getRange('A10').getValue(),'A');
assert.equal(tags.getRange('A11').getValue(),'');
assert.equal(tags.getRange('B11').getValue(),'（タグなし）');
assert.equal(state.detail_generation,'G1');
assert.equal(state.detail_update_status,'READY');
assert.equal(view.getRange('B3').getValue().startsWith('専用集計反映済み'),true);
// Re-run with fewer tag categories, old values must be cleared.
jobs[0][17]='A';
core.applyDetailAnalysis();
assert.equal(tags.getRange('A9').getValue(),'A');
assert.equal(tags.getRange('A10').getValue(),'');
assert.equal(tags.getRange('B10').getValue(),'（タグなし）');
assert.equal(tags.getRange('A11').getValue(),'');
// Settings changes mark the output stale without deleting it.
sheets['30_分析設定'].getRange('B13').setValue(30);
core.vasDetailOnEdit_({range:{
 getSheet:()=>sheets['30_分析設定'],
 getRow:()=>13,getLastRow:()=>13,
 getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(view.getRange('B3').getValue(),'設定変更あり・専用集計未反映');
assert.equal(tags.getRange('B3').getValue(),'設定変更あり・専用集計未反映');
sheets['30_分析設定'].getRange('B13').setValue(20);
core.vasDetailRefreshStatus_();
assert.equal(view.getRange('B3').getValue(),'専用集計反映済み');
// Visibility toggle is independent of counts.
sheets['30_分析設定'].getRange('B33').setValue(false);
core.vasDetailOnEdit_({range:{
 getSheet:()=>sheets['30_分析設定'],
 getRow:()=>33,getLastRow:()=>33,
 getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(view.isSheetHidden(),true);
assert.equal(tags.isSheetHidden(),false);
sheets['30_分析設定'].getRange('B33').setValue(true);
core.vasDetailOnEdit_({range:{
 getSheet:()=>sheets['30_分析設定'],
 getRow:()=>33,getLastRow:()=>33,
 getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(view.isSheetHidden(),false);
// Unsafe URLs must never be emitted into IMAGE formula.
for(const x of ['http://ten.1049.cc/x.jpg','https://localhost/a',
 'https://127.0.0.1/a','https://example.com/a"b','javascript:alert(1)'])
 assert.equal(core.vasDetailImageFormula_(x),'');
assert.equal(core.vasDetailImageUrl_('https://ten.1049.cc/photo.jpg'),
 'https://ten.1049.cc/photo.jpg');
const batch=core.vasDetailPendingImages_([
 ['a.jpg','123::123::bad','','未取得',''],
 ['b.jpg','999','https://ten.1049.cc/ok','自動取得',''],
 ['c.jpg','900::901','','未取得',''],
 ['d.jpg','','','候補なし','']
],1);
assert.equal(batch.pending.length,1);
assert.equal(batch.remaining,1);
const fetched=core.vasDetailResolveImageBatch_([
 {name:'a',ids:['123','456']},{name:'b',ids:['900']}
],requests=>requests.map(r=>({
 getResponseCode:()=>200,
 getContentText:()=>JSON.stringify(
  r.url.includes('456')?{ok:true,imageUrl:'https://ten.1049.cc/s.jpg'}:
  {ok:false,code:'IMAGE_NOT_FOUND'})
})));
assert.equal(fetched[0].url,'https://ten.1049.cc/s.jpg');
assert.equal(fetched[0].status,'自動取得');
assert.equal(fetched[1].status,'画像なし');
console.log('Detail tab rendering, sorting, clearing, percentages, visibility, formula safety, and Worker retry passed.');
