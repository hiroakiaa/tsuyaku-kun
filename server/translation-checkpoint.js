// Persist completed groups so a later request only translates unfinished groups.
export async function translationCheckpoints(storage,key,batches,translate){
 const output=new Array(batches.length);let next=0,failure;
 const worker=async()=>{while(!failure){
  const index=next++;if(index>=batches.length)return;
  const part=key+':part:'+index;
  try{
   const cached=await storage.get(part);
   if(Array.isArray(cached)&&cached.length===batches[index].length&&cached.every(value=>typeof value==='string'&&value.trim())){output[index]=cached;continue;}
   const result=await translate(batches[index]);
   if(!Array.isArray(result)||result.length!==batches[index].length||result.some(value=>typeof value!=='string'||!value.trim()))throw Error('訳文を確認できませんでした。');
   if(new TextEncoder().encode(JSON.stringify(result)).length<120000)await storage.transaction(async tx=>{
    if(!await tx.get('document'))return;
    const manifest='/document/translation-checkpoints',entries=(await tx.get(manifest)??[]).filter(value=>value!==part);
    if(entries.length>=320)await tx.delete(entries.shift());
    await tx.put({[part]:result,[manifest]:[...entries,part]});
   });
   output[index]=result;
  }catch(error){failure??=error;}
 }};
 await Promise.all([worker(),worker()]);if(failure)throw failure;return output.flat();
}
