// Free table preview only. No BigQuery SQL, jobs, Storage Read API or paid fallback.
export const BILLING_READ_LIMITS=Object.freeze({rows:5000,pages:5,pageRows:1000,bytes:2000000,intervalMs:86400000});
export function billingWindow(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('集計月を確認してください。');
 const start=Date.parse(month+'-01T00:00:00Z'),next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);
 return {month,start,end:next.getTime(),from:month+'-01',to:next.toISOString().slice(0,10)};
}
const required=['ServiceName','BillingCurrency','BilledCost','ChargePeriodStart','SubAccountId','x_ExportTime'];
export function billingNumber(value){if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value)))throw Error('請求データの金額が不明です。');return Number(value);}
export function billingTimestamp(value){if(value===null||value===undefined||value==='')throw Error('請求データの日時が不明です。');const n=Number(value),ms=Number.isFinite(n)?n*(Math.abs(n)>1e14?.001:1000):Date.parse(value);if(!Number.isFinite(ms))throw Error('請求データの日時が不明です。');return ms;}
export function amountRows(rows){const sums=new Map();for(const row of rows){if(typeof row.service!=='string'||!row.service||row.service.length>200||typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency))throw Error('請求データの形式を確認してください。');const key=JSON.stringify([row.service,row.currency]),old=sums.get(key);sums.set(key,{service:row.service,currency:row.currency,amount:(old?.amount||0)+billingNumber(row.amount)});}return [...sums.values()];}
export function googlePreviewRows(schema,rows,{project,month}){
 const fields=schema?.fields?.filter(f=>required.includes(f.name)).map(f=>f.name);if(fields?.length!==required.length||new Set(fields).size!==required.length)throw Error('請求テーブルの形式を確認してください。');
 const window=billingWindow(month),selected=[];let exportedAt=null;
 for(const row of rows){if(!Array.isArray(row.f)||row.f.length!==fields.length)throw Error('請求行の形式を確認してください。');const data=Object.fromEntries(fields.map((f,i)=>[f,row.f[i].v]));if(data.SubAccountId!==project)continue;
  const time=billingTimestamp(data.ChargePeriodStart);if(time<window.start||time>=window.end)continue;
  const exported=billingTimestamp(data.x_ExportTime);exportedAt=Math.max(exportedAt||0,exported);selected.push({service:data.ServiceName,currency:data.BillingCurrency,amount:billingNumber(data.BilledCost)});
 }
 return {rows:amountRows(selected),exportedAt};
}
export async function readGoogleBillingPreview({accessToken,project,dataset,table,month,fetcher=fetch,now=Date.now()}){
 if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)||!/^gcp_billing_immutable_[A-Za-z0-9_]+$/.test(dataset)||!/^gcp_billing_export_focus_[A-Za-z0-9_]+$/.test(table))throw Error('請求接続の設定を確認してください。');
 const base='https://bigquery.googleapis.com/bigquery/v2/projects/'+project+'/datasets/'+dataset+'/tables/'+table;let bytes=0;
 async function get(url){const r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error(r.status===404?'請求データの準備中です。':r.status===403?'無料閲覧で取得できません。有料照会は実行しません。':'請求データを取得できませんでした。');const reader=r.body.getReader(),chunks=[];try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>BILLING_READ_LIMITS.bytes){await reader.cancel();throw Error('無料取得の処理上限で停止しました。');}chunks.push(part.value);}}finally{reader.releaseLock();}const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(result));}
 const meta=await get(base+'?fields=schema,numRows,lastModifiedTime,type');
 if(meta.type!=='TABLE'||!/^\d+$/.test(String(meta.numRows))||Number(meta.numRows)>BILLING_READ_LIMITS.rows)throw Error('無料閲覧の上限内で全件取得できません。有料照会は実行しません。');
 const expected=Number(meta.numRows);if(!expected)return {provider:'google',month,status:'pending',message:'請求データの準備中です。まだ0円とは判定しません。'};
 let token='',rows=[];const tokens=new Set();
 for(let page=0;page<BILLING_READ_LIMITS.pages;page++){
  const params=new URLSearchParams({maxResults:String(BILLING_READ_LIMITS.pageRows),selectedFields:required.join(',')});if(token)params.set('pageToken',token);const data=await get(base+'/data?'+params);
  if(Number(data.totalRows)!==expected||!Array.isArray(data.rows))throw Error('請求データが更新中です。時間を置いて確認してください。');rows.push(...data.rows);if(rows.length>BILLING_READ_LIMITS.rows)throw Error('無料取得の処理上限で停止しました。');token=data.pageToken||'';if(!token)break;if(tokens.has(token))throw Error('請求データのページを取得できませんでした。');tokens.add(token);
 }
 if(token||rows.length!==expected)throw Error('請求データの一部を取得できませんでした。合計は表示しません。');
 const after=await get(base+'?fields=numRows,lastModifiedTime');if(after.numRows!==meta.numRows||after.lastModifiedTime!==meta.lastModifiedTime)throw Error('請求データが更新中です。時間を置いて確認してください。');
 const parsed=googlePreviewRows(meta.schema,rows,{project,month});return {provider:'google',month,status:parsed.rows.length?'ready':'pending',...parsed,fetchedAt:now,scope:'Google Cloud対象プロジェクト・クレジット反映後',message:'提供元の月途中データです。反映遅延・修正があり、確定請求ではありません。'};
}
export function billingTotals(reports,month){const totals={};let known=0;for(const report of reports){if(report?.month!==month||report.status!=='ready')continue;for(const row of amountRows(report.rows)){totals[row.currency]=(totals[row.currency]||0)+row.amount;known++;}}return {month,totals,known,complete:false,finalInvoice:false};}
