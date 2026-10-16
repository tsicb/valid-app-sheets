'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const files=['gas/00_Config.gs','gas/06_BasicCore.gs','gas/13_DetailCore.gs'];
const src=files.map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('\n');
const x=new Function('Utilities',src+
 '\nreturn {vasDetailCalculate_,vasDetailSplitTags_,vasDetailTagMaster_};')({
 formatDate:()=>{throw Error('Unexpected real Date');}
});
function job(id,file,tags,source='JOB_CSV'){
 const row=Array(20).fill('');
 row[0]=id;row[1]=source;row[14]=file;row[17]=tags;return row;
}
function app(id,ref,age,count=1,matched=1,date='2026-10-16'){
 const row=Array(23).fill('');
 row[0]=id;row[3]=ref;row[4]=matched;row[5]=date;row[10]=count;row[13]=age;
 return row;
}
const jobs=[
 job('J1','top1.jpg','A::B::A'),
 job('J2','top2.jpg','B'),
 job('J3','',''),
 job('J4','embedded.jpg','C','APPLICATION_EMBEDDED')
];
const apps=[
 app('1','J1',25),
 app('2','J1',45),
 app('3','J2',32,2),
 app('4','J3',''),
 app('5','J4',25,1,0),
 app('6','',22,1,0)
];
const master=x.vasDetailTagMaster_([
 ['A','物流',true],['B','配送',true],['C','無効',false]
]);
assert.equal(master.size,2);
const a=x.vasDetailCalculate_(apps,jobs,{
 targetMin:20,targetMax:39
},master);
assert.equal(a.baseTotal,5);
assert.equal(a.baseTarget,3);
assert.equal(a.hasRealImages,true);
assert.equal(a.hasRealTags,true);
assert.equal(a.images.length,3);
assert.equal(a.tags.length,3);
const imgs=Object.fromEntries(a.images.map(v=>[v.key,v]));
const tags=Object.fromEntries(a.tags.map(v=>[v.key,v]));
assert.equal(imgs['top1.jpg'].total,2);
assert.equal(imgs['top1.jpg'].target,1);
assert.equal(imgs['top1.jpg'].jobCount,1);
assert.equal(imgs['top2.jpg'].total,2);
assert.equal(imgs['top2.jpg'].target,2);
assert.equal(a.images.at(-1).key,'（TOP画像なし）');
assert.equal(a.images.at(-1).ages[7],1);
assert.equal(tags.A.label,'物流');
assert.equal(tags.A.total,2,'Duplicate tag A must not count twice');
assert.equal(tags.B.total,4,'Each multi-tag applicant counts under B as well');
assert.equal(tags.B.target,3);
assert.equal(tags.B.jobCount,2);
assert.equal(a.tags.at(-1).key,'（タグなし）');
assert.equal(a.tags.reduce((n,r)=>n+r.total,0),7);
assert.equal(tags.A.ages[1],1);
assert.equal(tags.B.ages[2],2);
const period=x.vasDetailCalculate_(apps,jobs,{
 start:'2026-11-01',end:'2026-11-30'
},master);
assert.equal(period.baseTotal,0);
assert.equal(period.images.length,0);
assert.equal(period.tags.length,0);
const filtered=x.vasDetailCalculate_(apps,jobs,{
 ageMin:20,ageMax:35,targetMin:20,targetMax:30
},master);
assert.equal(filtered.baseTotal,3);
assert.equal(filtered.baseTarget,1);
assert.deepEqual(x.vasDetailSplitTags_('::A::A:: B::::'),['A','B']);
assert.throws(()=>x.vasDetailTagMaster_([
 ['X','一',true],['X','二',true]
]),/重複/);
const fallback=x.vasDetailCalculate_([app('9','J1',30)],jobs,{},
 new Map());
assert.equal(fallback.tags.find(g=>g.key==='A').label,'A（名称未登録）');
console.log('TOP image, multiple distinct Indeed tags, target ages, unique job counts, missing groups and master validation passed.');
