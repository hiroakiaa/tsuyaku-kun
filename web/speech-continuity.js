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

// Repair only an exact repeated integer plus a grammatical ending in overlapping audio.
export function japaneseNumericCompletion(previous,next){
 const base=String(previous||'').trim().replace(/[。．.!！]$/u,''),tail=String(next||'').trim();
 const before=/(?:^|[^0-9０-９.,．，])([0-9０-９]{1,8})$/u.exec(base),after=/^([0-9０-９]{1,8})(です|でした|ではありません|じゃありません)[。．.!！]?$/u.exec(tail);
 if(!before||!after||before[1]!==after[1])return null;
 return base+tail.slice(after[1].length);
}
