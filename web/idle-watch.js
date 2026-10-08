export function idleState({started,lastSpeech,lastVoice},now=Date.now()){
 const speech=lastSpeech||started,voice=lastVoice||started;
 // Noise alone cannot extend recognition indefinitely. Recognized speech does.
 const idle=Math.min(now-speech,now-voice+30000);
 const unrecognized=now-speech;
 const remaining=Math.min(120000-idle,180000-unrecognized);
 return remaining<=0?'stop':remaining<=15000?'warn':'active';
}
export class IdleWatch{
 constructor({onWarn,onStop,onDiagnostic=()=>{},now=()=>Date.now(),Context=globalThis.AudioContext||globalThis.webkitAudioContext,Worklet=globalThis.AudioWorkletNode}){Object.assign(this,{onWarn,onStop,onDiagnostic,now,Context,Worklet});}
 async start(stream){this.stop();this.active=true;const generation=this.generation;this.state={started:this.now(),lastSpeech:0,lastVoice:0};this.warned=false;this.timer=setInterval(()=>this.tick(),1000);
  try{if(!this.Context||!this.Worklet)return;const context=new this.Context();this.context=context;await context.resume();if(!this.active||generation!==this.generation)return;await context.audioWorklet.addModule(new URL('./idle-pcm.js',import.meta.url));if(!this.active||generation!==this.generation)return;this.node=new this.Worklet(context,'idle-activity');this.node.port.onmessage=()=>{if(this.active)this.state.lastVoice=this.now();};this.source=context.createMediaStreamSource(stream);this.source.connect(this.node);this.node.connect(context.destination);
  }catch{this.onDiagnostic('idle_audio_unavailable');}
 }
 speech(){if(this.active){this.state.lastSpeech=this.now();this.warned=false;}}
 continue(){if(this.active){this.state.started=this.now();this.state.lastSpeech=0;this.state.lastVoice=0;this.warned=false;}}
 tick(){if(!this.active)return;const state=idleState(this.state,this.now());if(state==='stop'){this.stop();this.onStop();}else if(state==='warn'&&!this.warned){this.warned=true;this.onWarn();}}
 stop(){this.active=false;this.generation=(this.generation||0)+1;clearInterval(this.timer);this.source?.disconnect();this.node?.disconnect();if(this.node)this.node.port.onmessage=null;void this.context?.close().catch(()=>{});this.context=null;this.source=null;this.node=null;}
}
