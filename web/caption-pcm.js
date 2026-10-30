// 20 ms RMS frames avoid treating every waveform zero crossing as silence.
// Audio stays in bounded memory only; natural pauses do not duplicate billing.
export class PcmSegmenter {
  constructor(rate, emit, activity=()=>{}, {pauseMs=500}={}) {
    this.pauseSamples=pauseMs===300?4800:8000;this.rate=rate;this.emit=emit;this.activity=activity;this.samples=new Int16Array(48000);
    this.preroll=new Int16Array(3200);this.frame=new Int16Array(320);
    this.clear();
  }
  push(input) {
    for(const value of input){
      this.sum+=value;this.count++;this.phase+=16000;
      if(this.phase<this.rate)continue;
      this.phase-=this.rate;const sample=this.sum/this.count;this.sum=0;this.count=0;
      this.frame[this.frameLength++]=Math.round(Math.max(-1,Math.min(1,sample))*32767);
      if(this.frameLength===320){this.acceptFrame();this.frameLength=0;}
    }
  }
  acceptFrame(){
    let sum=0,squares=0;for(const x of this.frame){sum+=x/32768;squares+=(x/32768)**2;}
    const rms=Math.sqrt(Math.max(0,squares/320-(sum/320)**2));
    // Bound adaptation so quiet speech remains audible after a long pause.
    const threshold=Math.max(.004,Math.min(.006,this.noise*1.5));
    const voiced=rms>=threshold;
    if(!this.started){
      if(!voiced){this.onset=0;this.noise=this.noise*.98+Math.min(rms,.006)*.02;this.preroll.set(this.frame,this.preIndex);this.preIndex=(this.preIndex+320)%this.preroll.length;return;}
      // Require 60ms of sustained activity, not six scattered handling clicks.
      this.onset++;
      if(this.onset<3){this.preroll.set(this.frame,this.preIndex);this.preIndex=(this.preIndex+320)%this.preroll.length;return;}
      this.voiced=640;
      this.samples.set(this.preroll.subarray(this.preIndex));this.samples.set(this.preroll.subarray(0,this.preIndex),this.preroll.length-this.preIndex);
      this.length=this.preroll.length;this.started=true;this.activity('start');this.preroll.fill(0);this.preIndex=0;
    }
    this.samples.set(this.frame,this.length);this.length+=320;
    if(voiced){this.voiced+=320;this.silence=0;}else this.silence+=320;
    const forced=this.length===this.samples.length;
    if(forced||this.silence>=this.pauseSamples){
      if(this.voiced>=1920)this.emit(this.samples.slice(0,this.length),{boundary:forced?'limit':'pause'});
      // Every emitted segment ends its capture state, including a forced limit.
      // A new onset starts capture again only when fresh voiced frames arrive.
      this.activity('end');
      const overlap=forced?this.samples.slice(this.length-this.preroll.length,this.length):null;
      this.samples.fill(0);this.length=0;this.voiced=0;this.silence=0;this.onset=0;this.started=false;
      if(overlap)this.preroll.set(overlap);
    }
  }
  clear(){this.samples.fill(0);this.preroll.fill(0);this.frame.fill(0);this.preIndex=0;this.frameLength=0;this.started=false;this.length=0;this.sum=0;this.count=0;this.phase=0;this.onset=0;this.voiced=0;this.silence=0;this.noise=.001;}
}
if(typeof AudioWorkletProcessor!=='undefined'){
  class CaptionPcmProcessor extends AudioWorkletProcessor{
    constructor(options){super();this.active=true;this.frames=0;this.inputFrames=0;this.signalFrames=0;this.port.postMessage({alive:true});this.segmenter=new PcmSegmenter(sampleRate,(samples,detail)=>this.port.postMessage({samples,...detail},[samples.buffer]),activity=>this.port.postMessage({activity}),options?.processorOptions);this.port.onmessage=()=>{this.active=false;this.segmenter.clear();};}
    process(inputs){if(!this.active)return false;const input=inputs[0]?.[0];if(input){this.inputFrames+=input.length;if(input.some(value=>Math.abs(value)>.0001))this.signalFrames+=input.length;this.segmenter.push(input);}if((this.frames+=(input?.length||128))>=sampleRate*2){this.frames=0;this.port.postMessage({alive:true,inputFrames:this.inputFrames,signalFrames:this.signalFrames});this.inputFrames=this.signalFrames=0;}return true;}
  }
  registerProcessor('caption-pcm',CaptionPcmProcessor);
}
