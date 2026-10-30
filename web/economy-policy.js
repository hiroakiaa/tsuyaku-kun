export function faceTranslationTargets(source,self,other,{economy=false}={}){
 return [...new Set(economy?[self,other]:['ja',self,other,'en'])].filter(code=>typeof code==='string'&&code!==source);
}
export function speedPreferred(storage){return storage.getItem('tsuyaku-recognition-speed-v1')==='fast';}
