/**
 * Basic analysis v0.1: pure aggregation of canonical Sheets data.
 * This phase covers axes with deterministic mappings from the persisted
 * schema; advanced KW and bucket axes will follow.
 */
const VAS_BASIC_AXES_ = Object.freeze([
  ['age','年代構成'],['status','対応状況別'],['month','応募月別'],
  ['media','応募媒体別'],['enterprise','企業ID別'],['gender','性別ごと'],
  ['name-script','氏名文字種区分別'],['residence','居住都道府県別'],
  ['job-category','職種別'],['employment','雇用形態別'],
  ['job-location-name','求人勤務地名称別'],['job-prefecture','勤務地都道府県別'],
  ['prefecture-match','勤務地・居住都道府県一致別'],
  ['recruit-background','募集背景別'],['weekday','応募曜日別'],
  ['month-day','月内応募日別'],['hour','応募時間帯別'],
  ['main-image','メイン画像有無別'],['job-video','求人動画有無別'],
  ['note-detail','求人備考1行目別応募傾向']
]);
const vasStr_ = x => x == null?'':String(x).trim();
const vasAgeBucket_ = age => {
  const n=Number(age);
  return age!==''&&age!=null&&Number.isFinite(n)&&n>=10&&n<80
    ? Math.floor(n/10)-1:7;
};
function vasDateKey_(v){
  if(v instanceof Date) return Utilities.formatDate(v,'Asia/Tokyo','yyyy-MM-dd');
  return vasStr_(v).slice(0,10).replace(/\//g,'-');
}
function vasCalculateBasic_(applicationRows,jobRows,options){
  const jobs=new Map(jobRows.map(r=>[vasStr_(r[0]),r]));
  const opts=options||{},start=opts.start||'',end=opts.end||'';
  const ageMin=opts.ageMin,ageMax=opts.ageMax,targetMin=opts.targetMin,targetMax=opts.targetMax;
  const dayWidth=opts.monthDayWidth||7,hourWidth=opts.hourWidth||6;
  if(start&&end&&start>end)throw new Error('集計開始日が終了日より後です。');
  if(ageMin!=null&&ageMax!=null&&ageMin>ageMax)throw new Error('対象年齢範囲が不正です。');
  if(targetMin!=null&&targetMax!=null&&targetMin>targetMax)throw new Error('ターゲット年齢範囲が不正です。');
  const agg=new Map(VAS_BASIC_AXES_.map(([id])=>[id,new Map()]));
  let total=0,targetTotal=0;
  const available=new Set();
  for(const a of applicationRows){
    const date=vasDateKey_(a[5]);
    if(start&&(!date||date<start))continue;
    if(end&&(!date||date>end))continue;
    const age=a[13]===''||a[13]==null?null:Number(a[13]);
    if((ageMin!=null&&(age==null||age<ageMin))||
       (ageMax!=null&&(age==null||age>ageMax)))continue;
    const count=Number(a[10])||0;
    if(count<=0)continue;
    // Web isTargetAge() never treats unknown age as a target,
    // even when both age limits are blank.
    const target=age!=null&&Number.isFinite(age)&&
      (targetMin==null||age>=targetMin)&&(targetMax==null||age<=targetMax);
    const targetCount=target?count:0,ageIndex=vasAgeBucket_(a[13]);
    total+=count;targetTotal+=targetCount;
    const j=jobs.get(vasStr_(a[3]))||null;
    const note=j?vasStr_(j[11]).split(/\r?\n|<br\s*\/?>/i)[0]:'';
    const monthDay=a[7]===''||a[7]==null?null:Number(a[7]);
    const hour=a[9]===''||a[9]==null?null:Number(a[9]);
    const monthDayStart=monthDay!=null&&Number.isInteger(monthDay)&&monthDay>=1&&monthDay<=31
      ?Math.floor((monthDay-1)/dayWidth)*dayWidth+1:null;
    const hourStart=hour!=null&&Number.isInteger(hour)&&hour>=0&&hour<=23
      ?Math.floor(hour/hourWidth)*hourWidth:null;
    const values={
      age:VAS_AGE_LABELS[ageIndex],status:a[11],month:a[6],media:a[12],
      enterprise:a[1],gender:a[14],'name-script':a[15],residence:a[16],
      'job-category':j?j[6]:a[18],employment:j?j[7]:a[19],
      'job-location-name':j?j[9]:a[21],
      'job-prefecture':j?j[10]:a[20],
      'prefecture-match':a[17]===''?'':Number(a[17])===1?'一致':'不一致',
      'recruit-background':j?j[8]:'',
      weekday:a[8],
      'month-day':monthDayStart===null?'（不明）':
        monthDayStart+'-'+Math.min(monthDayStart+dayWidth-1,31)+'日',
      hour:hourStart===null?'（不明）':
        (hourWidth<=1?hourStart+'時台':
          hourStart+'～'+Math.min(hourStart+hourWidth-1,23)+'時台'),
      'main-image':j&&j[1]==='JOB_CSV'?(vasStr_(j[14])?'あり':'なし'):'',
      'job-video':j&&j[1]==='JOB_CSV'?(Number(j[16])===1?'あり':'なし'):'',
      'note-detail':note
    };
    for(const [id] of VAS_BASIC_AXES_){
      const val=values[id];
      if(val===''||val==null)continue;
      const key=vasStr_(val);
      if(!key)continue;
      available.add(id);
      const group=agg.get(id);
      if(!group.has(key))group.set(key,{count:0,target:0,ages:Array(8).fill(0)});
      const m=group.get(key);
      m.count+=count;m.target+=targetCount;m.ages[ageIndex]+=count;
    }
  }
  const rows=[];
  for(const [id] of VAS_BASIC_AXES_){
    const groups=agg.get(id);
    const ordered=[...groups.entries()].sort((a,b)=>b[1].count-a[1].count||
      a[0].localeCompare(b[0],'ja'));
    for(const [key,values] of ordered)
      rows.push([id,key,values.count,values.target,values.count?values.target/values.count:0,...values.ages]);
  }
  return {rows,total,targetTotal,available:[...available]};
}
function vasParseSettings_ (values){
  const parseIntOrNull=x=>x===''||x==null?null:Number(x);
  const val=a1=>values[a1];
  const ageMin=parseIntOrNull(val('B9')),ageMax=parseIntOrNull(val('B10'));
  const targetMin=parseIntOrNull(val('B13')),targetMax=parseIntOrNull(val('B14'));
  for(const x of [ageMin,ageMax,targetMin,targetMax]){
    if(x!=null&&(!Number.isInteger(x)||x<0||x>200))
      throw new Error('年齢設定には0～200の整数を指定してください。');
  }
  const widths=[['月内応募日幅',val('B17')||7],['応募時間帯幅',val('B18')||6]];
  for(const [name,value] of widths){
    if(!Number.isInteger(Number(value))||Number(value)<1)
      throw new Error(name+'は1以上の整数を指定してください。');
  }
  return {
    start:val('B5')?vasDateKey_(val('B5')):'',
    end:val('B6')?vasDateKey_(val('B6')):'',
    ageMin,ageMax,targetMin,targetMax,
    monthDayWidth:Number(val('B17')||7),
    hourWidth:Number(val('B18')||6)
  };
}
