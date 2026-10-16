'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=['gas/00_Config.gs','gas/06_BasicCore.gs','gas/11_CustomCore.gs']
 .map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
const core=new Function('Utilities',code+
 '\nreturn {VAS_CUSTOM_AXES_,vasCustomCapabilities_,vasCustomAxisChoices_,vasCustomCalculate_,vasCustomAxisCategory_};'
)({formatDate:()=>{throw Error('fixture does not use Date')}});
const masters={keywords:['配送','事務'],enterprises:[['001','架空会社']]};
function app(id,ref,media,age,flag=1,count=1,day='2026-10-10'){
 const r=Array(23).fill('');
 r[0]=id;r[1]='001';r[3]=ref;r[4]=flag;r[5]=day;r[6]=day.slice(0,7);
 r[7]=Number(day.slice(8));r[8]='土';r[9]=10;
 r[10]=count;r[11]='応募';r[12]=media;r[13]=age;r[14]='女性';
 r[15]='漢字あり';r[16]='東京都';r[17]=1;
 return r;
}
function job(id,source,jobName,code,amt,img='img.png',note='一行目\n二行目'){
 const j=Array(20).fill('');
 j[0]=id;j[1]=source;j[2]='001';j[3]=id;
 j[5]=jobName;j[6]='事務';j[7]='正社員';j[8]='増員';
 j[9]='東京支店';j[10]='東京都';j[11]=note;
 j[12]=code;j[13]=amt;j[14]=img;j[15]=3;j[16]=0;
 j[18]=7;j[19]=670;
 return j;
}
const jobs=[
 job('J1','JOB_CSV','配送スタッフ','1',1200),
 job('J2','JOB_CSV','事務スタッフ','3',300000,''),
 job('J3','APPLICATION_EMBEDDED','配送補助','',0),
];
const apps=[
 app('A1','J1','Indeed',24,1,1,'2026-10-01'),
 app('A2','J1','Indeed',38,1,1,'2026-10-02'),
 app('A3','J2','自社',31,1,1,'2026-10-02'),
 app('A4','J2','自社','',1,1,'2026-10-02'),
 app('A5','J3','Indeed',31,0,1,'2026-10-03'),
 app('A6','','自社',22,0,1,'2026-10-03')
];
const enabled=new Map(core.VAS_CUSTOM_AXES_.map(([,id])=>[id,true]));
enabled.set('enterprise',true);
const choices=core.vasCustomAxisChoices_(apps,jobs,masters,enabled);
assert.equal(core.VAS_CUSTOM_AXES_.length,30);
assert.equal(new Set(core.VAS_CUSTOM_AXES_.map(x=>x[0])).size,30);
assert.equal(choices.includes('応募年月'),true);
assert.equal(choices.includes('給与区分'),true);
assert.equal(choices.includes('時給下限'),true);
assert.equal(choices.includes('月給下限'),true);
assert.equal(choices.includes('年収下限'),false);
assert.equal(choices.includes('求人備考1行目'),true);
assert.equal(choices.includes('仕事名KW'),true);
assert.equal(choices.includes('TOP画像ファイル名'),true);
const options={masters,choices,settings:{
 targetMin:20,targetMax:34,monthDayWidth:7,hourWidth:6,
 hourlySalaryWidth:50,monthlySalaryWidth:50000
}};
const all=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体'],colAxis:'応募年月',metric:'ターゲット率'
});
assert.equal(all.scope,'application');
assert.equal(all.used,6);
assert.deepEqual(all.headers,['応募媒体','','','行合計','2026-10']);
assert.equal(all.grand.count,6);
assert.equal(all.grand.target,4);
assert.equal(all.totals[3],4/6);
const indeed=all.rows.find(r=>r[0]==='Indeed');
const own=all.rows.find(r=>r[0]==='自社');
assert.equal(indeed[3],2/3);
assert.equal(own[3],2/3);
const pivot=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体','仕事名KW'],
 colAxis:'応募年月',metric:'応募数'
});
assert.equal(pivot.scope,'jobAnalysis');
assert.equal(pivot.used,5);
assert.equal(pivot.headers.length,5);
assert.equal(pivot.rows.length,3);
assert.equal(pivot.rows.some(r=>r[0]==='Indeed'&&r[1]==='配送'),true);
const matched=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体','給与区分'],
 colAxis:'応募年月',metric:'ターゲット応募数'
});
assert.equal(matched.scope,'jobCsv');
assert.equal(matched.used,4);
assert.equal(matched.grand.target,2);
assert.equal(matched.rows.find(r=>r[1]==='時給')[3],1);
assert.equal(matched.rows.find(r=>r[1]==='月給')[3],1);
const wage=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['時給下限'],colAxis:'応募媒体',
 metric:'ターゲット率'
});
assert.equal(wage.used,2);
assert.equal(wage.rows[0][0],'1,200-1,249円');
assert.equal(wage.rows[0][3],0.5);
const onlyPeriod=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体'],colAxis:'応募年月',
 metric:'応募数',settings:{start:'2026-10-02',end:'2026-10-02'}
});
assert.equal(onlyPeriod.used,3);
const none=core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体'],colAxis:'応募年月',metric:'応募数',
 settings:{start:'2027-01-01',end:'2027-12-31'}
});
assert.equal(none.used,0);
assert.equal(none.rows.length,0);
assert.equal(none.headers.length,4);
assert.throws(()=>core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募年月'],colAxis:'応募年月'
}),/同じ分析軸/);
assert.throws(()=>core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['応募媒体','対応状況','応募年月','性別'],
 colAxis:'勤務地都道府県'
}),/1～3個/);
assert.throws(()=>core.vasCustomCalculate_(apps,jobs,{
 ...options,rowAxes:['時給下限'],colAxis:'年収下限'
}),/選択できない/);
const noJobChoices=core.vasCustomAxisChoices_(
 [app('Z1','', '自社',20,0)],[],masters,enabled);
assert.equal(noJobChoices.includes('職種'),false);
assert.equal(noJobChoices.includes('給与区分'),false);
assert.equal(noJobChoices.includes('応募媒体'),true);
const off=new Map(enabled);
off.set('hourly-salary',false);off.set('monthly-salary',false);
const noSalary=core.vasCustomAxisChoices_(apps,jobs,masters,off);
assert.equal(noSalary.includes('給与区分'),false);
assert.equal(noSalary.includes('時給下限'),false);
// Explicitly test a 120-column pivot: never truncate at Web's 100 columns.
const wideApps=Array.from({length:120},(_,i)=>{
 const r=app('W'+i,'', '媒体'+String(i).padStart(3,'0'),25,0);
 r[12]='媒体'+String(i).padStart(3,'0');return r;
});
const wide=core.vasCustomCalculate_(wideApps,[],{
 rowAxes:['応募年月'],colAxis:'応募媒体',metric:'応募数',
 choices:['応募年月','応募媒体'],settings:{}
});
assert.equal(wide.columnLabels.length,120);
assert.equal(wide.numCols,124);
assert.equal(wide.rows.length,1);
assert.equal(wide.rows[0].slice(4).reduce((a,b)=>a+b,0),120);
console.log('30-axis eligibility, application/job scopes, salary mismatch, target-rate denominators, 120 columns and empty results passed.');
