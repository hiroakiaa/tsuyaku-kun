const pattern=/[-−]?\d+(?:[.,]\d+)*/g;
export const ocrNumbers=text=>[...String(text).normalize('NFKC').matchAll(pattern)].map(match=>match[0].replaceAll('−','-'));
const equivalent=value=>value.replace(/,(?=\d{3}(?:\D|$))/g,'');
// Geometry must establish the same line before using this function. A third,
// digit-only recognition confirms a disagreement; neither full-text OCR wins
// merely because its result looks more plausible.
export function reconcileOcrNumbers(primary,candidate,confirmations=[]){
 const before=ocrNumbers(primary),after=ocrNumbers(candidate);
 if(before.length!==after.length)return {text:candidate,repaired:0,unresolved:1};
 const replacements=new Map();let repaired=0,unresolved=0;
 for(let i=0;i<before.length;i++){
  if(equivalent(before[i])===equivalent(after[i]))continue;
  const check=confirmations[i],confirmed=check?.confidence>=80?ocrNumbers(check.text):[];
  if(confirmed.length===1&&equivalent(confirmed[0])===equivalent(before[i])){replacements.set(i,before[i]);repaired++;}
  else if(!(confirmed.length===1&&equivalent(confirmed[0])===equivalent(after[i])))unresolved++;
 }
 let index=0;const text=String(candidate).normalize('NFKC').replace(pattern,match=>replacements.get(index++)??match);
 return {text,repaired,unresolved};
}
