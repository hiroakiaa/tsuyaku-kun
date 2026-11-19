import {runPhotoRecovery} from './photo-recovery.js';
import {photoTranslationInput,translatePhotoWithRecovery} from './photo-translation.js';
import {photoInput,photoUid,recognizePhoto} from './photo-ocr.js';
import {glossaryFor} from '../web/core.js';
import {storedTranslations} from './dictionary.js';
const pending=new Map();
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function photoReuseOperation(env,kind,data,catalog){
 const scope=await photoUid(env.budgetUid),input=kind==='ocr'?data:photoTranslationInput(data,catalog.languages.map(l=>l.code));
 let key,canonical;
 if(kind==='ocr'){photoInput(data);canonical=data;key=await digest('ocr-v2:'+data.image);}
 else{
  canonical={source:input.source,targets:[...input.targets].sort(),blocks:input.blocks.map((block,index)=>({id:'b'+index,text:block.text}))};
  const glossary=glossaryFor(input.blocks.map(b=>b.text).join('\n'),catalog.glossary).slice(0,24);
  const bank=input.blocks.map(block=>storedTranslations(block.text,input.source,input.targets,catalog,'').translations);
  key=await digest(JSON.stringify(['photo-gemma-4-v1',canonical,glossary,bank]));
 }
 const room=env.ROOMS.get(env.ROOMS.idFromName('__photo_reuse_v1__:'+scope));
 const response=await room.fetch(new Request('https://photo/photo-reuse',{method:'POST',body:JSON.stringify({kind,key,scope,uid:env.budgetUid,data:canonical})}));
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'保存済みの翻訳を確認できませんでした。'),{status:response.status,aiFailure:result.aiFailure});
 if(kind==='translate')result.blocks=result.blocks.map((block,index)=>({...block,id:input.blocks[index].id}));
 return result;
}
export async function photoReuseStorage(storage,env,input,catalog,run){
 const {kind,key,scope,uid,data}=input;
 if(!['ocr','translate'].includes(kind)||!/^[a-f0-9]{64}$/.test(key)||!uid)throw Object.assign(Error('写真の操作を確認してください。'),{status:400});
 const cacheKey=kind+':'+key,cached=await storage.get(cacheKey).catch(()=>undefined);
 const reused=(result,reuse)=>({...result,reuse,...(kind==='translate'?{usage:{inputTokens:0,outputTokens:0,cacheHit:true}}:{})});
 if(cached)return reused(cached,'cache');
 const pendingKey=scope+':'+cacheKey;
 if(pending.has(pendingKey))return reused(await pending.get(pendingKey),'in-flight');
 const work=(async()=>{
  const result=kind==='ocr'?await recognizePhoto({...env,budgetUid:uid},data):await translatePhotoWithRecovery(data,catalog,input=>run(input,uid),env.OPENAI_DOCUMENT_QA_KEY?input=>runPhotoRecovery({...env,budgetUid:uid,photoUnlimited:true},input):null);
  const safe=(kind==='ocr'?Boolean(result.text):result.blocks.every(block=>!block.quality?.warnings?.length)) && new TextEncoder().encode(JSON.stringify(result)).length<120000;
  if(safe)await storage.transaction(async tx=>{
   const manifest=kind+':entries',entries=(await tx.get(manifest)||[]).filter(value=>value!==cacheKey);
   if(entries.length>=(kind==='ocr'?64:256))await tx.delete(entries.shift());
   await tx.put({[cacheKey]:result,[manifest]:[...entries,cacheKey]});
  }).catch(()=>{});
  return result;
 })();
 pending.set(pendingKey,work);
 try{return {...await work,reuse:'generated'};}finally{pending.delete(pendingKey);}
}
