import {encodeWav,tokenWithAbort} from './caption-server.js?v=20261030-dots-capture-1';
import {firstVoicedAt,lastVoicedAt} from './diagnostics.js?v=20261007-progressive-1';
import {speechTextAllowed} from './two-language.js?v=20261029-communication50-1';
import {nonSpeechReason} from './speech-filter.js?v=20261007-learning-1';
import {recognitionMetrics} from './recognition-metrics.js?v=20261029-communication50-1';
export class FreshAudioWindow{
 constructor(){this.frames=[];this.length=0;}
 push(samples,receivedAt){this.frames.push({start:this.length,end:this.length+samples.length,receivedAt,samples:samples.slice()});this.length+=samples.length;while(this.frames.length>100)this.frames.shift().samples.fill(0);}
 take(startSeconds,endSeconds,now=Date.now(),observedStart){
  if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||startSeconds<0||endSeconds<=startSeconds||endSeconds-startSeconds>5.7||!this.frames.length||endSeconds*16000>this.length+160)return null;
  let start=Math.max(0,Math.floor(startSeconds*16000)-2400);const end=Math.min(this.length,Math.ceil(endSeconds*16000)+1600);
  if(Number.isFinite(observedStart)){const f=this.frames.find(f=>observedStart>=f.receivedAt-f.samples.length/16&&observedStart<=f.receivedAt);if(f){const onset=f.start+Math.round((observedStart-(f.receivedAt-f.samples.length/16))*16);if(onset<=startSeconds*16000&&onset>=startSeconds*16000-16000)start=Math.min(start,Math.max(0,onset-1600));}}
  if(start<this.frames[0].start||end<=start||end-start>96000)return null;
  const samples=new Int16Array(end-start);let receivedAt;
  for(const f of this.frames){const a=Math.max(start,f.start),b=Math.min(end,f.end);if(b>a){samples.set(f.samples.subarray(a-f.start,b-f.start),a-start);receivedAt=f.receivedAt-(f.end-b)/16;}}
  const speechEndedAt=lastVoicedAt(samples,receivedAt),speechStartedAt=firstVoicedAt(samples,receivedAt);
  if(speechEndedAt===null||now-speechEndedAt>4000||speechEndedAt>now+100){samples.fill(0);return null;}
  return {samples,speechStartedAt,speechEndedAt};
 }
 clear(){for(const f of this.frames)f.samples.fill(0);this.frames=[];this.length=0;}
}
export function createRealtimeRecovery({endpoint,getToken,acquireSlot,onUsage=()=>{},onDiagnostic=()=>{},onUnmeasured=()=>{},fetcher=fetch}){
 return async({samples,speechEndedAt,signal,candidates})=>{
  const controller=new AbortController(),abort=()=>controller.abort();if(signal.aborted)throw signal.reason;signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,6000);let release,sent=false,known=false;
  try{
   let token;try{token=await tokenWithAbort(getToken,controller.signal);}catch(error){if(!controller.signal.aborted)error.error='auth';throw error;}release=await acquireSlot(controller.signal);if(controller.signal.aborted||Date.now()-speechEndedAt>4000)return null;
   const started=Date.now();onUsage(samples.length/16000);sent=true;
   const response=await fetcher(endpoint+'?language=auto&languages='+encodeURIComponent(candidates.join(','))+'&profile=beam1',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'audio/wav'},body:encodeWav(samples),signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
   const data=await response.json();known=response.ok||[400,401,403,429].includes(response.status);
   onDiagnostic({code:response.ok?'ok':'http_error',status:response.status,clientRequestMs:Date.now()-started,audioSeconds:samples.length/16000,...recognitionMetrics(data?.recognitionTiming),...(['quota','billing','input','model','auth','overloaded','timeout','service'].includes(data?.aiFailure?.reason)?{aiReason:data.aiFailure.reason}:{}),...(Number.isInteger(data?.aiFailure?.code)?{aiCode:data.aiFailure.code}:{})});
   if(!response.ok)throw Object.assign(Error('Recognition recovery failed'),{error:response.status===401?'auth':data?.aiFailure?.reason||'service'});
   if(typeof data?.text!=='string'||data.text.length>600||data.languageUncertain||!candidates.includes(data.language)||!speechTextAllowed(data.text,candidates)||nonSpeechReason(data,data.language))return null;
   return {text:data.text,language:data.language};
  }finally{if(sent&&!known)onUnmeasured();release?.();clearTimeout(timer);signal.removeEventListener('abort',abort);}
 };
}
