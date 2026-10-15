/**
 * Dependency-free Apps Script mock tests for the template initialization phase.
 * Run in Node.js by reading and joining gas/*.gs, then call
 * runTemplateSmokeTests(sourceText). Tests do NOT call Google APIs.
 */
function runTemplateSmokeTests(source) {
  function assert(condition, message) {
    if (!condition) throw new Error('TEST FAILED: ' + message);
  }
  const columnNumber = function(s) {
    return s.toUpperCase().split('').reduce(function(n,c) {
      return n * 26 + (c.charCodeAt(0)-64);
    },0);
  };
  const colName = function(n) {
    let s='';
    while(n>0){ n--; s=String.fromCharCode(65+n%26)+s; n=Math.floor(n/26); }
    return s;
  };
  class FakeRange {
    constructor(sheet,r,c,rs,cs) {
      this.sheet=sheet; this.row=r; this.col=c; this.rows=rs; this.cols=cs;
    }
    getA1Notation() {
      return colName(this.col)+this.row+
        (this.rows===1&&this.cols===1?'':':'+colName(this.col+this.cols-1)+(this.row+this.rows-1));
    }
    getRow(){return this.row;}
    getDisplayValues(){
      return Array.from({length:this.rows},(_,i)=>
        Array.from({length:this.cols},(_,j)=>String(this.sheet.cells.get((this.row+i)+':'+(this.col+j))??'')));
    }
    getValue(){return this.sheet.cells.get(this.row+':'+this.col)??'';}
    setValue(x){this.sheet.cells.set(this.row+':'+this.col,x);this.sheet.writes++;return this;}
    setValues(rows){
      assert(rows.length===this.rows,'row count mismatch '+this.getA1Notation());
      rows.forEach((line,i)=>{
        assert(line.length===this.cols,'column count mismatch '+this.getA1Notation());
        line.forEach((x,j)=>this.sheet.cells.set((this.row+i)+':'+(this.col+j),x));
      });
      this.sheet.writes++;return this;
    }
    setFormula(v){return this.setValue(v);}
    setBackground(v){this.sheet.formats++;this.sheet.styles.set(this.row+':'+this.col,v);return this;}
    setFontColor(){this.sheet.formats++;return this;}
    setFontWeight(){this.sheet.formats++;return this;}
    setFontSize(){this.sheet.formats++;return this;}
    setVerticalAlignment(){this.sheet.formats++;return this;}
    setNumberFormat(){this.sheet.formats++;return this;}
    setNote(){this.sheet.formats++;return this;}
    setDataValidation(){this.sheet.formats++;return this;}
    merge(){this.sheet.formats++;return this;}
    insertCheckboxes(){this.sheet.formats++;return this;}
    createFilter(){this.sheet.formats++;return this;}
  }
  class FakeSheet {
    constructor(ss,name){
      this.ss=ss;this.name=name;this.cells=new Map();this.styles=new Map();
      this.writes=0;this.formats=0;this.rows=1000;this.cols=26;this.hidden=false;
    }
    getName(){return this.name;}
    getParent(){return this.ss;}
    getRange(a,b,c,d) {
      if(typeof a==='number')return new FakeRange(this,a,b,c||1,d||1);
      const m=String(a).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      assert(!!m,'invalid A1 '+a);
      const row=Number(m[2]),col=columnNumber(m[1]);
      const lastRow=m[4]?Number(m[4]):row;
      const lastCol=m[3]?columnNumber(m[3]):col;
      return new FakeRange(this,row,col,lastRow-row+1,lastCol-col+1);
    }
    getLastRow(){
      let n=0;this.cells.forEach((v,k)=>{if(v!==''&&v!==null)n=Math.max(n,Number(k.split(':')[0]));});
      return n;
    }
    getLastColumn(){
      let n=0;this.cells.forEach((v,k)=>{if(v!==''&&v!==null)n=Math.max(n,Number(k.split(':')[1]));});
      return n;
    }
    getMaxRows(){return this.rows;}
    getMaxColumns(){return this.cols;}
    insertColumnsAfter(_,count){this.cols+=count;}
    setTabColor(){this.formats++;return this;}
    setFrozenRows(){this.formats++;return this;}
    setColumnWidth(){this.formats++;return this;}
    setColumnWidths(){this.formats++;return this;}
    setRowHeight(){this.formats++;return this;}
    setRowHeights(){this.formats++;return this;}
    hideSheet(){this.hidden=true;}
  }
  class FakeSpreadsheet {
    constructor(){
      this.sheets=[new FakeSheet(this,'Sheet1')];
    }
    getSheets(){return this.sheets.slice();}
    getSheetByName(name){return this.sheets.find(s=>s.name===name)||null;}
    insertSheet(name){const s=new FakeSheet(this,name);this.sheets.push(s);return s;}
    setActiveSheet(s){this.active=s;return s;}
    moveActiveSheet(pos){
      const i=this.sheets.indexOf(this.active);
      this.sheets.splice(i,1);
      this.sheets.splice(pos-1,0,this.active);
    }
    deleteSheet(s){const i=this.sheets.indexOf(s);if(i>=0)this.sheets.splice(i,1);}
  }
  class FakeValidation {
    requireCheckbox(){return this;}
    requireDate(){return this;}
    requireNumberGreaterThan(){return this;}
    requireNumberBetween(){return this;}
    requireValueInList(){return this;}
    requireValueInRange(){return this;}
    setAllowInvalid(){return this;}
    build(){return {};}
  }
  const ss=new FakeSpreadsheet();
  const alerts=[];
  const SpreadsheetApp={
    getActiveSpreadsheet:()=>ss,
    getUi:()=>({alert:(s)=>alerts.push(String(s)),
      createMenu:()=>({addItem(){return this;},addSeparator(){return this;},addToUi(){return this;}})}),
    newDataValidation:()=>new FakeValidation()
  };
  const LockService={getDocumentLock:()=>({tryLock:()=>true,releaseLock(){}})};
  const app=new Function('SpreadsheetApp','LockService', source+
    '\nreturn {setupTemplate,verifyTemplate,VAS_SHEETS,VAS_DISPLAY_ITEMS,VAS_AGE_LABELS};'
  )(SpreadsheetApp,LockService);
  app.setupTemplate();
  assert(ss.getSheets().length===14,'expected 14 generated sheets');
  assert(ss.getSheetByName('Sheet1')===null,'blank Sheet1 should be removed');
  assert(ss.getSheetByName('30_分析設定').getRange('B19').getValue()===50,'hourly width');
  assert(ss.getSheetByName('30_分析設定').getRange('I37').getValue()===true,'display defaults');
  assert(ss.getSheetByName('93_求人分析マスタ').getRange('L1').getValue()==='求人備考',
    'notes stored in job master');
  assert(ss.getSheetByName('40_基本分析').getRange('L8').getValue()==='その他',
    'eighth age column');
  assert(ss.getSheetByName('41_応募進捗').getRange('B3').getValue()==="='30_分析設定'!B28",
    'progress mode should refer to a single setting');
  assert(ss.getSheetByName('94_画像マスタ').hidden===true,'image master should be hidden');

  const settings=ss.getSheetByName('30_分析設定');
  const master=ss.getSheetByName('31_マスタ編集');
  settings.getRange('B19').setValue(777);
  master.getRange('A5').setValue('編集したKW');
  const cell=settings.getRange('B19');
  cell.setBackground('#112233');
  const style=cell.sheet.styles.get('19:2');
  const writeCount=ss.getSheets().reduce((x,s)=>x+s.writes,0);
  const formatCount=ss.getSheets().reduce((x,s)=>x+s.formats,0);
  app.setupTemplate();
  assert(ss.getSheets().length===14,'second setup created duplicate sheets');
  assert(settings.getRange('B19').getValue()===777,'existing setting overwritten');
  assert(master.getRange('A5').getValue()==='編集したKW','existing master overwritten');
  assert(settings.styles.get('19:2')===style,'custom background lost');
  assert(ss.getSheets().reduce((x,s)=>x+s.writes,0)===writeCount,
    'second setup unexpectedly wrote values');
  assert(ss.getSheets().reduce((x,s)=>x+s.formats,0)===formatCount,
    'second setup unexpectedly changed formats');

  const data=ss.getSheetByName('20_突合データ');
  data.getRange('A1').setValue('壊れたヘッダー');
  let rejected=false;
  try {app.setupTemplate();}catch(e){rejected=true;}
  assert(rejected,'header corruption must abort setup');
  assert(data.getRange('A1').getValue()==='壊れたヘッダー','header changed on failure');
  assert(app.VAS_DISPLAY_ITEMS.length===33,'should have 33 display definitions');
  assert(app.VAS_AGE_LABELS.length===8,'should have 8 age columns');
  return {passed:12,createdSheets:14,displayItems:33,ageColumns:8,
          secondRun:'no values or formats overwritten',
          brokenHeader:'rejected without repair',alerts:alerts.length};
}

if(typeof module!=='undefined' && module.exports) {
  module.exports={runTemplateSmokeTests};
}
