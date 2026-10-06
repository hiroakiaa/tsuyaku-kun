// 20 ms RMS frames avoid treating every waveform zero crossing as silence.
// Audio stays in bounded memory only; natural pauses do not duplicate billing.
export class PcmSegmenter {
  constructor(rate, emit) {
    this.rate=rate;this.emit=emit;this.samples=new Int16Array(64000);
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
    const threshold=Math.max(.004,Math.min(.018,this.noise*2.5));
    const voiced=rms>=threshold;
    if(!this.started){
      if(!voiced){this.noise=this.noise*.98+Math.min(rms,.006)*.02;this.preroll.set(this.frame,this.preIndex);this.preIndex=(this.preIndex+320)%this.preroll.length;return;}
      this.samples.set(this.preroll.subarray(this.preIndex));this.samples.set(this.preroll.subarray(0,this.preIndex),this.preroll.length-this.preIndex);
      this.length=this.preroll.length;this.started=true;this.preroll.fill(0);this.preIndex=0;
    }
    this.samples.set(this.frame,this.length);this.length+=320;
    if(voiced){this.voiced+=320;this.silence=0;}else this.silence+=320;
    const forced=this.length===this.samples.length;
    if(forced||this.silence>=5120){
      if(this.voiced>=1920)this.emit(this.samples.slice(0,this.length));
      const overlap=forced?this.samples.slice(this.length-this.preroll.length,this.length):null;
      this.samples.fill(0);this.length=0;this.voiced=0;this.silence=0;this.started=false;
      if(overlap)this.preroll.set(overlap);
    }
  }
  clear(){this.samples.fill(0);this.preroll.fill(0);this.frame.fill(0);this.preIndex=0;this.frameLength=0;this.started=false;this.length=0;this.sum=0;this.count=0;this.phase=0;this.voiced=0;this.silence=0;this.noise=.001;}
}
if(typeof AudioWorkletProcessor!=='undefined'){
  class CaptionPcmProcessor extends AudioWorkletProcessor{
    constructor(){super();this.active=true;this.segmenter=new PcmSegmenter(sampleRate,samples=>this.port.postMessage(samples,[samples.buffer]));this.port.onmessage=()=>{this.active=false;this.segmenter.clear();};}
    process(inputs){if(!this.active)return false;if(inputs[0]?.[0])this.segmenter.push(inputs[0][0]);return true;}
  }
  registerProcessor('caption-pcm',CaptionPcmProcessor);
}
