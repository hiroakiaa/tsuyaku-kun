export function nextDocumentTranslation({count,current,language,pending,failures,englishFailures}){
 const pages=[current,...Array.from({length:count},(_,i)=>i+1).filter(page=>page!==current)];
 const available=(page,code)=>!pending.has(page+':'+code)&&(code==='en'?(englishFailures.get(page)??0)<2:(failures.get(page+':'+code)??0)<2);
 if(language&&language!=='ja'){const page=pages.find(page=>available(page,language));if(page)return {page,language};}
 const page=pages.find(page=>available(page,'en'));return page?{page,language:'en'}:null;
}
