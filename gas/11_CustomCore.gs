/**
 * Custom pivot v0.1 — explicit execution, no CSV reimport.
 * 30 axes and data scopes from valid-app/analysis-core.js and
 * valid-app/docs/ANALYSIS_AXIS_AVAILABILITY.md.
 * Public functions below are pure and Node-testable.
 */
const VAS_CUSTOM_AXES_=Object.freeze([
 ['対応状況','status','application'],
 ['応募年月','month','application'],
 ['応募媒体','media','application'],
 ['性別','gender','application'],
 ['氏名文字種区分','name-script','application'],
 ['居住都道府県','residence','application'],
 ['企業ID','enterprise','application'],
 ['職種','job-category','jobAnalysis'],
 ['雇用形態','employment','jobAnalysis'],
 ['求人勤務地名称','job-location-name','jobAnalysis'],
 ['勤務地都道府県','job-prefecture','jobAnalysis'],
 ['勤務地・居住都道府県一致','prefecture-match','application'],
 ['仕事名KW','job-keyword','jobAnalysis'],
 ['仕事名フルKW','job-full-keyword','jobAnalysis'],
 ['募集背景','recruit-background','jobAnalysis'],
 ['月内応募日','month-day','application'],
 ['応募曜日','weekday','application'],
 ['応募時間帯','hour','application'],
 ['給与区分','salary-type','jobCsv'],
 ['時給下限','hourly-salary','jobCsv'],
 ['日給下限','daily-salary','jobCsv'],
 ['月給下限','monthly-salary','jobCsv'],
 ['年収下限','annual-salary','jobCsv'],
 ['求人原稿文字数','text-length','jobCsv'],
 ['メイン画像有無','main-image','jobCsv'],
 ['求人画像枚数','image-count','jobCsv'],
 ['TOP画像ファイル名','top-image-detail','jobCsv'],
 ['求人動画有無','job-video','jobCsv'],
 ['Indeed求人タグ数','indeed-tag-count','jobCsv'],
 ['求人備考1行目','note-detail','jobAnalysis']
]);
const VAS_CUSTOM_METRICS_=Object.freeze([
 '応募数','ターゲット応募数','ターゲット率'
]);
const VAS_CUSTOM_AXIS_BY_NAME_=new Map(VAS_CUSTOM_AXES_.map(x=>[x[0],x]));
const VAS_CUSTOM_SALARY_IDS_=Object.freeze([
 'hourly-salary','daily-salary','monthly-salary','annual-salary'
]);
function vasCustomIsMatched_(a,j){
 return !!j&&vasStr_(j[1])==='JOB_CSV'&&
   (a[4]===1||a[4]===true||vasStr_(a[4])==='1');
}
function vasCustomCategory_(label,sort){
 return {label:vasStr_(label),sort:
   typeof sort==='number'&&Number.isFinite(sort)?sort:null};
}
function vasCustomNumCategory_(value,width,suffix,empty,oneStyle){
 const n=vasBasicNum_(value);
 if(n===null)return vasCustomCategory_(empty);
 const from=Math.floor(n/width)*width;
 return vasCustomCategory_(oneStyle&&width<=1?
   vasBasicFmt_(from)+suffix:
   vasBasicFmt_(from)+'-'+vasBasicFmt_(from+width-1)+suffix,from);
}
function vasCustomAxisCategory_(a,j,name,opts,masters){
 const option=opts||{};
 const width={
  day:option.monthDayWidth||7,hour:option.hourWidth||6,
  hourly:option.hourlySalaryWidth||50,daily:option.dailySalaryWidth||1000,
  monthly:option.monthlySalaryWidth||50000,
  annual:option.annualSalaryWidth||500000,
  text:option.textWidth||300,
  image:option.imageCountWidth||1,
  tag:option.tagCountWidth||5
 };
 const masters0=masters||{keywords:[],enterprises:[]};
 const str=vasStr_,n=vasBasicNum_,cat=vasCustomCategory_;
 const m=new Map(masters0.enterprises||[]);
 const matched=vasCustomIsMatched_(a,j),available=!!j;
 switch(name){
  case '対応状況':return cat(str(a[11])||'（未設定）');
  case '応募年月':return cat(str(a[6])||'（不明）',
    /^\d{4}-\d{2}$/.test(str(a[6]))?Number(str(a[6]).replace('-','')):null);
  case '応募媒体':return cat(str(a[12])||'（未設定）');
  case '性別':return cat(str(a[14])||'不明');
  case '氏名文字種区分':return cat(str(a[15])||'（不明）');
  case '居住都道府県':return cat(str(a[16])||'（不明）');
  case '企業ID':return cat(m.get(str(a[1]))||str(a[1])||'（企業IDなし）');
  case '月内応募日':{
   const v=n(a[7]);if(v===null||v<1||v>31)return cat('（不明）',9999);
   const first=Math.floor((v-1)/width.day)*width.day+1;
   return cat(first+'-'+Math.min(31,first+width.day-1)+'日',first);
  }
  case '応募曜日':{
   const x=str(a[8])||'（不明）';
   const order=['月','火','水','木','金','土','日','（不明）'];
   return cat(x,order.includes(x)?order.indexOf(x):9999);
  }
  case '応募時間帯':{
   const v=n(a[9]);if(v===null||v<0||v>23)return cat('（不明）',9999);
   const first=Math.floor(v/width.hour)*width.hour;
   return cat(width.hour<=1?first+'時台':first+'～'+
     Math.min(23,first+width.hour-1)+'時台',first);
  }
  case '勤務地・居住都道府県一致':{
   const x=a[17]===''||a[17]==null?'（不明）':
     (a[17]===1||a[17]===true||str(a[17])==='1'?'一致':'不一致');
   return cat(x,['一致','不一致','（不明）'].indexOf(x));
  }
 }
 if(!available)return null;
 switch(name){
  case '職種':return cat(str(j[6])||'（未設定）');
  case '雇用形態':return cat(str(j[7])||'（未設定）');
  case '求人勤務地名称':return cat(str(j[9])||'（未設定）');
  case '勤務地都道府県':return cat(str(j[10])||'（未設定）');
  case '募集背景':return cat(str(j[8])||'（未設定）');
  case '仕事名KW':case '仕事名フルKW':{
   const [one,full]=vasMatchBasicKeywords_(j[5],masters0.keywords||[]);
   return cat(name==='仕事名KW'?one:full);
  }
  case '求人備考1行目':{
   const note=str(j[11]).split(/\r?\n|<br\s*\/?>/i)[0];
   return cat(note||'（求人備考なし）');
  }
 }
 if(!matched)return null;
 const salary=VAS_SALARY_TYPE_MAP_[str(j[12])]||str(j[12]);
 if(name==='給与区分')return cat(salary||'（未設定）');
 const salaryDefs={
  '時給下限':['時給',width.hourly],
  '日給下限':['日給',width.daily],
  '月給下限':['月給',width.monthly],
  '年収下限':['年収',width.annual]
 };
 if(Object.prototype.hasOwnProperty.call(salaryDefs,name)){
  const [required,w]=salaryDefs[name];
  if(salary!==required)return null;
  const val=n(j[13]);
  return val===null||val<=0?cat('（給与下限なし）',999999999999):
    vasCustomNumCategory_(val,w,'円','（給与下限なし）');
 }
 switch(name){
  case '求人原稿文字数':
   return vasCustomNumCategory_(j[19],width.text,'文字','（文字数なし）');
  case 'メイン画像有無':{
   const has=!!str(j[14]);return cat(has?'あり':'なし',has?0:1);
  }
  case '求人画像枚数':
   return vasCustomNumCategory_(n(j[15])??0,width.image,'枚','',true);
  case 'TOP画像ファイル名':
   return cat(str(j[14])||'（TOP画像なし）');
  case '求人動画有無':{
   const has=j[16]===true||n(j[16])===1;
   return cat(has?'あり':'なし',has?0:1);
  }
  case 'Indeed求人タグ数':
   return vasCustomNumCategory_(n(j[18])??0,width.tag,'個','');
 }
 return null;
}
function vasCustomCapabilities_(apps,jobs,masters,enabled){
 const linked=new Map((jobs||[]).map(r=>[vasStr_(r[0]),r]));
 const usedJobs=new Set(),csvJobs=new Set();
 const available=new Set();
 const data=(apps||[]).filter(a=>(vasBasicNum_(a[10])||0)>0);
 if(data.length){
  ['status','month','media','gender','name-script','residence',
   'month-day','weekday','hour'].forEach(id=>available.add(id));
  if((masters.enterprises||[]).length)available.add('enterprise');
  if(data.some(a=>a[17]!==''&&a[17]!=null))available.add('prefecture-match');
 }
 for(const a of data){
  const j=linked.get(vasStr_(a[3]));
  if(!j)continue;
  usedJobs.add(j);
  if(vasCustomIsMatched_(a,j))csvJobs.add(j);
 }
 const jobFields=[
  ['job-category',6],['employment',7],['job-location-name',9],
  ['job-prefecture',10],['recruit-background',8],['note-detail',11]
 ];
 for(const [id,i] of jobFields)
  if([...usedJobs].some(j=>vasStr_(j[i])))available.add(id);
 if((masters.keywords||[]).length&&[...usedJobs].some(j=>vasStr_(j[5]))){
  available.add('job-keyword');available.add('job-full-keyword');
 }
 if(csvJobs.size){
  const numeric=['main-image','image-count','job-video','indeed-tag-count'];
  numeric.forEach(id=>available.add(id));
  if([...csvJobs].some(j=>vasStr_(j[14])))available.add('top-image-detail');
  if([...csvJobs].some(j=>vasBasicNum_(j[19])!==null))available.add('text-length');
  const salaries=[...csvJobs].map(j=>VAS_SALARY_TYPE_MAP_[vasStr_(j[12])]||vasStr_(j[12]));
  const types=[['hourly-salary','時給'],['daily-salary','日給'],
   ['monthly-salary','月給'],['annual-salary','年収']];
  for(const [id,salary] of types)if(salaries.includes(salary))available.add(id);
  if(salaries.some(Boolean)&&VAS_CUSTOM_SALARY_IDS_.some(id=>
      available.has(id)&&enabled.get(id)!==false))
   available.add('salary-type');
 }
 return available;
}
function vasCustomAxisChoices_(apps,jobs,masters,enabled){
 const capabilities=vasCustomCapabilities_(apps,jobs,masters,enabled);
 return VAS_CUSTOM_AXES_.filter(([name,id])=>
    capabilities.has(id)&&
    (id==='salary-type'||enabled.get(id)===true)).map(r=>r[0]);
}
function vasCustomSorted_(one,two){
 const x=one.sort,y=two.sort;
 if(x!==null&&y!==null&&x!==y)return x-y;
 if(x!==null&&y===null)return -1;
 if(x===null&&y!==null)return 1;
 return one.label.localeCompare(two.label,'ja',{numeric:true,sensitivity:'base'});
}
function vasCustomMetric_(m,metric){
 return metric==='応募数'?m.count:
   metric==='ターゲット応募数'?m.target:
   m.count?m.target/m.count:0;
}
function vasCustomCombine_(m,count,target){
 m.count+=count;m.target+=target;
}
function vasCustomNewMetric_(){return {count:0,target:0};}
/**
 * Output: headers [rowAxis1,rowAxis2,rowAxis3,rowTotal,...col categories],
 * rows include all observed row combinations and one totals row.
 * Numerators and denominators are accumulated separately before ratios.
 */
function vasCustomCalculate_(apps,jobs,options) {
 const opts=options||{};
 const rowAxes=(opts.rowAxes||[]).map(vasStr_).filter(Boolean);
 const colAxis=vasStr_(opts.colAxis),metric=vasStr_(opts.metric)||'応募数';
 if(!rowAxes.length||rowAxes.length>3||!colAxis)
  throw new Error('行軸を1～3個、列軸を1個指定してください。');
 if(new Set([...rowAxes,colAxis]).size!==rowAxes.length+1)
  throw new Error('行軸・列軸に同じ分析軸は使用できません。');
 if(!VAS_CUSTOM_METRICS_.includes(metric))throw new Error('表示指標が不正です。');
 for(const id of [...rowAxes,colAxis])
  if(!VAS_CUSTOM_AXIS_BY_NAME_.has(id))
    throw new Error('未定義の分析軸です：'+id);
 const chosen=opts.choices||[];
 for(const id of [...rowAxes,colAxis])
  if(!chosen.includes(id))throw new Error('選択できない分析軸です：'+id+
    '。表示設定とデータの取得状況をご確認ください。');
 const scope=[...rowAxes,colAxis].map(id=>VAS_CUSTOM_AXIS_BY_NAME_.get(id)[2])
  .includes('jobCsv')?'jobCsv':
   [...rowAxes,colAxis].map(id=>VAS_CUSTOM_AXIS_BY_NAME_.get(id)[2])
    .includes('jobAnalysis')?'jobAnalysis':'application';
 const jobsMap=new Map((jobs||[]).map(r=>[vasStr_(r[0]),r]));
 const sources=new Map(),cols=new Map(),cells=new Map();
 const rowTotals=new Map(),colTotals=new Map(),grand=vasCustomNewMetric_();
 const p=opts.settings||{},masters=opts.masters||{keywords:[],enterprises:[]};
 const isInPeriod=a=>{
  const date=vasDateKey_(a[5]);
  if(p.start&&(!date||date<p.start)||p.end&&(!date||date>p.end))return false;
  const age=vasBasicNum_(a[13]);
  return !((p.ageMin!=null&&(age===null||age<p.ageMin))||
   (p.ageMax!=null&&(age===null||age>p.ageMax)));
 };
 for(const a of apps||[]){
  if(!isInPeriod(a))continue;
  const count=vasBasicNum_(a[10])||0;
  if(count<=0)continue;
  const j=jobsMap.get(vasStr_(a[3]))||null;
  if(scope==='jobAnalysis'&&!j)continue;
  if(scope==='jobCsv'&&!vasCustomIsMatched_(a,j))continue;
  const rc=rowAxes.map(name=>vasCustomAxisCategory_(a,j,name,p,masters));
  const cc=vasCustomAxisCategory_(a,j,colAxis,p,masters);
  if(rc.some(v=>!v)||!cc)continue; // salary type mismatch etc.
  const labelArray=rc.map(x=>x.label);
  const key=JSON.stringify(labelArray),clabel=cc.label;
  const age=vasBasicNum_(a[13]);
  const target=age!==null&&(p.targetMin==null||age>=p.targetMin)&&
   (p.targetMax==null||age<=p.targetMax)?count:0;
  if(!sources.has(key))sources.set(key,rc);
  if(!cols.has(clabel))cols.set(clabel,cc);
  if(!cells.has(key))cells.set(key,new Map());
  const cellMap=cells.get(key);
  if(!cellMap.has(clabel))cellMap.set(clabel,vasCustomNewMetric_());
  if(!rowTotals.has(key))rowTotals.set(key,vasCustomNewMetric_());
  if(!colTotals.has(clabel))colTotals.set(clabel,vasCustomNewMetric_());
  vasCustomCombine_(cellMap.get(clabel),count,target);
  vasCustomCombine_(rowTotals.get(key),count,target);
  vasCustomCombine_(colTotals.get(clabel),count,target);
  vasCustomCombine_(grand,count,target);
 }
 const sortedRows=[...sources].sort((a,b)=>{
  for(let i=0;i<a[1].length;i++){
   const diff=vasCustomSorted_(a[1][i],b[1][i]);
   if(diff)return diff;
  }
  return rowTotals.get(b[0]).count-rowTotals.get(a[0]).count;
 }).map(([key,cats])=>({key,labels:cats.map(x=>x.label)}));
 const sortedCols=[...cols].sort((a,b)=>{
  const hasSort=a[1].sort!==null||b[1].sort!==null;
  if(hasSort)return vasCustomSorted_(a[1],b[1]);
  return colTotals.get(b[0]).count-colTotals.get(a[0]).count||
   vasCustomSorted_(a[1],b[1]);
 }).map(([label])=>label);
 const values=sortedRows.map(r=>[
  ...Array.from({length:3},(_,i)=>r.labels[i]||''),
  vasCustomMetric_(rowTotals.get(r.key),metric),
  ...sortedCols.map(label=>
   vasCustomMetric_(cells.get(r.key).get(label)||vasCustomNewMetric_(),metric))
 ]);
 const totals=['列合計','','',vasCustomMetric_(grand,metric),
  ...sortedCols.map(label=>vasCustomMetric_(colTotals.get(label),metric))];
 return {
  rowAxes,colAxis,metric,scope,used:grand.count,
  headers:[...Array.from({length:3},(_,i)=>rowAxes[i]||''),'行合計',...sortedCols],
  columnLabels:sortedCols,rowLabels:sortedRows.map(x=>x.labels),
  rows:values,totals,grand,
  numRows:values.length+2,numCols:4+sortedCols.length
 };
}
