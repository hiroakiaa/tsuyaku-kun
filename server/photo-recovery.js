import {guardedAi} from './ai-budget.js';
import {PHOTO_RECOVERY_POLICY as P} from '../web/cost-policy.js';
export function recoverablePhotoFailure(error){
 const pending=[error],seen=new Set();while(pending.length){const e=pending.shift();if(!e||seen.has(e))continue;seen.add(e);
 if(e.appBudget||[400,401,403,413].includes(e.status)||['quota','billing','auth','input'].includes(e.aiFailure?.reason)||[3036,5035,3023,3041,5016,5018,5004,3003,3006].includes(Number(e.code)))return false;
 if(/quota.*(?:exceed|exhaust)|daily.*(?:allocation|limit)|billing|payment|requires.*paid/i.test(e.message||''))return false;
 if(e.cause)pending.push(e.cause);if(Array.isArray(e.errors))pending.push(...e.errors);
 }return true;
}
export async function runPhotoRecovery(env,input,fetcher=fetch){
 if(!env.OPENAI_DOCUMENT_QA_KEY)throw Object.assign(Error('翻訳の接続を回復しています。'),{status:503});
 const body={model:P.model,messages:input.messages,temperature:0,max_completion_tokens:P.maxOutputTokens,response_format:{type:'json_object'},store:false};
 return guardedAi(env,P.model,body,async()=>{
  const response=await fetcher('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_DOCUMENT_QA_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(P.timeoutMs)});
  const data=await response.json();if(!response.ok)throw Object.assign(Error('翻訳サービスとの接続を回復できませんでした。'),{status:response.status,aiFailure:{reason:response.status===429&&data.error?.code==='insufficient_quota'?'quota':[401,403].includes(response.status)?'auth':'service'}});
  if(data.choices?.[0]?.finish_reason!=='stop'||!data.choices?.[0]?.message?.content?.trim())throw Object.assign(Error('訳文の続きを確認しています。'),{status:502});
  return data;
 });
}
