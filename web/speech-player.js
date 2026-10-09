// One utterance at a time. Late completion events cannot clear a newer player.
export class SpeechPlayer {
 constructor({engine,Utterance,onChange=()=>{},onError=()=>{},now=()=>performance.now(),schedule=fn=>setInterval(fn,100),unschedule=id=>clearInterval(id)}){Object.assign(this,{engine,Utterance,onChange,onError,now,schedule,unschedule});this.key=null;this.paused=false;this.generation=0;this.utterance=null;this.range=null;this.timer=null;this.clockAt=null;this.elapsed=0;this.boundarySeen=false;this.engine?.getVoices?.();}
 toggle(key,text,lang){
  if(!this.engine||!this.Utterance){this.onError('unsupported');return;}
  if(this.key===key){if(this.paused){if(this.clockAt!==null)this.clockAt=this.now();this.paused=false;this.engine.resume();}else{if(this.clockAt!==null){this.elapsed+=Math.max(0,this.now()-this.clockAt);this.clockAt=this.now();}this.paused=true;this.engine.pause();}this.onChange();return;}
  this.stop();const generation=++this.generation;this.key=key;this.paused=false;
  const utterance=new this.Utterance(text);this.utterance=utterance;utterance.lang=lang;
  const voices=(this.engine.getVoices?.()||[]).slice().sort((a,b)=>Number(!!b.localService)-Number(!!a.localService)),voice=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase())||voices.find(v=>v.lang.split('-')[0]===lang.split('-')[0]);if(voice)utterance.voice=voice;
  const finish=()=>{if(generation!==this.generation)return;this.clearProgress();this.key=null;this.paused=false;this.utterance=null;this.range=null;this.onChange();};
  utterance.onboundary=e=>{if(generation!==this.generation||this.paused||e.name==='sentence')return;const start=e.charIndex;if(!Number.isInteger(start)||start<0||start>=text.length)return;let end=start+(e.charLength||0);if(end<=start){const segment=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(lang,{granularity:'word'}).segment(text)].find(s=>s.index<=start&&s.index+s.segment.length>start):null;end=segment?segment.index+segment.segment.length:start+(text.slice(start).match(/^\S+/)?.[0].length||1);}this.boundarySeen=true;this.clearTimer();if(this.range&&start<this.range.start)return;this.range={start,end:Math.min(end,text.length)};this.onChange();};
  // Some Chromium voices provide start/end but no word boundary events.
  // The fallback is approximate; real boundary events always take precedence.
  const words=speechWords(text,lang),rate=Math.max(.1,utterance.rate||1);
  utterance.onstart=()=>{if(generation!==this.generation)return;this.clockAt=this.now();this.elapsed=0;if(!this.range&&words.length){this.range={start:words[0].start,end:words[0].end};this.onChange();}if(this.boundarySeen)return;this.timer=this.schedule(()=>{if(generation!==this.generation||this.paused||this.boundarySeen||this.clockAt===null)return;const elapsed=this.elapsed+Math.max(0,this.now()-this.clockAt);if(elapsed<650)return;const word=words.filter(w=>w.at/rate<=elapsed).at(-1);if(word&&(!this.range||word.start>this.range.start)){this.range={start:word.start,end:word.end};this.onChange();}});};
  utterance.onend=finish;utterance.onerror=e=>{if(generation!==this.generation)return;finish();if(!['canceled','interrupted'].includes(e.error))this.onError(e.error);};
  this.onChange();try{this.engine.speak(utterance);}catch{finish();this.onError('playback');}
 }
 clearTimer(){if(this.timer!==null){this.unschedule(this.timer);this.timer=null;}}
 clearProgress(){this.clearTimer();this.clockAt=null;this.elapsed=0;this.boundarySeen=false;}
 stop(){this.generation++;this.clearProgress();this.engine?.cancel();this.utterance=null;this.key=null;this.paused=false;this.range=null;this.onChange();}
}

export function speechWords(text,lang){
 let segments;try{segments=[...new Intl.Segmenter(lang,{granularity:'word'}).segment(text)].filter(s=>s.isWordLike);}catch{segments=[...text.matchAll(/\S+/gu)].map(m=>({segment:m[0],index:m.index}));}
 let at=0,previousEnd=0;return segments.map(s=>{const punctuation=text.slice(previousEnd,s.index);at+=/[。！？.!?]/u.test(punctuation)?300:/[、,;:]/u.test(punctuation)?140:0;const row={start:s.index,end:s.index+s.segment.length,at};const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s.segment);at+=cjk?Math.max(180,[...s.segment].length*165):Math.max(210,[...s.segment].length*65);previousEnd=row.end;return row;});
}
