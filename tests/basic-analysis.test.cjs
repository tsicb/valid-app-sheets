'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=['gas/00_Config.gs','gas/06_BasicCore.gs'].map(p=>
  fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')).join('\n');
const ctx=new Function('Utilities',src+'\nreturn {vasCalculateBasic_,vasParseSettings_};')({
  formatDate:()=>{throw Error('unexpected Date in fixture');}
});
const job=[
 'J1','JOB_CSV','001','JOB-A','101','求人','事務','正社員','増員','東京支社',
 '東京都','求人備考1行目\n備考2行目','3',250000,'main.png',3,0,'A::B',2,450
];
function row(id,age,date,media,jobRef){
 const a=Array(23).fill('');
 a[0]=id;a[1]='001';a[2]='JOB-A';a[3]=jobRef;a[5]=date;
 a[6]=date.slice(0,7);a[10]=1;a[11]='応募';a[12]=media;
 a[13]=age;a[14]='女性';a[18]='事務';a[19]='正社員';
 return a;
}
const data=[
 row('A1',24,'2026-10-01','Indeed','J1'),
 row('A2',31,'2026-10-02','Indeed','J1'),
 row('A3',46,'2026-10-03','自社','J1'),
 row('A4','', '2026-09-23','Indeed','J1')
];
const result=ctx.vasCalculateBasic_(data,[job],{
 start:'2026-10-01',end:'2026-10-31',
 ageMin:null,ageMax:null,targetMin:20,targetMax:39
});
assert.equal(result.total,3);
assert.equal(result.targetTotal,2);
assert.equal(result.rows.every(r=>r.length===13),true);
const media=result.rows.filter(r=>r[0]==='media');
assert.equal(media.length,2);
assert.deepEqual(media.find(r=>r[1]==='Indeed').slice(2,5),[2,2,1]);
assert.equal(media.find(r=>r[1]==='Indeed')[6],1);
assert.equal(media.find(r=>r[1]==='Indeed')[7],1);
assert.equal(result.rows.find(r=>r[0]==='note-detail')[1],'求人備考1行目');
const ageFiltered=ctx.vasCalculateBasic_(data,[job],{
 ageMin:30,ageMax:39,targetMin:30,targetMax:39
});
assert.equal(ageFiltered.total,1);
assert.equal(ageFiltered.targetTotal,1);
assert.throws(()=>ctx.vasCalculateBasic_(data,[job],{start:'2026-12-01',end:'2026-01-01'}));
// Web parity: unknown ages are NEVER targets, even if age limits are blank.
const allAges=ctx.vasCalculateBasic_(data,[job],{
 ageMin:null,ageMax:null,targetMin:null,targetMax:null
});
assert.equal(allAges.total,4);
assert.equal(allAges.targetTotal,3);
assert.equal(allAges.rows.find(r=>r[0]==='age'&&r[1]==='その他')[3],0);

// Match the Web version's day-of-month and hour buckets.
const timed=data.slice(0,3).map((r,i)=>{
 const x=r.slice();x[7]=[1,8,31][i];x[9]=[0,7,23][i];return x;
});
const bucketed=ctx.vasCalculateBasic_(timed,[job],{
 monthDayWidth:7,hourWidth:6
});
const dayLabels=bucketed.rows.filter(r=>r[0]==='month-day').map(r=>r[1]);
const hourLabels=bucketed.rows.filter(r=>r[0]==='hour').map(r=>r[1]);
assert.deepEqual(dayLabels.sort(),['1-7日','8-14日','29-31日'].sort());
assert.deepEqual(hourLabels.sort(),['0～5時台','6～11時台','18～23時台'].sort());
const widthInput={
 B5:'',B6:'',B9:'',B10:'',B13:25,B14:39,B17:10,B18:3
};
const parsed=ctx.vasParseSettings_(widthInput);
assert.equal(parsed.monthDayWidth,10);
assert.equal(parsed.hourWidth,3);
assert.equal(parsed.targetMin,25);
assert.throws(()=>ctx.vasParseSettings_({...widthInput,B17:-1}));
console.log('Basic analysis group counts, age target handling, and Web day/hour buckets passed.');
