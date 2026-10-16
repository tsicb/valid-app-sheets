'use strict';
// Extended basic axes: Web definition parity, with no CSV reimport.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=['gas/00_Config.gs','gas/06_BasicCore.gs']
  .map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
const context=new Function('Utilities',src+  '\nreturn {VAS_BASIC_AXES_,VAS_DISPLAY_ITEMS,vasExtractBasicMasters_,vasCalculateBasic_,vasParseSettings_};')({
  formatDate:()=>{throw Error('No Date fixtures');}
});
const masterRows=[
  ['物流',true,'','','001','第一物流株式会社',true],
  ['配送',true,'','','002','第二物流株式会社',true],
  ['物流',true,'duplicate','','003','無効',false],
  ['倉庫',false,'','','004','無効',false]
];
const masters=context.vasExtractBasicMasters_(masterRows);
assert.deepEqual(masters.keywords,['物流','配送']);
assert.deepEqual(masters.enterprises,[['001','第一物流株式会社'],['002','第二物流株式会社']]);
function job(ref,code,amount,source='JOB_CSV',title='物流配送スタッフ'){
 const j=Array(20).fill('');
 j[0]=ref;j[1]=source;j[2]='001';j[5]=title;
 j[12]=code;j[13]=amount;j[14]='main.png';j[15]=3;
 j[16]=1;j[18]=7;j[19]=650;j[11]='給付制度あり\n追記';
 return j;
}
function app(ref,id,matched=1,age=28){
 const r=Array(23).fill('');
 r[0]=id;r[1]='001';r[2]='DEMO';r[3]=ref;r[4]=matched;
 r[5]='2026-10-16';r[6]='2026-10';r[7]=16;r[8]='金';r[9]=10;
 r[10]=1;r[11]='応募';r[12]='Indeed';r[13]=age;
 return r;
}
const j1=job('J1','1',1250);
const j2=job('J2','2',12000);
const j3=job('J3','3',300000);
const j4=job('J4','4',5000000); // 年俸 is not the 年収 bucket
const j5=job('J5','5',5500000);
const j6=job('J6','1',''); // missing hourly lower bound
const j7=job('J7','3',250000,'APPLICATION_EMBEDDED');
const a=[
 app('J1','A1'),app('J2','A2'),app('J3','A3'),
 app('J4','A4'),app('J5','A5'),app('J6','A6'),
 app('J7','A7',0),app('','A8',0)
];
const settings={hourlySalaryWidth:50,dailySalaryWidth:1000,
 monthlySalaryWidth:50000,annualSalaryWidth:500000,
 textWidth:300,imageCountWidth:2,tagCountWidth:5,
 masters};
const result=context.vasCalculateBasic_(a,[j1,j2,j3,j4,j5,j6,j7],settings);
const items=result.rows.filter(r=>!['age'].includes(r[0]));
const group=(id,category)=>result.rows.find(r=>r[0]===id&&r[1]===category);
assert.equal(context.VAS_BASIC_AXES_.length,29);
assert.equal(context.VAS_DISPLAY_ITEMS.filter(x=>context.VAS_BASIC_AXES_.some(y=>y[0]===x[0])).length,29);
assert.equal(result.total,8);
assert.equal(result.targetTotal,8);
assert.equal(group('enterprise','第一物流株式会社')[2],8);
assert.equal(group('job-keyword','物流')[2],7);
assert.equal(group('job-full-keyword','物流＋配送')[2],7);
assert.equal(group('hourly-salary','1,250-1,299円')[2],1);
assert.equal(group('hourly-salary','（給与下限なし）')[2],1);
assert.equal(group('daily-salary','12,000-12,999円')[2],1);
assert.equal(group('monthly-salary','300,000-349,999円')[2],1);
assert.equal(group('annual-salary','5,500,000-5,999,999円')[2],1);
assert.equal(result.rows.filter(r=>r[0]==='annual-salary').length,1,
  '年俸 must not be misread as 年収');
assert.equal(group('text-length','600-899文字')[2],6);
assert.equal(group('image-count','2-3枚')[2],6);
assert.equal(group('indeed-tag-count','5-9個')[2],6);
assert.equal(group('main-image','あり')[2],6);
assert.equal(group('note-detail','給付制度あり')[2],7);

// Disable the job CSV match flag; numeric job-only axes must disappear.
const unmatched=context.vasCalculateBasic_([app('J1','X',0)],[j1],{masters});
assert.equal(unmatched.total,1);
assert.equal(unmatched.rows.some(r=>r[0]==='hourly-salary'),false);
assert.equal(unmatched.rows.some(r=>r[0]==='text-length'),false);
assert.equal(unmatched.rows.some(r=>r[0]==='job-keyword'),true);

// With no KW or enterprise display master, these axes must not be selectable.
const noMasters=context.vasCalculateBasic_([app('J1','Y')],[j1],{});
assert.equal(noMasters.rows.some(r=>r[0]==='job-keyword'),false);
assert.equal(noMasters.rows.some(r=>r[0]==='enterprise'),false);
const emptyCodes=context.vasCalculateBasic_([app('J1','Z')],[
 job('J1','1',0)
],{});
assert.equal(group('hourly-salary','（給与下限なし）')[2],1);
assert.equal(emptyCodes.rows.find(r=>r[0]==='hourly-salary')[1],'（給与下限なし）');

const inputs={B5:'',B6:'',B9:'',B10:'',B13:'',B14:'',
 B17:7,B18:6,B19:50,B20:1000,B21:50000,B22:500000,
 B23:300,B24:2,B25:5};
const options=context.vasParseSettings_(inputs);
assert.equal(options.imageCountWidth,2);
assert.equal(options.tagCountWidth,5);
assert.throws(()=>context.vasParseSettings_({...inputs,B22:0}));
console.log('All nine new axes, salary code buckets, KW masters, matching source guards and widths passed.');
