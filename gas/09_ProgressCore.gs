/**
 * Pure monthly-progress calculator.
 * Web reference: valid-app/analysis-core.js buildMonthProgress().
 * Latest month is data-relative, not the current calendar month.
 * All 31 chart days are represented by null or a numeric count.
 */
const VAS_PROGRESS_SERIES_ = Object.freeze([
  {key:'prev1',offset:1,label:'前月'},
  {key:'prev2',offset:2,label:'前々月'},
  {key:'year',offset:12,label:'前年同月'}
]);
const VAS_PROGRESS_CACHE_HEADERS_ = Object.freeze([
  '月内日','最新月・日別','最新月・累積','最新月・予測累積',
  '前月・日別','前月・累積',
  '前々月・日別','前々月・累積',
  '前年同月・日別','前年同月・累積'
]);
const VAS_PROGRESS_CHART_HEADERS_ = Object.freeze([
  '月内日','最新月・実績','最新月・予測','前月','前々月','前年同月'
]);
const VAS_PROGRESS_MONTH_HEADERS_ = Object.freeze([
  '応募年月','応募数','ターゲット応募数','ターゲット率'
]);
function vasProgressParseDate_(value) {
  const text=vasDateKey_(value);
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if(!match)return null;
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&
    date.getUTCDate()===d?{date,key:text,month:text.slice(0,7),day:d}:null;
}
function vasProgressMonth_(year,month) {
  const dt=new Date(Date.UTC(year,month-1,1));
  return dt.toISOString().slice(0,7);
}
function vasProgressDaysInMonth_(monthKey) {
  const [y,m]=monthKey.split('-').map(Number);
  return new Date(Date.UTC(y,m,0)).getUTCDate();
}
function vasProgressShiftMonth_(key,offset) {
  const [year,month]=key.split('-').map(Number);
  return vasProgressMonth_(year,month-offset);
}
function vasProgressLabel_(month){
  const [year,m]=month.split('-').map(Number);
  return year+'年'+m+'月';
}
function vasProgressCumulative_(daily) {
  let sum=0;
  return daily.map(value=>{
    if(value===null)return null;
    sum+=value;
    return sum;
  });
}
function vasProgressRound_(x){return Math.round(x*10)/10;}
/**
 * B28 = 日別 / 累積; B29 = forecast on/off;
 * B30 = 1..3 comparison series in exact Web order.
 * Mode/forecast/comparison visibility is selected by worksheet formulas,
 * allowing those three settings to change without rerunning GAS.
 */
function vasProgressSettings_(sheet){
  const v=sheet.getRange('B28:B30').getValues();
  const mode=String(v[0][0]||'日別');
  if(mode!=='日別'&&mode!=='累積')
    throw new Error('応募進捗表示モードは「日別」または「累積」にしてください。');
  const raw=Number(v[2][0]||3);
  if(!Number.isInteger(raw)||raw<1||raw>3)
    throw new Error('比較グラフの月数は1～3の整数を指定してください（Web版は前月・前々月・前年同月）。');
  return {mode,forecast:v[1][0]===true,comparisons:raw};
}
function vasProgressCalculate_(applications,options) {
  const opts=options||{};
  const start=opts.start||'',end=opts.end||'';
  if(start&&end&&start>end)throw new Error('集計開始日が終了日より後です。');
  const observed=[],filtered=[];
  for(const a of applications||[]) {
    const dt=vasProgressParseDate_(a[5]);
    if(!dt)continue;
    if(start&&dt.key<start||end&&dt.key>end)continue;
    const count=vasBasicNum_(a[10])||0;
    if(count<=0)continue;
    observed.push({dt,count});
    const age=vasBasicNum_(a[13]);
    if(opts.ageMin!=null&&(age===null||age<opts.ageMin))continue;
    if(opts.ageMax!=null&&(age===null||age>opts.ageMax))continue;
    const target=age!==null&&
      (opts.targetMin==null||age>=opts.targetMin)&&
      (opts.targetMax==null||age<=opts.targetMax);
    filtered.push({dt,count,target:target?count:0});
  }
  if(!observed.length)return {
    visible:false,cacheRows:[],monthlyRows:[],comparisons:[],
    latestMonth:'',latestDay:0,actual:0,projected:null
  };
  observed.sort((a,b)=>a.dt.key.localeCompare(b.dt.key));
  const latest=observed[observed.length-1].dt,month=latest.month;
  const latestDay=latest.day,totalDays=vasProgressDaysInMonth_(month);
  const startDay=start&&start.slice(0,7)===month?Number(start.slice(8,10)):1;
  const elapsed=Math.max(1,latestDay-startDay+1);
  const byMonth=new Map();
  for(const r of observed){
    if(!byMonth.has(r.dt.month))byMonth.set(r.dt.month,{count:0,target:0});
  }
  for(const r of filtered) {
    const sum=byMonth.get(r.dt.month);
    if(sum){sum.count+=r.count;sum.target+=r.target;}
  }
  const monthlyRows=[...byMonth.entries()].sort((a,b)=>b[0].localeCompare(a[0]))
    .map(([k,v])=>[k,v.count,v.target,v.count?v.target/v.count:0]);
  const currentDay=Array(31).fill(null);
  for(let day=startDay;day<=latestDay;day++)currentDay[day-1]=0;
  for(const r of filtered) {
    if(r.dt.month!==month)continue;
    if(r.dt.day>=startDay&&r.dt.day<=latestDay)
      currentDay[r.dt.day-1]+=r.count;
  }
  const currentCumulative=vasProgressCumulative_(currentDay);
  const currentTotal=currentCumulative[latestDay-1]||0;
  // Faithful to Web: rate observed within selected period, projected
  // over the entire calendar month's day count.
  const projection=latestDay<totalDays?
    vasProgressRound(currentTotal/elapsed*totalDays):null;
  const forecast=Array(31).fill(null);
  if(projection!==null&&latestDay<totalDays){
    forecast[latestDay-1]=currentTotal; // join forecast line to actual
    const remaining=totalDays-latestDay;
    for(let day=latestDay+1;day<=totalDays;day++)
      forecast[day-1]=vasProgressRound(
        currentTotal+(projection-currentTotal)*(day-latestDay)/remaining
      );
  }
  const comparisons=VAS_PROGRESS_SERIES_.map(def=>{
    const comparisonKey=vasProgressShiftMonth_(month,def.offset);
    const nDays=vasProgressDaysInMonth_(comparisonKey);
    const monthStart=comparisonKey+'-01';
    const monthEnd=comparisonKey+'-'+String(nDays).padStart(2,'0');
    const overlaps=(!start||monthEnd>=start)&&(!end||monthStart<=end);
    const first=start&&start.slice(0,7)===comparisonKey?
      Number(start.slice(8,10)):1;
    const last=end&&end.slice(0,7)===comparisonKey?
      Number(end.slice(8,10)):nDays;
    const daily=Array(31).fill(null);
    if(overlaps&&first<=last){
      for(let day=first;day<=last;day++)daily[day-1]=0;
      for(const r of filtered)if(r.dt.month===comparisonKey&&
          r.dt.day>=first&&r.dt.day<=last)daily[r.dt.day-1]+=r.count;
    }
    const cumulative=vasProgressCumulative_(daily);
    return {
      ...def,month:comparisonKey,label:vasProgressLabel_(comparisonKey),
      enabled:overlaps&&first<=last,daily,cumulative,
      sameDay:cumulative[Math.min(latestDay,nDays)-1]
    };
  });
  const cacheRows=Array.from({length:31},(_,i)=>[
    i+1,currentDay[i],currentCumulative[i],forecast[i],
    comparisons[0].daily[i],comparisons[0].cumulative[i],
    comparisons[1].daily[i],comparisons[1].cumulative[i],
    comparisons[2].daily[i],comparisons[2].cumulative[i]
  ]);
  return {
    visible:true,latestMonth:month,latestMonthLabel:vasProgressLabel_(month),
    latestDate:latest.key,latestDay,daysInMonth:totalDays,observedDayCount:elapsed,
    actual:currentTotal,projected:projection,
    monthlyRows,cacheRows,comparisons
  };
}
