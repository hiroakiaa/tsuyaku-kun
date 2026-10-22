import {amountRows,billingNumber,billingWindow,readGoogleBillingPreview,billingRefreshInterval} from '../web/billing-data.js';
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

// The dataset-scoped reader has no job execution permission. Its key never reaches the browser.
const googleCache=new Map(),googleFlight=new Map();
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export async function googleBillingReport(env,now=Date.now(),fetcher=fetch){
 const month=new Date(now).toISOString().slice(0,7),pending={provider:'google',month,status:'pending',message:'請求データの接続・準備待ちです。まだ0円とは判定しません。'};
 if(!env.GOOGLE_BILLING_READER_KEY)return pending;
 const key=env.FIREBASE_PROJECT+':'+env.GOOGLE_BILLING_DATASET+':'+env.GOOGLE_BILLING_TABLE+':'+month,old=googleCache.get(key);
 if(old&&now-old.at<billingRefreshInterval(old.report))return old.report;if(googleFlight.has(key))return googleFlight.get(key);
 const task=(async()=>{try{
  const reader=JSON.parse(env.GOOGLE_BILLING_READER_KEY);
  if(reader.type!=='service_account'||reader.client_email!=='tsuyaku-billing-reader@'+env.FIREBASE_PROJECT+'.iam.gserviceaccount.com'||reader.project_id!==env.FIREBASE_PROJECT||typeof reader.private_key!=='string')throw Error('Invalid reader');
  const encode=value=>base64url(new TextEncoder().encode(JSON.stringify(value))),seconds=Math.floor(now/1000);
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:reader.client_email,scope:'https://www.googleapis.com/auth/bigquery.readonly',aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+600});
  const pem=reader.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const signingKey=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,new TextEncoder().encode(unsigned));
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+base64url(new Uint8Array(signature))}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Reader authentication failed');const raw=await response.text();if(raw.length>20000)throw Error('Invalid token response');const token=JSON.parse(raw);if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>10000)throw Error('Invalid token');
  return await readGoogleBillingPreview({accessToken:token.access_token,project:env.FIREBASE_PROJECT,dataset:env.GOOGLE_BILLING_DATASET,table:env.GOOGLE_BILLING_TABLE,month,fetcher,now});
 }catch(e){return {provider:'google',month,status:e?.message==='請求データの準備中です。'?'pending':'error',retryable:e?.message==='請求データの準備中です。',message:e?.message==='請求データの準備中です。'?'Googleの請求データを準備中です。反映まで時間がかかります。':'無料閲覧で請求データを取得できませんでした。有料照会には切り替えません。'};}})();
 googleFlight.set(key,task);try{const report=await task;if(googleCache.size>3)googleCache.clear();googleCache.set(key,{at:now,report});return report;}finally{googleFlight.delete(key);}
}
