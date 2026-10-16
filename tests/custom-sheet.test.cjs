'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=['gas/00_Config.gs','gas/06_BasicCore.gs',
 'gas/11_CustomCore.gs','gas/12_CustomSheet.gs']
 .map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
function fromA1(a1){
 const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
 assert.ok(m,'unexpected range '+a1);
 const n=str=>str.split('').reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);
 return [Number(m[2]),n(m[1]),m[4]?Number(m[4]):Number(m[2]),
  m[3]?n(m[3]):n(m[1])];
}
class Range {
 constructor(sheet,r,c,rEnd,cEnd){Object.assign(this,{sheet,r,c,rEnd,cEnd});}
 getValues(){return Array.from({length:this.rEnd-this.r+1},(_,i)=>
  Array.from({length:this.cEnd-this.c+1},(_,j)=>
   this.sheet.cells.get((this.r+i)+':'+(this.c+j))??''));}
 getDisplayValues(){return this.getValues().map(row=>row.map(String));}
 getValue(){return this.getValues()[0][0];}
 getDisplayValue(){return String(this.getValue());}
 setValues(rows){
  assert.equal(rows.length,this.rEnd-this.r+1);
  rows.forEach((row,i)=>{
   assert.equal(row.length,this.cEnd-this.c+1);
   row.forEach((v,j)=>this.sheet.cells.set((this.r+i)+':'+(this.c+j),v));
  });return this;
 }
 setValue(x){return this.setValues([[x]]);}
 clearContent(){
  for(let i=this.r;i<=this.rEnd;i++)
   for(let j=this.c;j<=this.cEnd;j++)this.sheet.cells.delete(i+':'+j);
  return this;
 }
 setDataValidation(){return this;}
 setNumberFormat(){return this;}
 setFontColor(){return this;}
 setFontWeight(){return this;}
 setBackground(){return this;}
}
class Sheet{
 constructor(name){this.name=name;this.cells=new Map();this.rows=1000;this.cols=26;}
 getName(){return this.name;}
 getLastRow(){let max=0;for(const k of this.cells.keys())
   max=Math.max(max,Number(k.split(':')[0]));return max;}
 getMaxRows(){return this.rows;}
 getMaxColumns(){return this.cols;}
 insertRowsAfter(_,num){this.rows+=num;}
 insertColumnsAfter(_,num){this.cols+=num;}
 getRange(a,b,c,d){
  return typeof a==='number'?new Range(this,a,b,a+(c||1)-1,b+(d||1)-1):
   new Range(this,...fromA1(a));
 }
}
const all=[
 '20_突合データ','30_分析設定','31_マスタ編集',
 '93_求人分析マスタ','42_カスタム分析','92_運用管理'
];
const sheets=Object.fromEntries(all.map(k=>[k,new Sheet(k)]));
const ss={getSheetByName:name=>sheets[name]||null,
 getSheets:()=>Object.values(sheets)};
function app(media,month='2026-10',ref='J',count=1,age=25){
 const a=Array(23).fill('');
 a[0]='A';a[1]='001';a[3]=ref;a[4]=ref==='J'?1:0;
 a[5]=month+'-16';a[6]=month;a[10]=count;a[12]=media;a[13]=age;
 a[14]='女性';return a;
}
const j=Array(20).fill('');
j[0]='J';j[1]='JOB_CSV';j[5]='事務職';j[6]='事務';
j[12]='3';j[13]=300000;j[14]='top-file.png';
let apps=[app('Indeed'),app('自社'),app('Indeed','2026-09'),app('SNS','2026-10','',1,35)];
const jobs=[j];
const masters={keywords:['事務'],enterprises:[['001','架空会社']]};
const settings={start:'',end:'',ageMin:null,ageMax:null,
 targetMin:20,targetMax:29,monthDayWidth:7,hourWidth:6};
const enabled=new Map();
const options=[
 ['応募媒体','media','application'],
 ['応募年月','month','application'],
 ['職種','job-category','jobAnalysis'],
 ['給与区分','salary-type','jobCsv'],
 ['monthly-salary','monthly-salary','jobCsv']
];
for(const [,id] of options)enabled.set(id,true);
let state={import_status:'READY',active_generation:'G1'};
let alerts=[];
sheets['30_分析設定'].getRange('I36').setValue(true); // top-image-detail ON
const vals=sheets['42_カスタム分析'];
const control=sheets['92_運用管理'];
const gas={
 SpreadsheetApp:{
  getActiveSpreadsheet:()=>ss,flush(){},
  getUi:()=>({alert:s=>alerts.push(s)}),
  newDataValidation:()=>({
   requireValueInRange(){return this;},
   requireValueInList(){return this;},
   setAllowInvalid(){return this;},
   build(){return {};}
  })
 },
 Utilities:{formatDate:()=>''},
 vasImportLock_:()=>({releaseLock(){}}),
 vasStatus_:()=>state.import_status,
 vasBasicSnapshotFromSheet_:()=>({options:settings,masters,
  enabled:[...enabled]}),
 vasReadVisibleRange_:sheet=>sheet.name==='20_突合データ'?apps:jobs,
 vasStateSnapshot_:()=>state,
 vasStateGet_:key=>state[key]||'',
 vasStateBulkSet_:updates=>Object.assign(state,updates),
 vasEnsureRows_:(sheet,num)=>{
  if(sheet.getMaxRows()<num)sheet.insertRowsAfter(sheet.getMaxRows(),num-sheet.getMaxRows());
 },
 vasEnsureColumns_:(sheet,num)=>{
  if(sheet.getMaxColumns()<num)
   sheet.insertColumnsAfter(sheet.getMaxColumns(),num-sheet.getMaxColumns());
 },
 vasSafeCell_:value=>{
  if(typeof value==='string'&&/^[=+@]/.test(value))return "'"+value;
  return value;
 }
};
const core=new Function(...Object.keys(gas),code+
 '\nreturn {refreshCustomAxes,applyCustomAnalysis,vasCustomRefreshStatus_,vasCustomOnEdit_,vasCustomSelection_,vasCustomPreflight_};'
)(...Object.values(gas));
core.refreshCustomAxes();
assert.equal(vals.getRange('B3').getValue(),'応募年月');
assert.equal(vals.getRange('E3').getValue(),'応募媒体');
assert.equal(control.getRange('K2').getValue(),'応募年月');
assert.equal(control.getRange('K3').getValue(),'応募媒体');
assert.equal(control.getRange('K2:K40').getValues().some(r=>r[0]==='TOP画像ファイル名'),true);
core.applyCustomAnalysis();
assert.equal(vals.getRange('A12').getValue(),'応募年月');
assert.equal(vals.getRange('D12').getValue(),'行合計');
assert.equal(vals.getRange('E12').getValue(),'Indeed');
assert.equal(vals.getRange('F12').getValue(),'SNS');
assert.equal(vals.getRange('G12').getValue(),'自社');
assert.equal(vals.getRange('A13').getValue(),'2026-09');
assert.equal(vals.getRange('D13').getValue(),1);
assert.equal(vals.getRange('A14').getValue(),'2026-10');
assert.equal(vals.getRange('D14').getValue(),3);
assert.equal(vals.getRange('D15').getValue(),4);
assert.equal(state.custom_output_cols,7);
assert.equal(state.custom_generation,'G1');
const original=vals.getRange('E12:G15').getValues();
assert.equal(original[0][0],'Indeed');
// Use a different axis and metric: old extra columns must disappear.
vals.getRange('B3').setValue('応募媒体');
vals.getRange('E3').setValue('応募年月');
vals.getRange('E4').setValue('ターゲット率');
core.applyCustomAnalysis();
assert.equal(vals.getRange('E12').getValue(),'2026-09');
assert.equal(vals.getRange('F12').getValue(),'2026-10');
assert.equal(vals.getRange('G12').getValue(),'');
assert.equal(vals.getRange('D16').getValue(),3/4);
assert.equal(vals.getRange('D13').getValue(),1);
// Re-run without changing settings: output size stable and no added tabs.
core.applyCustomAnalysis();
assert.equal(ss.getSheets().length,6);
// Duplicate axis is a user error; output stays unchanged.
vals.getRange('E3').setValue('応募媒体');
assert.throws(()=>core.applyCustomAnalysis(),/同じ分析軸/);
assert.equal(vals.getRange('E12').getValue(),'2026-09');
vals.getRange('E3').setValue('応募年月');
// A source change invalidates the applied analysis snapshot.
settings.targetMin=30;
core.vasCustomOnEdit_({range:{
 getSheet:()=>sheets['30_分析設定'],
 getRow:()=>13,getLastRow:()=>13,getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(vals.getRange('A8').getValue(),'設定変更あり・カスタム分析未反映');
settings.targetMin=20;
core.vasCustomRefreshStatus_();
assert.equal(vals.getRange('A8').getValue(),'カスタム分析反映済み');
// The preflight must reject global cell-capacity overflow without truncation.
const fake={getSheets:()=>[{
 getMaxRows:()=>9000000,getMaxColumns:()=>2
}],getSheetByName:()=>vals};
assert.throws(()=>core.vasCustomPreflight_(fake,{},{
 rows:[],numCols:5
}),/1,000万セル/);
console.log('Custom-axis dropdown, matrix output, rate display, stale settings, column cleanup and capacity preflight passed.');
