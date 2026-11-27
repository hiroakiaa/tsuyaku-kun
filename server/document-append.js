const reply=(data,status=200)=>Response.json(data,{status});
export async function appendDocumentStorage(storage,input,pdf){
 return storage.transaction(async tx=>{
  const current=await tx.get('document');if(!current)return reply({error:'資料が見つかりません。'},404);
  if(current.owner!==input.owner)return reply({error:'作成者だけが追加できます。'},403);
  if((current.revision??0)!==input.revision)return reply({error:'別の更新がありました。資料を開き直して追加してください。'},409);
  let oldPages=current.pages;if(current.textParts){const keys=Array.from({length:current.textParts},(_,i)=>'document-text:'+i),chunks=await tx.get(keys);oldPages=JSON.parse(keys.map(k=>chunks.get(k)).join(''));}
  const pages=input.pages,sources=input.sources;
  if(!Array.isArray(oldPages)||(current.originalPageCount??oldPages.length)!==oldPages.length)return reply({error:'文字だけの追加資料が含まれています。元資料をすべて選び直して新規作成してください。'},409);
  if(!Array.isArray(pages)||pages.length<=oldPages.length||pages.length>160||pages.some(p=>typeof p!=='string')||pages.join('').length>150000||!pdf.length||pdf.length>20000000)return reply({error:'統合資料の上限を確認してください。'},413);
  if(oldPages.some((p,i)=>pages[i]!==p))return reply({error:'元の本文と一致しません。資料を開き直してください。'},409);
  if(!Array.isArray(sources)||!sources.length||(current.materials??[]).length+sources.length>8)return reply({error:'追加資料は合計8件までです。'},413);
  let next=oldPages.length+1;for(const s of sources){if(typeof s.name!=='string'||!s.name.trim()||s.name.length>255||s.start!==next||!Number.isInteger(s.count)||s.count<1)return reply({error:'追加ページの対応を確認してください。'},400);next+=s.count;}if(next!==pages.length+1)return reply({error:'追加ページ数が一致しません。'},400);
  const revision=(current.revision??0)+1,record={...current,pages,readingQuality:input.readingQuality,materials:[...(current.materials??[]),...sources.map(s=>({...s,unit:'ページ'}))],sourceType:'pdf',originalPageCount:pages.length,revision,items:[],toc:[],index:undefined,summary:undefined,levelSummaries:undefined};delete record.textParts;delete record.pageCount;
  const values={document:record};if(pages.join('').length>22000){const serialized=JSON.stringify(pages);delete record.pages;record.pageCount=pages.length;record.textParts=Math.ceil(serialized.length/20000);for(let i=0;i<record.textParts;i++)values['document-text:'+i]=serialized.slice(i*20000,(i+1)*20000);}
  for(let offset=0;offset<pdf.length;offset+=64000)values['pdf:'+offset]=pdf.slice(offset,offset+64000);
  const prior=[...await tx.list({prefix:'pdf:'}),...await tx.list({prefix:'document-text:'})].map(([k])=>k).filter(k=>!(k in values));for(let i=0;i<prior.length;i+=100)await tx.delete(prior.slice(i,i+100));const entries=Object.entries(values);for(let i=0;i<entries.length;i+=100)await tx.put(Object.fromEntries(entries.slice(i,i+100)));
  return reply({ok:true,start:oldPages.length+1,pageCount:pages.length,revision},201);
 });
}
