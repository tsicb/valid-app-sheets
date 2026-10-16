'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=[
  'gas/00_Config.gs','gas/06_BasicCore.gs','gas/08_BasicFreshness.gs'
].map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');

const sheetValues={settings:{},home:{},state:{},master:{}};
const masterRows=[['事務',true,'','','001','表示会社',true]];
const sheet=(kind,name)=>({
  getName:()=>name,
  getLastRow:()=>kind==='master'?4+masterRows.length:40,
  getRange:function(a1){
    if(a1==='B5:B25'&&kind==='settings')return {
      getValues:()=>Array.from({length:21},(_,i)=>[sheetValues.settings['B'+(i+5)]??''])
    };
    if(kind==='master'&&a1===5&&arguments[1]===1)return {
      getValues:()=>masterRows.map(r=>r.slice())
    };
    if((a1==='G5:I37'||(a1===5&&arguments[1]===7))&&kind==='settings')return {
      getValues:()=>display.map(([id,label,enabled])=>[id,label,enabled])
    };
    const values=sheetValues[kind];
    return {
      getValue:()=>values[a1]??'',
      getDisplayValue:()=>String(values[a1]??''),
      setValue:v=>{values[a1]=v;return this;}
    };
  }
});
let display;let state={};
const ss={
  getSheetByName:name=>({
    '30_分析設定':settings,
    '00_ホーム':home,
    '92_運用管理':control,
    '31_マスタ編集':master
  })[name]||null
};
const settings=sheet('settings','30_分析設定');
const home=sheet('home','00_ホーム');
const control=sheet('state','92_運用管理');
const master=sheet('master','31_マスタ編集');
const context=new Function('SpreadsheetApp','Utilities','getState','updateState',
  'const vasStateSnapshot_=()=>getState();\n'+source+
  '\nreturn {VAS_DISPLAY_ITEMS,vasBasicSnapshotFromSheet_,vasWriteAppliedBasicConditions_,vasRefreshBasicStatus_,vasOnEditBasicStatus_,vasCompareBasicSnapshot_,setState:updateState};'
)({getActiveSpreadsheet:()=>ss},{formatDate:()=>''},()=>state,s=>{state=s;});

display=context.VAS_DISPLAY_ITEMS.map(([id,name,on])=>[id,name,on]);
Object.assign(sheetValues.settings,{
  B5:'2026-04-01',B6:'2026-09-30',B9:18,B10:65,
  B13:25,B14:39,B17:7,B18:6,B19:50,B20:1000,
  B21:50000,B22:500000,B23:300,B24:1,B25:5
});
const applied=context.vasBasicSnapshotFromSheet_(settings,master);
const initial={
  import_status:'READY',active_generation:'GEN1',
  basic_analysis_generation:'GEN1',basic_applied_config:JSON.stringify(applied)
};
context.setState(initial);
context.vasWriteAppliedBasicConditions_(ss,applied);
assert.equal(sheetValues.home.B8,'2026-04-01 ～ 2026-09-30');
assert.equal(sheetValues.home.B9,'対象：18～65歳 ／ ターゲット：25～39歳');

const event=(row,col=2,sheetRef=settings)=>({
  range:{getSheet:()=>sheetRef,getRow:()=>row,getLastRow:()=>row,
    getColumn:()=>col,getLastColumn:()=>col}
});
sheetValues.settings.B13=30;
context.vasOnEditBasicStatus_(event(13));
assert.equal(sheetValues.home.B15,'設定変更あり・再集計未反映');
assert.equal(sheetValues.settings.B38,'設定変更あり・再集計未反映');
assert.equal(sheetValues.home.B9,'対象：18～65歳 ／ ターゲット：25～39歳',
  'home must retain last APPLIED conditions');
sheetValues.settings.B13=25;
context.vasOnEditBasicStatus_(event(13));
assert.equal(sheetValues.home.B15,'基本分析反映済み');

const statusRow=5+display.findIndex(d=>d[0]==='status');
display[statusRow-5][2]=!display[statusRow-5][2];
context.vasOnEditBasicStatus_(event(statusRow,9));
assert.equal(sheetValues.home.B15,'設定変更あり・再集計未反映');
display[statusRow-5][2]=!display[statusRow-5][2];
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'基本分析反映済み');

// Later bucket widths are part of the freshness signature.
sheetValues.settings.B21=100000;
context.vasOnEditBasicStatus_(event(21));
assert.equal(sheetValues.home.B15,'設定変更あり・再集計未反映');
sheetValues.settings.B21=50000;
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'基本分析反映済み');

// KW and enterprise master edits invalidate the applied analysis.
masterRows[0][0]='営業';
context.vasOnEditBasicStatus_(event(5,1,master));
assert.equal(sheetValues.home.B15,'設定変更あり・再集計未反映');
masterRows[0][0]='事務';
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'基本分析反映済み');
masterRows[0][5]='新しい表示名';
context.vasOnEditBasicStatus_(event(5,6,master));
assert.equal(sheetValues.home.B15,'設定変更あり・再集計未反映');
masterRows[0][5]='表示会社';
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'基本分析反映済み');

context.setState({...initial,active_generation:'GEN2'});
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'CSV更新後・基本分析未反映');
assert.equal(sheetValues.home.B9,'対象：18～65歳 ／ ターゲット：25～39歳');

context.setState({...initial,import_status:'STAGING'});
sheetValues.home.B15='CSV取込中';
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'CSV取込中');

context.setState({...initial,basic_applied_config:''});
context.vasRefreshBasicStatus_();
assert.equal(sheetValues.home.B15,'基本分析の再集計が必要');

console.log('Applied-condition display, onEdit freshness, revert, and CSV-generation staleness passed.');
