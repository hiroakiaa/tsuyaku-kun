export function speechGapAllowsJoin(previous,next){
 if(Number.isFinite(previous?.speechEndedAt)&&Number.isFinite(next?.speechStartedAt)){
  const gap=next.speechStartedAt-previous.speechEndedAt;return gap>=-1500&&gap<=1400;
 }
 return true; // Legacy/native timings are unknown, not zero.
}
export function joinSpeechText(previous,next,language,boundary){
 // Only de-duplicate the exact repeated context recorded at a forced boundary.
 if(boundary==='limit'){
  const max=Math.min(24,previous.length,next.length);
  for(let n=max;n>=4;n--){const overlap=previous.slice(-n);if(next.startsWith(overlap)&&(!/^[a-z]/i.test(overlap)||/\s/.test(overlap))){next=next.slice(n).trimStart();break;}}
 }
 if(!next)return previous;
 const separator=['ja','zh','zh-CN'].includes(language)?'':' ';
 return previous+separator+next;
}
export function incompleteEnglish(text){return /^(?:it means|this means|because|if|when|i(?:'m| am) going to|we(?:'re| are) going to|could you|can you|i would like to)[,:]?$/i.test(text.trim());}

// Only grammatical endings; meaningful short replies and questions stay intact.
export function japaneseSpeechTail(text){return /^(?:です|でした|ます|ました|ません)[。．.!！]?$/u.test(String(text||'').trim());}
