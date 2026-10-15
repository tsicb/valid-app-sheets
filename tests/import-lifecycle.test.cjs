'use strict';
/* Node test for Apps Script staged CSV import.
 * Run: node tests/import-lifecycle.test.cjs
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const src=['gas/00_Config.gs','gas/04_CsvUpload.gs','gas/05_CsvPublish.gs']
  .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n\n');

function col(x){return x.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
class Range {
  constructor(sh,r,c,h,w){this.s=sh;this.r=r;this.c=c;this.h=h;this.w=w;}
  getValues(){return Array.from({length:this.h},(_,i)=>
    Array.from({length:this.w},(_,j)=>this.s.cells.get((this.r+i)+':'+(this.c+j))??''));}
  getDisplayValues(){return this.getValues().map(a=>a.map(v=>String(v)));}
  setValues(x){
    assert.equal(x.length,this.h);
    x.forEach((row,i)=>{
      assert.equal(row.length,this.w);
      if(this.s.failOnce&&this.r+i>=2){
        this.s.failOnce=false;
        throw new Error('simulated write interruption');
      }
      row.forEach((v,j)=>this.s.cells.set((this.r+i)+':'+(this.c+j),v));
    });
    return this;
  }
  getValue(){return this.getValues()[0][0];}
  setValue(x){return this.setValues([[x]]);}
  setNumberFormat(){return this;}
  clearContent(){
    for(let i=0;i<this.h;i++)for(let j=0;j<this.w;j++)
      this.s.cells.delete((this.r+i)+':'+(this.c+j));
    return this;
  }
}
class Sheet {
  constructor(ss,name){this.ss=ss;this.name=name;this.cells=new Map();this.rows=1000;this.cols=26;this.hidden=false;this.failOnce=false;}
  getName(){return this.name;}
  getRange(a,b,c,d){
    if(typeof a==='number')return new Range(this,a,b,c||1,d||1);
    const m=a.match(/^([A-Z]+)(\d+)$/);
    if(!m)throw Error('Unsupported A1 '+a);
    return new Range(this,Number(m[2]),col(m[1]),1,1);
  }
  getLastRow(){
    let n=0;for(const [k,v] of this.cells)
      if(v!==''&&v!=null)n=Math.max(n,Number(k.split(':')[0]));
    return n;
  }
  getMaxRows(){return this.rows;}
  getMaxColumns(){return this.cols;}
  insertRowsAfter(_i,n){this.rows+=n;}
  insertColumnsAfter(_i,n){this.cols+=n;}
  setFrozenRows(){return this;}
  hideSheet(){this.hidden=true;return this;}
  setName(n){this.name=n;return this;}
  copyTo(ss){
    const s=ss.insertSheet('TemporaryCopy'+ss.getSheets().length);
    s.cells=new Map(this.cells);s.rows=this.rows;s.cols=this.cols;
    return s;
  }
}
class Workbook {
  constructor(){this.sheets=[];}
  insertSheet(name){const s=new Sheet(this,name);this.sheets.push(s);return s;}
  getSheetByName(n){return this.sheets.find(x=>x.name===n)||null;}
  getSheets(){return [...this.sheets];}
  deleteSheet(s){this.sheets.splice(this.sheets.indexOf(s),1);}
}
const ss=new Workbook();
const SpreadsheetApp={
  getActiveSpreadsheet:()=>ss,
  flush(){},
  getUi:()=>({alert(){}})
};
const LockService={getDocumentLock:()=>({tryLock:()=>true,releaseLock(){}})};
const Utilities={getUuid:()=>String(++Utilities.serial).padStart(32,'0'),serial:0};
const app=new Function('SpreadsheetApp','LockService','Utilities',src+
  '\nreturn {beginVASImport,appendVASImportChunk,finalizeVASImport,cancelVASImport,vasStateGet_,vasStatus_,VAS_APPLICATION_HEADERS,VAS_JOB_HEADERS,VAS_IMAGE_MASTER_HEADERS};'
)(SpreadsheetApp,LockService,Utilities);
function seed(name,headers,data=[]){
  const s=ss.insertSheet(name);
  if(headers.length)s.getRange(1,1,1,headers.length).setValues([headers]);
  if(data.length)s.getRange(2,1,data.length,headers.length).setValues(data);
  return s;
}
seed('20_突合データ',app.VAS_APPLICATION_HEADERS);
seed('93_求人分析マスタ',app.VAS_JOB_HEADERS);
seed('94_画像マスタ',app.VAS_IMAGE_MASTER_HEADERS);
seed('92_運用管理',['管理キー','値'],[
 ['template_version','0.1.0'],['import_status','UNIMPORTED'],
 ['active_generation',''],['last_import_at',''],['last_analysis_at','']
]);
seed('00_ホーム',[]);
seed('30_分析設定',[]);
const applicant=(ref,status)=>[
 'APP000001','001','J123',ref,status,'2026-10-16','2026-10',16,'金',11,1,
 '応募','Indeed',30,'女性','漢字を含む','東京都',1,'事務','正社員','東京都','東京支社','JOB_CSV'
];
const job=(ref)=>[
 ref,'JOB_CSV','001','J123','67890','事務職','事務','正社員','','東京支社','東京都',
 '求人備考1\n2行目','3',200000,'img.png',1,0,'001::005',2,320
];
const image=['img.png','67890','','未取得',''];
function stage(model,appRow=applicant('JOB000001',1)){
  const summary={incomingApplications:1,duplicateCount:0,totalApplications:1,
    matchedApplications:1,embeddedApplications:0,jobRecords:1,imageTargets:1};
  const prep=app.beginVASImport(summary,{applicationData:1,jobAnalysisMaster:1,imageCandidates:1});
  app.appendVASImportChunk(prep.sessionId,'applicationData',0,[appRow]);
  app.appendVASImportChunk(prep.sessionId,'jobAnalysisMaster',0,[job('JOB000001')]);
  app.appendVASImportChunk(prep.sessionId,'imageCandidates',0,[image]);
  return prep.sessionId;
}
const firstId=stage();
const first=app.finalizeVASImport(firstId);
assert.equal(first.applications,1);
assert.equal(app.vasStatus_(),'READY');
assert.equal(ss.getSheetByName('20_突合データ').getRange(2,2).getValue(),'001');
assert.equal(ss.getSheetByName('93_求人分析マスタ').getRange(2,12).getValue(),'求人備考1\n2行目');
assert.equal(ss.getSheetByName('00_ホーム').getRange('B4').getValue(),1);
assert.equal(ss.getSheetByName('95_作業応募'),null);
assert.equal(ss.getSheetByName('98_復旧応募'),null);

// Simulate a mid-publish failure; backup must restore the first generation.
const secondId=stage();
ss.getSheetByName('93_求人分析マスタ').failOnce=true;
assert.throws(()=>app.finalizeVASImport(secondId),/simulated write interruption/);
assert.equal(app.vasStatus_(),'READY');
assert.equal(ss.getSheetByName('20_突合データ').getRange(2,2).getValue(),'001');
assert.equal(ss.getSheetByName('93_求人分析マスタ').getRange(2,12).getValue(),'求人備考1\n2行目');

// An incomplete staging upload can be discarded without touching live data.
const cancelId=app.beginVASImport(
  {incomingApplications:1,totalApplications:1,jobRecords:0,imageTargets:0},
  {applicationData:1,jobAnalysisMaster:0,imageCandidates:0}
).sessionId;
assert.equal(app.vasStatus_(),'STAGING');
assert.equal(app.cancelVASImport(cancelId).cancelled,true);
assert.equal(app.vasStatus_(),'READY');
assert.equal(ss.getSheetByName('20_突合データ').getRange(2,2).getValue(),'001');
process.stdout.write('CSV staging, publishing, rollback and cancellation passed.\n');
