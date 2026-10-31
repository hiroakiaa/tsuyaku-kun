export function faceTranslationTargets(source,self,other,{economy=false}={}){
 return [...new Set(economy?[self,other]:['ja',self,other,'en'])].filter(code=>typeof code==='string'&&code!==source);
}
export function speedPreferred(storage){return storage.getItem('tsuyaku-recognition-speed-v1')==='fast';}

export function speedPasswordMatches(value){return typeof value==='string'&&value.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).trim()==='1111';}
