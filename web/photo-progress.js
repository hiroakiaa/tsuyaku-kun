// Small, bounded requests make long photo documents progressively visible.
export function photoTranslationPlan(blocks,limit=260){
 const parts=[];for(const block of blocks){let text=block.text;let part=0;while(text.length){let end=Math.min(limit,text.length);if(end<text.length){const prefix=text.slice(0,end),boundary=Math.max(prefix.lastIndexOf('。'),prefix.lastIndexOf('\n'),prefix.lastIndexOf('. '),prefix.lastIndexOf('！'),prefix.lastIndexOf('？'));if(boundary>=limit/2)end=boundary+1;if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
 const value=text.slice(0,end);text=text.slice(end);if(value.trim())parts.push({id:'b'+parts.length,originalId:block.id,part:part++,text:value});}}
 const batches=[];for(const part of parts){let batch=batches.at(-1);if(!batch||batch.length>=6||batch.reduce((n,b)=>n+b.text.length,0)+part.text.length>limit){batch=[];batches.push(batch);}batch.push(part);}return batches;
}
export async function translatePhotoProgressively({blocks,source,target,request,cache,onProgress=()=>{},valid=()=>true}){
 const batches=photoTranslationPlan(blocks),finished=new Map();let next=0,done=0,failure;
 const snapshot=()=>({blocks:blocks.flatMap(block=>{const parts=batches.flat().filter(p=>p.originalId===block.id);const available=[];for(const part of parts){if(!finished.has(part.id))break;available.push(part);}if(!available.length)return [];const translations={[source]:block.text,[target]:available.map(p=>finished.get(p.id).translations[target]).join('\n')};return [{id:block.id,translations,partial:available.length<parts.length,quality:{warnings:available.flatMap(p=>finished.get(p.id).quality?.warnings||[])}}];})});
 const worker=async()=>{while(valid()&&!failure){const index=next++;if(index>=batches.length)return;const batch=batches[index],key=JSON.stringify([source,target,batch.map(p=>p.text)]);try{let values=cache.get(key);if(!values){const data=await request({source,targets:[target],blocks:batch.map(p=>({id:p.id,text:p.text}))});const byId=new Map(data.blocks?.map(b=>[b.id,b]));values=batch.map(p=>byId.get(p.id));if(values.some(v=>!v||typeof v.translations?.[target]!=='string'||!v.translations[target].trim()))throw Error('必要な言語の訳がありません。');cache.set(key,values);while(cache.size>96)cache.delete(cache.keys().next().value);}
 if(!valid())return;batch.forEach((p,i)=>finished.set(p.id,values[i]));done++;onProgress(snapshot(),done,batches.length);
 }catch(e){failure=e;}}};
 await Promise.all([worker(),worker()]);if(failure)throw failure;if(!valid())throw new DOMException('Aborted','AbortError');return snapshot();
}
