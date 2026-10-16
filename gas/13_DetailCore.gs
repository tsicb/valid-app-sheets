/**
 * Image and Indeed-tag detail analyses. Aggregates only application records
 * matched against JOB_CSV, with unique job references per category.
 * Stateless, testable, and independent of the image URL lookup process.
 */
const VAS_DETAIL_NO_IMAGE_='（TOP画像なし）';
const VAS_DETAIL_NO_TAG_='（タグなし）';
function vasDetailSplitTags_(value){
 return [...new Set(vasStr_(value).split('::').map(vasStr_).filter(Boolean))];
}
function vasDetailTagMaster_(rows){
 const names=new Map(),duplicates=[];
 for(const row of rows||[]){
  const id=vasStr_(row[0]),name=vasStr_(row[1]),active=row[2]===true;
  if(!id||!name||!active)continue;
  if(names.has(id))duplicates.push(id);
  if(!names.has(id))names.set(id,name);
 }
 if(duplicates.length)throw new Error('Indeedタグ名称マスタに同一コードの重複があります。コードを確認してください：'+duplicates.slice(0,5).join(', '));
 return names;
}
function vasDetailGroup_ (map,key,name){
 if(!map.has(key))map.set(key,{
  key,name,total:0,target:0,ages:Array(8).fill(0),jobs:new Set()
 });
 return map.get(key);
}
function vasDetailAdd_(group,ref,count,target,ageIndex){
 group.total+=count;
 group.target+=target;
 group.ages[ageIndex]+=count;
 if(ref)group.jobs.add(ref);
}
/** The job master is not a source of additional applicant counts. */
function vasDetailCalculate_(applications,jobs,options,tagNames){
 const opts=options||{},tagLabels=tagNames||new Map();
 if(opts.start&&opts.end&&opts.start>opts.end)
  throw new Error('集計開始日が集計終了日より後です。');
 const map=new Map((jobs||[]).map(j=>[vasStr_(j[0]),j]));
 const imageGroups=new Map(),tagGroups=new Map();
 let totalMatched=0,targetMatched=0,seenTags=false,seenImages=false;
 for(const a of applications||[]){
  const date=vasDateKey_(a[5]);
  if(opts.start&&(!date||date<opts.start))continue;
  if(opts.end&&(!date||date>opts.end))continue;
  const age=vasBasicNum_(a[13]);
  if(opts.ageMin!=null&&(age===null||age<opts.ageMin))continue;
  if(opts.ageMax!=null&&(age===null||age>opts.ageMax))continue;
  const count=vasBasicNum_(a[10])||0;
  if(count<=0)continue;
  const ref=vasStr_(a[3]),j=map.get(ref);
  if(!j||vasStr_(j[1])!=='JOB_CSV'||
      !(a[4]===1||a[4]===true||vasStr_(a[4])==='1'))continue;
  const target=age!==null&&(opts.targetMin==null||age>=opts.targetMin)&&
    (opts.targetMax==null||age<=opts.targetMax)?count:0;
  const bucket=vasAgeBucket_(a[13]);
  totalMatched+=count;targetMatched+=target;
  const fileName=vasStr_(j[14]);
  if(fileName)seenImages=true;
  vasDetailAdd_(vasDetailGroup_(
    imageGroups,fileName||VAS_DETAIL_NO_IMAGE_,
    fileName||VAS_DETAIL_NO_IMAGE_),ref,count,target,bucket);
  const codes=vasDetailSplitTags_(j[17]);
  if(codes.length)seenTags=true;
  for(const code of codes.length?codes:[VAS_DETAIL_NO_TAG_]){
   const label=code===VAS_DETAIL_NO_TAG_?VAS_DETAIL_NO_TAG_:
     (tagLabels.get(code)||code+'（名称未登録）');
   vasDetailAdd_(vasDetailGroup_(tagGroups,code,label),
    ref,count,target,bucket);
  }
 }
 const sort=(groups,noValue)=>{
  const values=[...groups.values()];
  const real=values.filter(x=>x.key!==noValue);
  real.sort((a,b)=>b.target-a.target||b.total-a.total||
    a.name.localeCompare(b.name,'ja'));
  const missing=groups.get(noValue);
  if(missing)real.push(missing);
  return real;
 };
 const format=(groups,kind)=>groups.map(g=>({
  key:g.key,label:g.name,jobCount:g.jobs.size,
  total:g.total,target:g.target,rate:g.total?g.target/g.total:0,
  ages:g.ages.slice(),noValue:g.key===(kind==='image'?VAS_DETAIL_NO_IMAGE_:VAS_DETAIL_NO_TAG_)
 }));
 return {
  baseTotal:totalMatched,baseTarget:targetMatched,
  images:format(sort(imageGroups,VAS_DETAIL_NO_IMAGE_),'image'),
  tags:format(sort(tagGroups,VAS_DETAIL_NO_TAG_),'tag'),
  hasRealImages:seenImages,hasRealTags:seenTags
 };
}
