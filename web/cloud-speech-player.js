import {SpeechPlayer,speechWords} from './speech-player.js?v=20261020-dictionary-voice-1';

// The same controls drive native speech and WaveNet playback.
export class CloudSpeechPlayer extends SpeechPlayer{
 constructor({cloud,...options}){super(options);this.cloud=cloud;this.cloudAudio=null;this.cloudAbort=null;}
 toggle(key,text,lang,options){
  if(/^(?:fil|tl)(?:-|$)/i.test(lang)&&this.cloud?.enabled())return this.toggleCloud(key,text,lang);
  return super.toggle(key,text,lang,options);
 }
 toggleCloud(key,text,lang){
  if(this.key===key){if(this.loading){this.stop();return;}if(this.paused){this.paused=false;const generation=this.generation;this.watchStart?.();try{void Promise.resolve(this.cloudAudio.play()).catch(()=>{if(generation!==this.generation)return;this.clearPending();this.paused=true;this.onChange();this.onError('speech-tap');});}catch{this.clearPending();this.paused=true;this.onChange();this.onError('speech-tap');}}else{this.paused=true;this.cloudAudio.pause();}this.onChange();return;}
  if(!String(text||'').trim())return;
  this.stop();const generation=++this.generation;this.key=key;this.loading=true;this.paused=false;this.started=false;
  const audio=new this.cloud.Audio();this.cloudAudio=audio;this.cloudAbort=new AbortController();
  // Unlock this element during the user's click, before the HTTP round-trip (iOS).
  audio.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
  // Safari may leave this promise pending. Never wait for the silent clip.
  try{void Promise.resolve(audio.play()).catch(()=>{});}catch{}
  const finish=()=>{if(generation!==this.generation)return;this.stop();};
  const fail=code=>{if(generation!==this.generation)return;finish();this.onError(code);};
  let loaded=false;
  const tapToPlay=()=>{if(generation!==this.generation)return;audio.pause();this.clearPending();this.watchStart=watch;this.paused=true;this.onChange();this.onError('speech-tap');};
  const watch=()=>{this.startWatch=this.delay(()=>loaded?tapToPlay():fail('cloud-speech'),15000);this.startWatch?.unref?.();};
  watch();
  const words=speechWords(text,lang),total=Math.max(1,(words.at(-1)?.at||0)+500);
  void(async()=>{
   try{
    const result=await this.cloud.load(text,lang,{signal:this.cloudAbort.signal});
    if(generation!==this.generation)return;
    audio.pause();audio.onplaying=()=>{if(generation!==this.generation)return;this.loading=false;this.started=true;this.paused=false;this.clearPending();this.watchStart=watch;this.onChange();};
    audio.ontimeupdate=()=>{if(generation!==this.generation||this.paused||!Number.isFinite(audio.duration)||audio.duration<=0)return;const at=audio.currentTime/audio.duration*total,word=words.filter(w=>w.at<=at).at(-1);if(word&&word.start!==this.range?.start){this.range={start:word.start,end:word.end};this.onChange();}};
    audio.onended=()=>this.started?finish():fail('cloud-speech');audio.onerror=()=>fail('cloud-speech');
    audio.src='data:audio/mpeg;base64,'+result.audioContent;
    loaded=true;this.watchStart=()=>{this.clearDelay(this.startWatch);watch();};
    await audio.play();
   }catch(error){if(generation!==this.generation)return;if(loaded&&error?.name==='NotAllowedError'){tapToPlay();return;}fail(error?.httpStatus===429?'speech-quota':'cloud-speech');}
  })();
  this.onChange();
 }
 stop(){this.cloudAbort?.abort();this.cloudAbort=null;if(this.cloudAudio){const audio=this.cloudAudio;this.cloudAudio=null;audio.onplaying=audio.ontimeupdate=audio.onended=audio.onerror=null;try{audio.pause();audio.removeAttribute?.('src');audio.load?.();}catch{}}super.stop();}
}

export function createSpeechCache(load,{maxBytes=8000000,maxEntries=24}={}){
 const cache=new Map();let bytes=0;
 return async(text,language,options)=>{
  const key=language+'\u0000'+text;
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const result=await load(text,language,options);if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(typeof result?.audioContent!=='string')throw Error('Invalid speech audio');
  const size=result.audioContent.length*2;if(size<=maxBytes){cache.set(key,result);bytes+=size;while(cache.size>maxEntries||bytes>maxBytes){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).audioContent.length*2;cache.delete(oldest);}}
  return result;
 };
}
