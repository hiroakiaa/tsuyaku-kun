const pending=new Map();
export function definedDocumentTerms(pages,names=[]){
 const source=pages.join('\n').normalize('NFKC'),excluded=new Set(names.map(name=>name.normalize('NFKC'))),terms=new Map(),ambiguous=new Set();
 const pattern=/(?:^|(?<=[\n。]))([\p{Script=Han}\p{Script=Katakana}ー]{4,20})(?:\([A-Za-z -]{2,12}\))?は([^。\n]{6,100})です[。]?/gu;
 for(const [definition,term,meaning]of source.matchAll(pattern)){
  if(excluded.has(term)||ambiguous.has(term)||/^\s*\d/u.test(meaning)||!/(?:こと|もの|仕組み|方法|符号|番号|処理|手続き|制度|機能|認証|登録|費用|料金)$/u.test(meaning)||pages.filter(page=>page.normalize('NFKC').includes(term)).length<2)continue;
  const canonical=term+'は'+meaning+'です。';if(terms.has(term)&&terms.get(term).definition!==canonical){terms.delete(term);ambiguous.add(term);continue;}terms.set(term,{term,definition:canonical});
 }
 return [...terms.values()].slice(0,12);
}
export async function sharedDocumentTerminology(storage,id,language,terms,generate,onReuse=()=>{}){
 if(!terms.length)return {};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([1,language,terms]))),suffix=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),key='/document/terminology/'+suffix;
 const valid=value=>value&&typeof value==='object'&&terms.every(({term})=>typeof value[term]==='string'&&value[term].trim()&&value[term].length<=120);
 const cached=await storage.get(key);if(valid(cached)){onReuse('cache');return cached;}
 const lock=id+':'+suffix;if(pending.has(lock)){onReuse('in-flight');return pending.get(lock);}
 onReuse('generated');
 const work=(async()=>{
  if(!await storage.get('document'))throw Object.assign(Error('資料が削除されたため翻訳を終了しました。'),{status:404});
  const result=await generate(terms);if(!valid(result))throw Error('専門用語の訳を確認しています。');
  await storage.transaction(async tx=>{if(!await tx.get('document'))throw Object.assign(Error('資料が削除されたため翻訳を終了しました。'),{status:404});const manifest='/document/terminology-manifest',entries=(await tx.get(manifest)??[]).filter(value=>value!==key);if(entries.length>=24)await tx.delete(entries.shift());await tx.put({[key]:result,[manifest]:[...entries,key]});});return result;
 })();pending.set(lock,work);try{return await work;}finally{pending.delete(lock);}
}
