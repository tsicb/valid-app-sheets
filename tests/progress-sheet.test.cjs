'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=['gas/00_Config.gs','gas/06_BasicCore.gs',
 'gas/09_ProgressCore.gs','gas/10_ProgressSheet.gs']
 .map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
function parseA1(text) {
 const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(text);
 if(!m)throw Error('Unexpected range: '+text);
 const c=x=>[...x].reduce((n,ch)=>26*n+ch.charCodeAt(0)-64,0);
 return [Number(m[2]),c(m[1]),m[4]?Number(m[4]):Number(m[2]),
   m[3]?c(m[3]):c(m[1])];
}
class Range{
 constructor(sh,row,col,lastRow,lastCol) {
  Object.assign(this,{sh,row,col,lastRow,lastCol});
 }
 getValues(){
  return Array.from({length:this.lastRow-this.row+1},(_,i)=>
   Array.from({length:this.lastCol-this.col+1},(_,j)=>
     this.sh.cells.get((this.row+i)+','+(this.col+j))?.value??''));
 }
 getDisplayValues(){return this.getValues().map(r=>r.map(x=>String(x)));}
 getValue(){return this.getValues()[0][0];}
 getDisplayValue(){return String(this.getValue());}
 getFormula(){return this.sh.cells.get(this.row+','+this.col)?.formula||'';}
 setValues(rows){
  assert.equal(rows.length,this.lastRow-this.row+1);
  for(let i=0;i<rows.length;i++){
   assert.equal(rows[i].length,this.lastCol-this.col+1);
   rows[i].forEach((value,j)=>this.sh.cells.set((this.row+i)+','+(this.col+j),{value}));
  }
  return this;
 }
 setFormulas(rows){
  assert.equal(rows.length,this.lastRow-this.row+1);
  for(let i=0;i<rows.length;i++){
   assert.equal(rows[i].length,this.lastCol-this.col+1);
   rows[i].forEach((formula,j)=>this.sh.cells.set((this.row+i)+','+(this.col+j),{
     value:formula,formula}));
  }
  return this;
 }
 setValue(value){return this.setValues([[value]]);}
 setFormula(value){return this.setFormulas([[value]]);}
 clearContent(){
  for(let r=this.row;r<=this.lastRow;r++)
   for(let c=this.col;c<=this.lastCol;c++)this.sh.cells.delete(r+','+c);
  return this;
 }
 setNumberFormat(){return this;}
 setBackground(){return this;}
 setFontColor(){return this;}
 setFontWeight(){return this;}
}
class Builder{
 constructor(chart){this.chart=chart||{options:{},ranges:[]};}
 clearRanges(){this.chart.ranges=[];return this;}
 addRange(r){this.chart.ranges.push(r);return this;}
 setChartType(t){this.chart.type=t;return this;}
 setNumHeaders(n){this.chart.headers=n;return this;}
 setPosition(...p){this.chart.position=p;return this;}
 setOption(k,v){this.chart.options[k]=v;return this;}
 build(){
  const chart=this.chart;
  chart.getOptions=()=>({get:k=>chart.options[k]});
  chart.modify=()=>new Builder(chart);
  return chart;
 }
}
class Sheet{
 constructor(name){this.name=name;this.cells=new Map();this.maxRows=1000;
  this.maxColumns=26;this.charts=[];}
 getRange(a,b,h,w){
  if(typeof a==='number')return new Range(this,a,b,a+(h||1)-1,b+(w||1)-1);
  return new Range(this,...parseA1(a));
 }
 getMaxRows(){return this.maxRows;}
 getMaxColumns(){return this.maxColumns;}
 getLastRow(){let n=0;for(const [key,cell] of this.cells)
    if(cell.value!==''&&cell.value!==null)n=Math.max(n,Number(key.split(',')[0]));
    return n;}
 insertRowsAfter(_i,n){this.maxRows+=n;}
 insertColumnsAfter(_i,n){this.maxColumns+=n;}
 getCharts(){return this.charts.slice();}
 newChart(){return new Builder();}
 insertChart(c){this.charts.push(c);}
 updateChart(c){const i=this.charts.findIndex(x=>x.options.title===c.options.title);
  assert.notEqual(i,-1);this.charts[i]=c;}
}
const sheets=new Map(['30_分析設定','31_マスタ編集',
 '20_突合データ','91_進捗キャッシュ','41_応募進捗'].map(n=>[n,new Sheet(n)]));
const sheet=n=>sheets.get(n);
sheet('30_分析設定').getRange('B28:B30').setValues([['日別'],[true],[3]]);
sheet('30_分析設定').getRange('B13:B14').setValues([[20],[39]]);
sheet('41_応募進捗').getRange('A28:D28').setValues([[
 '応募年月','応募数','ターゲット応募数','ターゲット率'
]]);
let submitted=[],dataRows=[];
function app(date,count,age){
 const r=Array(23).fill('');
 r[5]=date;r[6]=date.slice(0,7);r[10]=count;r[13]=age;
 return r;
}
dataRows=[app('2026-09-12',2,28),app('2026-10-05',3,36),
 app('2026-10-16',1,27)];
const opts={ageMin:null,ageMax:null,targetMin:20,targetMax:39};
const ui={alert:x=>submitted.push(x)};
let states={active_generation:'G1',import_status:'READY'};
const deps={
 SpreadsheetApp:{
  getActiveSpreadsheet:()=>({getSheetByName:sheet}),
  getUi:()=>ui,
  flush(){}
 },
 Utilities:{formatDate:()=>{throw Error('unexpected date')}},
 Charts:{ChartType:{COMBO:'COMBO'}},
 vasImportLock_:()=>({releaseLock(){}}),
 vasStatus_:()=>states.import_status,
 vasBasicSnapshotFromSheet_:()=>({options:opts}),
 vasReadVisibleRange_:()=>dataRows,
 vasEnsureRows_:(sh,rows)=>{if(sh.getMaxRows()<rows)
   sh.insertRowsAfter(sh.getMaxRows(),rows-sh.getMaxRows());},
 vasStateBulkSet_:updates=>Object.assign(states,updates),
 vasStateGet_:key=>states[key]||'',
 vasStateSnapshot_:()=>states
};
const context=new Function(...Object.keys(deps),source+
 '\nreturn {applyProgressAnalysis,vasProgressChartFormulas_,vasProgressCheckStatus_,vasProgressOnEdit_};'
)(...Object.values(deps));
context.applyProgressAnalysis();
const view=sheet('41_応募進捗'),cache=sheet('91_進捗キャッシュ');
assert.equal(cache.getRange('A1').getValue(),'月内日');
assert.equal(cache.getRange('C17').getValue(),4);
assert.equal(view.getRange('B3').getFormula(),"='30_分析設定'!B28");
assert.equal(view.getRange('A29').getValue(),'2026-10');
assert.equal(view.getRange('A30').getValue(),'2026-09');
assert.equal(view.getCharts().length,1);
assert.equal(view.getCharts()[0].type,'COMBO');
assert.equal(view.getCharts()[0].ranges.length,1);
assert.equal(view.getCharts()[0].ranges[0].row,28);
assert.equal(view.getRange('G29').getFormula().includes('$B$3="日別"'),true);
assert.equal(view.getRange('H29').getFormula().includes('$B$29'),true);
assert.equal(view.getRange('K29').getFormula().includes('$B$30>=3'),true);
assert.equal(states.progress_generation,'G1');
assert.equal(states.progress_applied_config,JSON.stringify({
 start:'',end:'',ageMin:null,ageMax:null,targetMin:20,targetMax:39
}));
assert.equal(submitted.length,1);
context.applyProgressAnalysis(); // chart must be updated, not duplicated
assert.equal(view.getCharts().length,1);
assert.equal(submitted.length,2);
// Settings B28 and B29 remain formula-only changes.
sheet('30_分析設定').getRange('B28').setValue('累積');
sheet('30_分析設定').getRange('B29').setValue(false);
context.vasProgressOnEdit_({range:{
 getSheet:()=>sheet('30_分析設定'),getRow:()=>28,getLastRow:()=>29,
 getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(view.getCharts().length,1);
assert.equal(view.getRange('A6').getDisplayValue().startsWith('応募進捗反映済み'),true);
// Date/age changes flag chart as stale but keep existing data.
opts.ageMin=30;
sheet('30_分析設定').getRange('B9').setValue(30);
context.vasProgressOnEdit_({range:{
 getSheet:()=>sheet('30_分析設定'),getRow:()=>9,getLastRow:()=>9,
 getColumn:()=>2,getLastColumn:()=>2
}});
assert.equal(view.getRange('A6').getValue(),
 '期間・年齢設定変更あり：応募進捗を再集計');
opts.ageMin=null;
sheet('30_分析設定').getRange('B9').setValue('');
context.vasProgressCheckStatus_({getSheetByName:sheet});
assert.equal(view.getRange('A6').getValue(),'応募進捗反映済み');
// An empty time window removes stale rows from cache and month listing.
opts.start='2027-01-01';
context.applyProgressAnalysis();
assert.equal(cache.getRange('B2').getValue(),'');
assert.equal(view.getRange('A29').getValue(),'');
assert.equal(view.getCharts().length,1);
assert.equal(view.getRange('D3').getValue(),'対象期間に応募データがありません');
console.log('Progress sheet cache, combo chart lifecycle, formulas, freshness and empty periods passed.');
