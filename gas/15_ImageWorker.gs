/**
 * TOP image lookup through the same fixed-purpose Cloudflare Worker
 * used by valid-app/index.html. Numeric public job-management IDs only.
 *
 * Fetch up to 20 image names per invocation so Apps Script's execution
 * deadline is not dominated by a slow external service.
 * Multiple runs continue where previous runs stopped; no detail rows
 * are omitted from the analysis output itself.
 */
const VAS_DETAIL_IMAGE_WORKER_=
 'https://tenichi-image-proxy-test.tkarasa.workers.dev/';
const VAS_DETAIL_IMAGE_BATCH_=20;
function vasDetailFetchImageResponse_(response){
 try{
  const status=response.getResponseCode();
  const payload=JSON.parse(response.getContentText()||'{}');
  const url=status>=200&&status<300&&payload.ok?
    vasDetailImageUrl_(payload.imageUrl):'';
  return {ok:!!url,url,notFound:payload.code==='IMAGE_NOT_FOUND'};
 }catch(_){return {ok:false,url:'',notFound:false};}
}
function vasDetailResolveImageBatch_(items,fetchAll){
 const result=items.map(item=>({...item,url:'',status:'取得失敗',tried:0}));
 const pending=new Set(result.map((_,i)=>i));
 const maximum=Math.max(0,...result.map(item=>item.ids.length));
 for(let attempt=0;attempt<maximum&&pending.size;attempt++){
  const active=[...pending].filter(i=>result[i].ids.length>attempt);
  if(!active.length)break;
  const requests=active.map(i=>({
   url:VAS_DETAIL_IMAGE_WORKER_+'?jobId='+encodeURIComponent(result[i].ids[attempt]),
   method:'get',muteHttpExceptions:true,followRedirects:false
  }));
  let responses=[];
  try{responses=fetchAll(requests);}catch(_){
   responses=active.map(()=>null);
  }
  for(let k=0;k<active.length;k++){
   const i=active[k],item=result[i];
   item.tried++;
   const parsed=responses[k]?vasDetailFetchImageResponse_(responses[k]):
    {ok:false,url:'',notFound:false};
   if(parsed.ok){item.url=parsed.url;item.status='自動取得';pending.delete(i);}
   else if(parsed.notFound)item.status='画像なし';
  }
 }
 return result;
}
function vasDetailPendingImages_(rows,maxFiles,retryFailed){
 const pending=[],all=[];
 for(let i=0;i<rows.length;i++){
  const name=vasStr_(rows[i][0]),currentUrl=vasDetailImageUrl_(rows[i][2]);
  if(!name||currentUrl)continue;
  const status=vasStr_(rows[i][3]);
  // Failed lookups must not starve untried images in later batches.
  if(!retryFailed&&(status==='画像なし'||status==='取得失敗'))continue;
  const ids=[...new Set(vasStr_(rows[i][1]).split('::').map(vasStr_)
    .filter(id=>/^\d+$/.test(id)))];
  if(!ids.length)continue;
  all.push({index:i,name,ids});
  if(pending.length<maxFiles)pending.push({index:i,name,ids});
 }
 return {pending,remaining:all.length-pending.length};
}
function vasDetailUpdateImageFormulas_(ss,masterRows) {
 const view=ss.getSheetByName('43_TOP画像');
 if(!view)return;
 const label=vasStr_(view.getRange('B3').getDisplayValue());
 if(!label.startsWith('専用集計反映済み'))return;
 const end=view.getLastRow();
 if(end<9)return;
 const names=view.getRange(9,2,end-8,1).getValues();
 const map=vasDetailImageMap_(masterRows);
 const count=names.length;
 const formulas=names.map(([name])=>[
  vasDetailImageFormula_(map.get(vasStr_(name))||'')
 ]);
 if(count)view.getRange(9,1,count,1).setFormulas(formulas);
}
/** A network operation, NEVER run from an onEdit/onOpen trigger. */
function refreshTopImages(){vasDetailRunImageRefresh_(false);}
function retryFailedTopImages(){vasDetailRunImageRefresh_(true);}
function vasDetailRunImageRefresh_(retryFailed){
 const lock=vasImportLock_();
 try {
  if(vasStatus_()!=='READY')
   throw new Error('先にCSV取込を完了してください。');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const master=ss.getSheetByName('94_画像マスタ');
  const rows=vasReadVisibleRange_(master,VAS_IMAGE_MASTER_HEADERS.length);
  if(!rows.length){
   SpreadsheetApp.getUi().alert('画像マスタに候補がありません。');
   return;
  }
  const {pending,remaining}=vasDetailPendingImages_(rows,VAS_DETAIL_IMAGE_BATCH_,retryFailed);
  if(!pending.length){
   vasDetailUpdateImageFormulas_(ss,rows);
   SpreadsheetApp.getUi().alert(retryFailed?
    '再試行する画像候補はありません。':
    '未取得の公開求人候補IDはありません。失敗した画像を再試行する場合は、'+
    '専用の再試行メニューを使ってください。');
   return;
  }
  const results=vasDetailResolveImageBatch_(pending,
   requests=>UrlFetchApp.fetchAll(requests));
  const now=new Date();
  const changed=new Set();
  for(const item of results){
   const r=rows[item.index];
   r[2]=item.url||'';
   r[3]=item.status;
   r[4]=now;
   changed.add(item.index);
  }
  // C:E only. Candidate filenames and IDs stay the CSV-importer's truth.
  for(const i of [...changed].sort((a,b)=>a-b)){
   master.getRange(i+2,3,1,3).setValues([
    rows[i].slice(2,5)
   ]);
  }
  SpreadsheetApp.flush();
  vasDetailUpdateImageFormulas_(ss,rows);
  const found=results.filter(x=>x.url).length;
  const view=ss.getSheetByName('43_TOP画像');
  view.getRange('H3').setValue(
   '画像取得：'+found+'/'+results.length+'件成功。'+
   '残りの候補：'+remaining+'件（必要なら再実行）');
  SpreadsheetApp.getUi().alert(
   'TOP画像URLの取得を実行しました。\n今回：'+results.length+
   '種類／成功：'+found+'種類\n未処理の候補：'+remaining+
   '種類。\n集計件数は画像の取得結果に左右されません。'
  );
 }catch(e){
  SpreadsheetApp.getUi().alert('TOP画像URL取得でエラーが発生しました。\n'+
   String(e.message||e));
  throw e;
 }finally{lock.releaseLock();}
}
