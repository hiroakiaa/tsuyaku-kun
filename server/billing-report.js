import {amountRows,billingNumber,billingWindow} from '../web/billing-data.js';
export async function isBillingAdministrator(auth,expectedHash){
 if(!/^[a-f0-9]{64}$/.test(expectedHash||'')||auth?.provider!=='google.com'||auth.emailVerified!==true||typeof auth.email!=='string')return false;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.email.toLowerCase()));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')===expectedHash;
}
const cache=new Map(),inFlight=new Map();
export async function cloudflareBillingReport(env,now=Date.now(),fetcher=fetch){
 const month=new Date(now).toISOString().slice(0,7),window=billingWindow(month),account=env.CF_BILLING_ACCOUNT;
 if(!env.CF_BILLING_READ_TOKEN||!/^[a-f0-9]{32}$/.test(account||''))return {provider:'cloudflare',month,status:'pending',message:'請求の読取接続が未設定です。'};
 const key=account+month,old=cache.get(key);if(old&&now-old.at<86400000)return old.report;if(inFlight.has(key))return inFlight.get(key);
 // Free Billing Read API only; no plan changes, purchases, AI, DO or paid queries.
 const task=(async()=>{try{
  const previous=new Date(window.start);previous.setUTCMonth(previous.getUTCMonth()-1);const params=new URLSearchParams({from:previous.toISOString().slice(0,10),to:new Date(now).toISOString().slice(0,10)});
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/billable-usage?'+params,{method:'GET',headers:{Authorization:'Bearer '+env.CF_BILLING_READ_TOKEN},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('請求APIの権限・有効期限を確認してください。');const raw=await r.text();if(raw.length>2000000)throw Error('無料取得の処理上限で停止しました。');const data=JSON.parse(raw);
  if(data.success!==true||data.errors?.length||!Array.isArray(data.result)||data.result.length>5000)throw Error('請求APIのデータを取得できませんでした。');
  let crossing=false;const rows=[];for(const row of data.result){const start=Date.parse(row.ChargePeriodStart),end=Date.parse(row.ChargePeriodEnd);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('請求期間を確認できませんでした。');if(end<=window.start||start>=window.end)continue;if(start<window.start||end>window.end){crossing=true;continue;}rows.push({service:row.ServiceName,currency:row.BillingCurrency,amount:billingNumber(row.BilledCost)});}
  return {provider:'cloudflare',month,status:rows.length?'ready':'pending',rows:amountRows(rows),fetchedAt:now,partial:true,scope:'Cloudflareアカウント共通・取得できた今月の従量料金',message:crossing?'月をまたぐ請求分と固定費は未取得です。':'固定費・税・他アプリとの費用配分は未確定です。'};
 }catch{return {provider:'cloudflare',month,status:'error',message:'請求データを取得できませんでした。有料処理への切替は行いません。'};}})();inFlight.set(key,task);
 try{const report=await task;if(cache.size>3)cache.clear();cache.set(key,{at:now,report});return report;}finally{inFlight.delete(key);}
}
