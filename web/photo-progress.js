import {resumeTranslation,transientTranslationError} from './translation-resume.js?v=20261119-resume-1';
// Small, bounded requests make long photo documents progressively visible.
export function photoTranslationPlan(blocks,limit=260){
 const parts=[];for(const block of blocks){let text=block.text;let part=0;while(text.length){let end=Math.min(limit,text.length);if(end<text.length){const prefix=text.slice(0,end),boundary=Math.max(prefix.lastIndexOf('。'),prefix.lastIndexOf('\n'),prefix.lastIndexOf('. '),prefix.lastIndexOf('！'),prefix.lastIndexOf('？'));if(boundary>=limit/2)end=boundary+1;if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
 const value=text.slice(0,end);text=text.slice(end);if(value.trim())parts.push({id:'b'+parts.length,originalId:block.id,part:part++,text:value});}}
 const batches=[];for(const part of parts){let batch=batches.at(-1);if(!batch||batch.length>=6||batch.reduce((n,b)=>n+b.text.length,0)+part.text.length>limit){batch=[];batches.push(batch);}batch.push(part);}return batches;
}
export async function translatePhotoProgressively({blocks,source,target,request,cache,onProgress=()=>{},onResume=()=>{},wait,valid=()=>true}){
 const batches=photoTranslationPlan(blocks),finished=new Map(),byOriginal=new Map();
 for(const batch of batches)for(const part of batch){let list=byOriginal.get(part.originalId);if(!list){list=[];byOriginal.set(part.originalId,list);}list.push(part);}
 let next=0,done=0,reused=0,failure;
 const snapshot=()=>({reuse:{reused,total:batches.length},blocks:blocks.flatMap(block=>{const parts=byOriginal.get(block.id)||[];const available=[];for(const part of parts){if(!finished.has(part.id))break;available.push(part);}if(!available.length)return [];const translations={[source]:block.text,[target]:available.map(p=>finished.get(p.id).translations[target]).join('\n')};return [{id:block.id,translations,partial:available.length<parts.length,quality:{warnings:available.flatMap(p=>finished.get(p.id).quality?.warnings||[])}}];})});
 const keyFor=batch=>JSON.stringify([source,target,batch.map(p=>p.text)]);
 async function recoverBatch(batch,budget,depth=0){
  const key=keyFor(batch),saved=cache.get(key);if(saved){reused++;return saved;}
  try{
   const values=await resumeTranslation(async()=>{
    if(--budget.remaining<0)throw Object.assign(Error('翻訳の接続回復に時間がかかっています。完成した部分は保存しています。'),{status:503});
    const data=await request({source,targets:[target],blocks:batch.map(p=>({id:p.id,text:p.text}))});
    const rows=data.blocks,byId=new Map(rows?.map(b=>[b.id,b]));
    const values=batch.map(p=>byId.get(p.id));if(!Array.isArray(rows)||rows.length!==batch.length||byId.size!==batch.length||values.some(v=>!v||typeof v.translations?.[target]!=='string'||!v.translations[target].trim()))throw Object.assign(Error('訳文の不足した部分を補っています。'),{status:502});
    if(['cache','in-flight'].includes(data.reuse))reused++;return values;
   },{valid,onResume,wait,delays:[700,1800]});
   cache.set(key,values);while(cache.size>96)cache.delete(cache.keys().next().value);return values;
  }catch(error){
   if(!valid()||!transientTranslationError(error)||budget.remaining<1||depth>=2)throw error;
   onResume({error,split:true});
   let values;
   if(batch.length>1){const middle=Math.ceil(batch.length/2);values=[...await recoverBatch(batch.slice(0,middle),budget,depth+1),...await recoverBatch(batch.slice(middle),budget,depth+1)];}
   else{const part=batch[0];if(part.text.length<80)throw error;let middle=Math.ceil(part.text.length/2);if(/[\uD800-\uDBFF]/.test(part.text[middle-1]))middle++;
    const left=await recoverBatch([{...part,text:part.text.slice(0,middle)}],budget,depth+1),right=await recoverBatch([{...part,text:part.text.slice(middle)}],budget,depth+1);
    values=[{id:part.id,translations:{[target]:left[0].translations[target]+'\n'+right[0].translations[target]},quality:{warnings:[...(left[0].quality?.warnings||[]),...(right[0].quality?.warnings||[])]}}];
   }
   cache.set(key,values);while(cache.size>96)cache.delete(cache.keys().next().value);return values;
  }
 }
 const worker=async()=>{while(valid()&&!failure){const index=next++;if(index>=batches.length)return;const batch=batches[index];try{const values=await recoverBatch(batch,{remaining:8});
 if(!valid())return;batch.forEach((p,i)=>finished.set(p.id,values[i]));done++;onProgress(snapshot(),done,batches.length);
 }catch(e){failure=e;}}};
 await Promise.all([worker(),worker()]);if(failure)throw failure;if(!valid())throw new DOMException('Aborted','AbortError');return snapshot();
}
