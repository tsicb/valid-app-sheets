'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=['gas/00_Config.gs','gas/06_BasicCore.gs','gas/09_ProgressCore.gs']
  .map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('\n');
const P=new Function('Utilities',source+
  '\nreturn {vasProgressCalculate_,vasProgressSettings_,vasProgressChartFormulas_:typeof vasProgressChartFormulas_ === "function" ? vasProgressChartFormulas_:null};'
)({formatDate:()=>{throw Error('Date objects not expected here');}});
function app(day,age,score=1){
 const a=Array(23).fill('');
 a[0]='ROW-'+day;a[5]=day;a[6]=day.slice(0,7);
 a[10]=score;a[13]=age;
 return a;
}
const rows=[
 app('2026-09-01',24,1),
 app('2026-09-15',34,2),
 app('2026-09-30',44,1),
 app('2026-10-01',24,1),
 app('2026-10-02',24,2),
 app('2026-10-10',35,1),
 app('2026-10-16',44,1),
 app('2026-10-16','',1)
];
const options={
 start:'2026-09-01',end:'2026-10-31',
 ageMin:20,ageMax:39,targetMin:20,targetMax:29
};
const result=P.vasProgressCalculate_(rows,options);
assert.equal(result.visible,true);
assert.equal(result.latestDate,'2026-10-16',
  'Latest observed day is based on raw valid-date rows, even if age excluded');
assert.equal(result.latestMonth,'2026-10');
assert.equal(result.actual,4);
assert.equal(result.observedDayCount,16);
assert.equal(result.projected,7.8);
assert.equal(result.cacheRows.length,31);
assert.equal(result.cacheRows[0].length,10);
assert.equal(result.cacheRows[0][1],1);
assert.equal(result.cacheRows[1][1],2);
assert.equal(result.cacheRows[15][1],null===0?0:0);
assert.equal(result.cacheRows[15][2],4);
assert.equal(result.cacheRows[15][3],4);
assert.equal(result.cacheRows[30][2],null);
assert.equal(result.cacheRows[30][3],7.8);
assert.equal(result.comparisons[0].enabled,true);
assert.equal(result.comparisons[0].month,'2026-09');
assert.equal(result.comparisons[0].sameDay,3);
assert.equal(result.comparisons[1].enabled,false);
assert.equal(result.comparisons[2].enabled,false);
assert.deepEqual(result.monthlyRows,[
 ['2026-10',4,3,0.75],
 ['2026-09',3,1,1/3]
]);
const day2=P.vasProgressCalculate_(rows,{
 ...options,start:'2026-10-08',end:'2026-10-31'
});
assert.equal(day2.latestDay,16);
assert.equal(day2.observedDayCount,9);
assert.equal(day2.actual,1);
assert.equal(day2.projected,3.4);
assert.equal(day2.cacheRows[0][1],null);
assert.equal(day2.cacheRows[7][1],0);
assert.equal(day2.comparisons[0].enabled,false);
// Midnight / invalid dates and 0-count rows are not part of the timeline.
const invalid=P.vasProgressCalculate_([
 app('2026-02-29',25),app('nonsense',25),app('2026-02-28',25,0)
],{});
assert.equal(invalid.visible,false);
// Leap year and end-of-month conditions.
const leap=P.vasProgressCalculate_([app('2024-02-29',31)],{});
assert.equal(leap.daysInMonth,29);
assert.equal(leap.projected,null);
assert.equal(leap.cacheRows[28][1],1);
assert.equal(leap.cacheRows[29][1],null);
// Non-overlapping date filter cannot leak future or past comparisons.
const only=P.vasProgressCalculate_([app('2026-10-16',25)],{
 start:'2026-10-01',end:'2026-10-31'
});
assert.equal(only.comparisons.every(x=>!x.enabled),true);
// Applicant totals and target-age subtotal use the same filtered records.
const unknown=P.vasProgressCalculate_([
 app('2026-10-01',''),app('2026-10-02',19),app('2026-10-03',25)
],{});
assert.equal(unknown.actual,3);
assert.deepEqual(unknown.monthlyRows,[['2026-10',3,2,2/3]]);
const settings={getRange:()=>({
 getValues:()=>[['累積'],[true],[3]]
})};
assert.deepEqual(P.vasProgressSettings_(settings),{
 mode:'累積',forecast:true,comparisons:3
});
assert.throws(()=>P.vasProgressSettings_({
 getRange:()=>({getValues:()=>[['日別'],[false],[4]]})
}),/1～3/);
console.log('Progress daily/cumulative, projection, comparisons, age filtering, leap day and monthly totals passed.');
