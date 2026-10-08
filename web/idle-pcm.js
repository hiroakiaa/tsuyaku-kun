// Observe energy only: retain no audio and send no audio off-device.
class IdleActivity extends AudioWorkletProcessor{
 constructor(){super();this.frames=0;this.last=0;}
 process(inputs){const samples=inputs[0]?.[0];if(!samples)return true;let energy=0;for(const value of samples)energy+=value*value;const voiced=Math.sqrt(energy/samples.length)>.01;this.frames=voiced?this.frames+1:0;if(this.frames>=10&&currentTime-this.last>=1){this.last=currentTime;this.port.postMessage(true);}return true;}
}
registerProcessor('idle-activity',IdleActivity);
