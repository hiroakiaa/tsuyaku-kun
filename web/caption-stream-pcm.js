// 100ms PCM packets. No recording or speech-sized accumulation.
export class StreamingPcm {
  constructor(rate, emit) { this.rate=rate;this.emit=emit;this.buffer=new Int16Array(1600);this.length=0;this.phase=0;this.sum=0;this.count=0; }
  push(input) {
    for(const value of input) {
      this.sum+=value;this.count++;this.phase+=16000;
      if(this.phase<this.rate)continue;
      this.phase-=this.rate;
      this.buffer[this.length++]=Math.round(Math.max(-1,Math.min(1,this.sum/this.count))*32767);this.sum=0;this.count=0;
      if(this.length===1600){this.emit(this.buffer.slice());this.buffer.fill(0);this.length=0;}
    }
  }
  clear(){this.buffer.fill(0);this.length=0;this.phase=0;this.sum=0;this.count=0;}
}
if(typeof AudioWorkletProcessor!=='undefined') {
  class StreamProcessor extends AudioWorkletProcessor {
    constructor(){super();this.active=true;this.pcm=new StreamingPcm(sampleRate,samples=>this.port.postMessage(samples,[samples.buffer]));this.port.onmessage=()=>{this.active=false;this.pcm.clear()};}
    process(inputs){if(!this.active)return false;if(inputs[0]?.[0])this.pcm.push(inputs[0][0]);return true;}
  }
  registerProcessor('caption-stream-pcm',StreamProcessor);
}
