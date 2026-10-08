// One utterance at a time. Late completion events cannot clear a newer player.
export class SpeechPlayer {
 constructor({engine,Utterance,onChange=()=>{},onError=()=>{}}){Object.assign(this,{engine,Utterance,onChange,onError});this.key=null;this.paused=false;this.generation=0;this.utterance=null;this.range=null;this.engine?.getVoices?.();}
 toggle(key,text,lang){
  if(!this.engine||!this.Utterance){this.onError('unsupported');return;}
  if(this.key===key){if(this.paused){this.engine.resume();this.paused=false;}else{this.engine.pause();this.paused=true;}this.onChange();return;}
  this.stop();const generation=++this.generation;this.key=key;this.paused=false;
  const utterance=new this.Utterance(text);this.utterance=utterance;utterance.lang=lang;
  const voices=this.engine.getVoices?.()||[],voice=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase())||voices.find(v=>v.lang.split('-')[0]===lang.split('-')[0]);if(voice)utterance.voice=voice;
  const finish=()=>{if(generation!==this.generation)return;this.key=null;this.paused=false;this.utterance=null;this.range=null;this.onChange();};
  utterance.onboundary=e=>{if(generation!==this.generation||this.paused||e.name==='sentence')return;const start=e.charIndex;if(!Number.isInteger(start)||start<0||start>=text.length)return;let end=start+(e.charLength||0);if(end<=start){const segment=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(lang,{granularity:'word'}).segment(text)].find(s=>s.index<=start&&s.index+s.segment.length>start):null;end=segment?segment.index+segment.segment.length:start+(text.slice(start).match(/^\S+/)?.[0].length||1);}this.range={start,end:Math.min(end,text.length)};this.onChange();};
  utterance.onend=finish;utterance.onerror=e=>{if(generation!==this.generation)return;finish();if(!['canceled','interrupted'].includes(e.error))this.onError(e.error);};
  this.onChange();try{this.engine.speak(utterance);}catch{finish();this.onError('playback');}
 }
 stop(){this.generation++;this.engine?.cancel();this.utterance=null;this.key=null;this.paused=false;this.range=null;this.onChange();}
}
