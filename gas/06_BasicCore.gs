/**
 * Basic analysis v0.3. Pure aggregation from already-persisted safe data.
 * Equivalent Web definitions: tsicb/valid-app/analysis-core.js
 * matched-only numeric axes always require the applicant CSV's match flag.
 */
const VAS_BASIC_AXES_ = Object.freeze([
  ['age','年代構成'],['status','対応状況別'],['month','応募月別'],
  ['media','応募媒体別'],['enterprise','企業ID別'],['gender','性別ごと'],
  ['name-script','氏名文字種区分別'],['residence','居住都道府県別'],
  ['job-category','職種別'],['employment','雇用形態別'],
  ['job-location-name','求人勤務地名称別'],['job-prefecture','勤務地都道府県別'],
  ['prefecture-match','勤務地・居住都道府県一致別'],
  ['job-keyword','仕事名KW別'],['job-full-keyword','仕事名フルKW別'],
  ['recruit-background','募集背景別'],['month-day','月内応募日別'],
  ['weekday','応募曜日別'],['hour','応募時間帯別'],
  ['hourly-salary','時給下限別'],['daily-salary','日給下限別'],
  ['monthly-salary','月給下限別'],['annual-salary','年収下限別'],
  ['text-length','求人原稿文字数別'],['main-image','メイン画像有無別'],
  ['image-count','求人画像枚数別'],['job-video','求人動画有無別'],
  ['indeed-tag-count','Indeed求人タグ数別'],
  ['note-detail','求人備考1行目別応募傾向']
]);
const VAS_SALARY_TYPE_MAP_ = Object.freeze({
  '1':'時給','2':'日給','3':'月給','4':'年俸','5':'年収',
  '6':'完全歩合制','99':'その他'
});
const VAS_SALARY_AXES_ = Object.freeze({
  'hourly-salary':['時給','hourlySalaryWidth'],
  'daily-salary':['日給','dailySalaryWidth'],
  'monthly-salary':['月給','monthlySalaryWidth'],
  'annual-salary':['年収','annualSalaryWidth']
});
const VAS_BASIC_NUMERIC_AXES_ = Object.freeze([
  'month','month-day','hour','hourly-salary','daily-salary',
  'monthly-salary','annual-salary','text-length','image-count','indeed-tag-count'
]);
const vasStr_ = x => x == null?'':String(x).trim();
const vasBasicNum_ = x => {
  if(x==null||vasStr_(x)==='')return null;
  const n=Number(vasStr_(x).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
};
const vasAgeBucket_ = age => {
  const n=vasBasicNum_(age);
  return n!==null&&n>=10&&n<80?Math.floor(n/10)-1:7;
};
function vasDateKey_(v) {
  if(v instanceof Date)return Utilities.formatDate(v,'Asia/Tokyo','yyyy-MM-dd');
  return vasStr_(v).slice(0,10).replace(/\//g,'-');
}
const vasBasicFmt_ = n => Number(n).toLocaleString('ja-JP');
function vasBasicRange_(value,width,suffix,missing,oneStyle) {
  const n=vasBasicNum_(value);
  if(n===null)return missing;
  const begin=Math.floor(n/width)*width;
  if(oneStyle&&width<=1)return vasBasicFmt_(begin)+suffix;
  return vasBasicFmt_(begin)+'-'+vasBasicFmt_(begin+width-1)+suffix;
}
/** Two Sheets master groups, preserving the user's priority order. */
function vasExtractBasicMasters_(rows) {
  const keywords=[],enterprises=[];
  const seenKW=new Set(),seenCompany=new Set();
  for(const r of rows||[]) {
    const kw=vasStr_(r[0]);
    if(kw&&r[1]===true&&!seenKW.has(kw)) {
      keywords.push(kw);seenKW.add(kw);
    }
    const company=vasStr_(r[4]),label=vasStr_(r[5]);
    if(company&&label&&r[6]===true&&!seenCompany.has(company)) {
      enterprises.push([company,label]);seenCompany.add(company);
    }
  }
  return {keywords,enterprises};
}
function vasMatchBasicKeywords_(title,keywords) {
  const text=vasStr_(title).toLowerCase();
  if(!text||!keywords.length)return ['（該当なし）','（該当なし）'];
  const found=keywords.filter(k=>text.includes(k.toLowerCase()));
  return found.length?[found[0],found.join('＋')]:
    ['（該当なし）','（該当なし）'];
}
function vasBasicGroupSort_(id,left,right) {
  if(VAS_BASIC_NUMERIC_AXES_.includes(id)) {
    const key=v=>{const n=parseInt(v.replace(/,/g,'').replace(/^(?:（)/,''),10);
      return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};
    const n=key(left[0])-key(right[0]);
    if(n)return n;
  }
  const order=id==='age'?VAS_AGE_LABELS:
    id==='weekday'?['月','火','水','木','金','土','日','（不明）']:
    id==='prefecture-match'?['一致','不一致','（不明）']:
    (id==='main-image'||id==='job-video')?['あり','なし']:[];
  if(order.length) {
    const ix=x=>order.indexOf(x)<0?order.length:order.indexOf(x);
    const dif=ix(left[0])-ix(right[0]);
    if(dif)return dif;
  }
  if(!VAS_BASIC_NUMERIC_AXES_.includes(id)&&!order.length) {
    const diff=right[1].count-left[1].count||
      right[1].target-left[1].target;
    if(diff)return diff;
  }
  return left[0].localeCompare(right[0],'ja');
}
function vasCalculateBasic_(applicationRows,jobRows,options) {
  const opts=options||{};
  const jobs=new Map((jobRows||[]).map(r=>[vasStr_(r[0]),r]));
  const start=opts.start||'',end=opts.end||'';
  const ageMin=opts.ageMin,ageMax=opts.ageMax;
  const targetMin=opts.targetMin,targetMax=opts.targetMax;
  const widths={
    monthDayWidth:opts.monthDayWidth||7,
    hourWidth:opts.hourWidth||6,
    hourlySalaryWidth:opts.hourlySalaryWidth||50,
    dailySalaryWidth:opts.dailySalaryWidth||1000,
    monthlySalaryWidth:opts.monthlySalaryWidth||50000,
    annualSalaryWidth:opts.annualSalaryWidth||500000,
    textWidth:opts.textWidth||300,
    imageCountWidth:opts.imageCountWidth||1,
    tagCountWidth:opts.tagCountWidth||5
  };
  if(start&&end&&start>end)throw new Error('集計開始日が終了日より後です。');
  if(ageMin!=null&&ageMax!=null&&ageMin>ageMax)throw new Error('対象年齢範囲が不正です。');
  if(targetMin!=null&&targetMax!=null&&targetMin>targetMax)throw new Error('ターゲット年齢範囲が不正です。');
  for(const [name,w] of Object.entries(widths))
    if(!Number.isInteger(w)||w<1)throw new Error(name+'のバケット幅が不正です。');
  const masters=opts.masters||{keywords:[],enterprises:[]};
  const keywords=masters.keywords||[],companyNames=new Map(masters.enterprises||[]);
  const agg=new Map(VAS_BASIC_AXES_.map(([id])=>[id,new Map()]));
  let total=0,targetTotal=0;
  const available=new Set();
  for(const a of applicationRows||[]) {
    const date=vasDateKey_(a[5]);
    if(start&&(!date||date<start))continue;
    if(end&&(!date||date>end))continue;
    const age=vasBasicNum_(a[13]);
    if((ageMin!=null&&(age===null||age<ageMin))||
       (ageMax!=null&&(age===null||age>ageMax)))continue;
    const count=vasBasicNum_(a[10])||0;
    if(count<=0)continue;
    const target=age!==null&&
      (targetMin==null||age>=targetMin)&&(targetMax==null||age<=targetMax);
    const targetCount=target?count:0,ageIndex=vasAgeBucket_(a[13]);
    total+=count;targetTotal+=targetCount;
    const j=jobs.get(vasStr_(a[3]))||null;
    const jobAvailable=!!j;
    const matched=jobAvailable&&
      (a[4]===true||a[4]===1||vasStr_(a[4])==='1')&&
      vasStr_(j[1])==='JOB_CSV';
    const notes=jobAvailable?vasStr_(j[11]).split(/\r?\n|<br\s*\/?>/i)[0]:'';
    const day=vasBasicNum_(a[7]),hour=vasBasicNum_(a[9]);
    const monthDayStart=day!==null&&Number.isInteger(day)&&day>=1&&day<=31?
      Math.floor((day-1)/widths.monthDayWidth)*widths.monthDayWidth+1:null;
    const hourStart=hour!==null&&Number.isInteger(hour)&&hour>=0&&hour<=23?
      Math.floor(hour/widths.hourWidth)*widths.hourWidth:null;
    const salaryType=jobAvailable?(VAS_SALARY_TYPE_MAP_[vasStr_(j[12])]||vasStr_(j[12])):'';
    const [kwSingle,kwFull]=jobAvailable?vasMatchBasicKeywords_(j[5],keywords):['',''];
    const matchedField=(value,fn)=>matched?fn(value):null;
    const values={
      age:VAS_AGE_LABELS[ageIndex],status:vasStr_(a[11])||'（未設定）',
      month:vasStr_(a[6])||'（不明）',
      media:vasStr_(a[12])||'（未設定）',
      enterprise:companyNames.size?
        (companyNames.get(vasStr_(a[1]))||
          (vasStr_(a[1])?vasStr_(a[1])+'（名称未登録）':'（企業IDなし）')):null,
      gender:vasStr_(a[14])||'不明',
      'name-script':vasStr_(a[15])||'（不明）',
      residence:vasStr_(a[16])||'（不明）',
      'job-category':jobAvailable?(vasStr_(j[6])||'（未設定）'):null,
      employment:jobAvailable?(vasStr_(j[7])||'（未設定）'):null,
      'job-location-name':jobAvailable?(vasStr_(j[9])||'（未設定）'):null,
      'job-prefecture':jobAvailable?(vasStr_(j[10])||'（未設定）'):null,
      'prefecture-match':a[17]===''||a[17]==null?'（不明）':
        (a[17]===true||Number(a[17])===1?'一致':'不一致'),
      'job-keyword':jobAvailable&&keywords.length?kwSingle:null,
      'job-full-keyword':jobAvailable&&keywords.length?kwFull:null,
      'recruit-background':jobAvailable?(vasStr_(j[8])||'（未設定）'):null,
      'month-day':monthDayStart===null?'（不明）':
        monthDayStart+'-'+Math.min(monthDayStart+widths.monthDayWidth-1,31)+'日',
      weekday:vasStr_(a[8])||'（不明）',
      hour:hourStart===null?'（不明）':
        widths.hourWidth<=1?hourStart+'時台':
          hourStart+'～'+Math.min(hourStart+widths.hourWidth-1,23)+'時台',
      'text-length':matchedField(j&&j[19],v=>
        vasBasicRange_(v,widths.textWidth,'文字','（文字数なし）')),
      'main-image':matched?(vasStr_(j[14])?'あり':'なし'):null,
      'image-count':matchedField(j&&j[15],v=>
        vasBasicRange_(vasBasicNum_(v)??0,widths.imageCountWidth,'枚','',true)),
      'job-video':matched?(j[16]===true||Number(j[16])===1?'あり':'なし'):null,
      'indeed-tag-count':matchedField(j&&j[18],v=>
        vasBasicRange_(vasBasicNum_(v)??0,widths.tagCountWidth,'個','')),
      'note-detail':jobAvailable?(notes||'（未設定）'):null
    };
    for(const [id,[type,widthName]] of Object.entries(VAS_SALARY_AXES_)) {
      values[id]=matched&&salaryType===type?
        vasBasicRange_(j[13],widths[widthName],'円','（給与下限なし）'):null;
      if(values[id]!=='（給与下限なし）'&&values[id]!=null&&
          (vasBasicNum_(j[13])??0)<=0)values[id]='（給与下限なし）';
    }
    for(const [id] of VAS_BASIC_AXES_) {
      const val=values[id];
      if(val===null||val===undefined||val==='')continue;
      const key=vasStr_(val);
      available.add(id);
      const group=agg.get(id);
      if(!group.has(key))group.set(key,{count:0,target:0,ages:Array(8).fill(0)});
      const m=group.get(key);
      m.count+=count;m.target+=targetCount;m.ages[ageIndex]+=count;
    }
  }
  const rows=[];
  for(const [id] of VAS_BASIC_AXES_) {
    for(const [key,value] of [...agg.get(id)].sort((a,b)=>vasBasicGroupSort_(id,a,b))) {
      rows.push([id,key,value.count,value.target,
        value.count?value.target/value.count:0,...value.ages]);
    }
  }
  return {rows,total,targetTotal,available:[...available]};
}
function vasParseSettings_(values) {
  const val=a1=>values[a1];
  const parseIntOrNull=x=>x===''||x==null?null:Number(x);
  const ageMin=parseIntOrNull(val('B9')),ageMax=parseIntOrNull(val('B10'));
  const targetMin=parseIntOrNull(val('B13')),targetMax=parseIntOrNull(val('B14'));
  for(const x of [ageMin,ageMax,targetMin,targetMax]) {
    if(x!==null&&(!Number.isInteger(x)||x<0||x>200))
      throw new Error('年齢設定には0～200の整数を指定してください。');
  }
  const w=(k,fallback)=>val(k)===''||val(k)==null?fallback:Number(val(k));
  const defs=[
    ['B17','月内応募日幅',7],['B18','応募時間帯幅',6],
    ['B19','時給下限幅',50],['B20','日給下限幅',1000],
    ['B21','月給下限幅',50000],['B22','年収下限幅',500000],
    ['B23','求人原稿文字数幅',300],['B24','求人画像枚数幅',1],
    ['B25','Indeed求人タグ数幅',5]
  ];
  for(const [key,label,fallback] of defs){
    const value=w(key,fallback);
    if(!Number.isInteger(value)||value<1)
      throw new Error(label+'は1以上の整数を指定してください。');
  }
  return {
    start:val('B5')?vasDateKey_(val('B5')):'',
    end:val('B6')?vasDateKey_(val('B6')):'',
    ageMin,ageMax,targetMin,targetMax,
    monthDayWidth:w('B17',7),hourWidth:w('B18',6),
    hourlySalaryWidth:w('B19',50),dailySalaryWidth:w('B20',1000),
    monthlySalaryWidth:w('B21',50000),annualSalaryWidth:w('B22',500000),
    textWidth:w('B23',300),imageCountWidth:w('B24',1),
    tagCountWidth:w('B25',5)
  };
}
