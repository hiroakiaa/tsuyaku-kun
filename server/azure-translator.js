import {AZURE_F0_POLICY as P} from '../web/cost-policy.js';
import {parseTranslation} from '../web/core.js';
const DAY=86400000;
const fail=(message,status=503,reason='service')=>Object.assign(Error(message),{status,azureFailure:{reason,scope:'azure',message,evidence:'app_policy'}});
export function azureConfig(env,now=Date.now()){
 if(!env.AZURE_TRANSLATOR_F0)return null;
 let c;try{c=JSON.parse(env.AZURE_TRANSLATOR_F0);}catch{throw fail('Azure無料翻訳の設定を確認してください。');}
 if(c.sku!=='F0'||typeof c.key!=='string'||!c.key||c.region!=='japaneast'||(c.monthlyF0!==true&&!Number.isFinite(Date.parse(c.expiresAt))))throw fail('Azure無料翻訳の設定を確認してください。');
 if(c.monthlyF0!==true&&now>=Date.parse(c.expiresAt))throw fail('Azure無料試用の接続期限です。有料プランには切り替えていません。',429,'quota');return c;
}
export function azureLanguages(source,targets){const map=c=>({fil:'fil',tl:'fil','zh-CN':'zh-Hans'})[c]||c;const allowed=new Set(['ja','en','pt','es','tl','fil','vi','zh-CN','ko','id','ne','de']);return allowed.has(source)&&targets.every(c=>allowed.has(c))?{source:map(source),targets:[...new Set(targets.map(map))],map}:null;}
export async function azureBudget(storage,data,now=Date.now()){
 return storage.transaction(async tx=>{
  const day=Math.floor(now/DAY);let state=await tx.get('azure-f0')||{days:{},leases:{},blockedUntil:0};
  for(const k of Object.keys(state.days))if(Number(k)<=day-P.rollingDays)delete state.days[k];
  for(const [id,l]of Object.entries(state.leases))if(l.expires<=now)delete state.leases[id];
  const uid=String(data.uid||'').slice(0,64),days=Object.values(state.days),used=days.reduce((n,d)=>n+d.used,0),own=days.reduce((n,d)=>n+(d.users[uid]||0),0);
  const status=()=>({provider:'azure_f0',sku:'F0',rollingDays:P.rollingDays,usedCharacters:used,limitCharacters:P.characters,remainingCharacters:Math.max(0,P.characters-used),userUsedCharacters:own,userLimitCharacters:P.userCharacters,userRemainingCharacters:Math.max(0,P.userCharacters-own),blocked:state.blockedUntil>now,freePlanUSD:0,asOf:now});
  if(data.action==='status')return status();
  if(data.action==='reserve'){
   if(!uid||!Number.isSafeInteger(data.characters)||data.characters<1||data.characters>4800)throw fail('Azure翻訳の入力を確認してください。',400,'input');
   if(state.blockedUntil>now||used+data.characters>P.characters||own+data.characters>P.userCharacters)throw fail('Azure無料翻訳の上限です。有料翻訳へは自動で切り替えません。',429,'quota');
   const leases=Object.values(state.leases);if(leases.length>=8||leases.filter(l=>l.uid===uid).length>=2)throw fail('Azure翻訳を処理中です。少し待ってから再試行してください。',429,'overloaded');
   const entry=state.days[day]||{used:0,users:{}};if(!Object.hasOwn(entry.users,uid)&&Object.keys(entry.users).length>=1000)throw fail('Azure無料翻訳の利用人数上限です。',429,'quota');
   entry.used+=data.characters;entry.users[uid]=(entry.users[uid]||0)+data.characters;state.days[day]=entry;const id=crypto.randomUUID();state.leases[id]={uid,expires:now+30000};await tx.put('azure-f0',state);return {id,characters:data.characters};
  }
  if(data.action==='release'){delete state.leases[data.id];await tx.put('azure-f0',state);return {ok:true};}
  if(data.action==='block'){state.blockedUntil=now+P.rollingDays*DAY;await tx.put('azure-f0',state);return {ok:true};}
  throw fail('Azure翻訳の操作を確認してください。',400,'input');
 });
}
export async function azureOperation(env,data){
 if(!env.ROOMS)throw fail('Azure無料枠の上限制御を確認できません。');
 const target=env.ROOMS.get(env.ROOMS.idFromName('__azure_f0_budget_v1__')),r=await target.fetch(new Request('https://azure/azure-budget',{method:'POST',body:JSON.stringify(data)})),result=await r.json();if(!r.ok)throw fail(result.error||'Azure無料翻訳を利用できません。',r.status,result.reason||'service');return result;
}
export async function azureTranslate(env,text,source,targets,onUsage=()=>{},fetcher=fetch){
 const config=azureConfig(env);if(!config)throw fail('Azure無料翻訳は未接続です。');const langs=azureLanguages(source,targets);if(!langs)throw fail('Azure翻訳の言語を確認してください。',400,'input');
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.budgetUid||''))),uid=Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);
 const characters=[...text].length*langs.targets.length;if(env.executionValid&&!await env.executionValid())throw fail('この翻訳の有効期限が切れました。');
 const lease=await azureOperation(env,{action:'reserve',uid,characters});
 const usage={inputTokens:0,outputTokens:0,unknown:false,provider:'azure_f0',azureCharacters:characters,azureFreePlanUSD:0,azureAttempted:true};onUsage(usage);
 try{
  const url=new URL('https://api.cognitive.microsofttranslator.com/translate');url.searchParams.set('api-version','3.0');url.searchParams.set('from',langs.source);for(const code of langs.targets)url.searchParams.append('to',code);
  const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':config.key,'Ocp-Apim-Subscription-Region':config.region},body:JSON.stringify([{Text:text}]),signal:AbortSignal.timeout(10000)});
  if(!response.ok){let code;try{code=(await response.json())?.error?.code;}catch{}if(code===403001){await azureOperation(env,{action:'block'});throw fail('Azureの無料枠上限です。有料翻訳へは切り替えません。',429,'quota');}throw fail(response.status===429?'Azure翻訳が混み合っています。':'Azure無料翻訳との接続を確認してください。',response.status===429?429:502,response.status===429?'overloaded':'service');}
  const raw=await response.json();if(!Array.isArray(raw)||raw.length!==1||!Array.isArray(raw[0]?.translations))throw fail('Azureの翻訳結果を確認できませんでした。',502);
  const out={};for(const target of targets){const rows=raw[0].translations.filter(r=>r.to===langs.map(target));if(rows.length!==1||typeof rows[0].text!=='string')throw fail('Azureの翻訳結果がそろいませんでした。',502);out[target]=rows[0].text;}
  return parseTranslation(JSON.stringify(out),targets);
 }catch(e){if(e.azureFailure)throw e;throw fail('Azure無料翻訳を完了できませんでした。有料翻訳へは切り替えません。',502);}finally{await azureOperation(env,{action:'release',id:lease.id}).catch(()=>{});}
}
