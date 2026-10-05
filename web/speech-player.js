// One utterance at a time. Late completion events cannot clear a newer player.
export class SpeechPlayer {
 constructor({engine,Utterance,onChange=()=>{},onError=()=>{}}){Object.assign(this,{engine,Utterance,onChange,onError});this.key=null;this.paused=false;this.generation=0;}
 toggle(key,text,lang){
  if(!this.engine||!this.Utterance){this.onError('unsupported');return;}
  if(this.key===key){if(this.paused){this.engine.resume();this.paused=false;}else{this.engine.pause();this.paused=true;}this.onChange();return;}
  this.stop();const generation=++this.generation;this.key=key;this.paused=false;
  const utterance=new this.Utterance(text);utterance.lang=lang;
  const finish=()=>{if(generation!==this.generation)return;this.key=null;this.paused=false;this.onChange();};
  utterance.onend=finish;utterance.onerror=e=>{if(generation!==this.generation)return;finish();if(!['canceled','interrupted'].includes(e.error))this.onError(e.error);};
  this.onChange();try{this.engine.speak(utterance);}catch{finish();this.onError('playback');}
 }
 stop(){this.generation++;this.engine?.cancel();this.key=null;this.paused=false;this.onChange();}
}
