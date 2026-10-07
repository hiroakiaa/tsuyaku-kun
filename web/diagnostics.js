// First audible frame estimate; no audio is retained.
export function firstVoicedAt(samples,receivedAt,rate=16000){
 for(let start=0;start<samples.length;start+=160){const end=Math.min(start+160,samples.length);let power=0;for(let i=start;i<end;i++)power+=(samples[i]/32768)**2;if(power/(end-start)>.004**2)return receivedAt-(samples.length-start)/rate*1000;}
 return null;
}
// Estimate the last audible sample in the already captured PCM; retain no audio.
export function lastVoicedAt(samples,receivedAt,rate=16000){
 let last=-1;for(let start=0;start<samples.length;start+=160){const end=Math.min(start+160,samples.length);let power=0;for(let i=start;i<end;i++)power+=(samples[i]/32768)**2;if(power/(end-start)>.004**2)last=end;}
 return last<0?null:receivedAt-(samples.length-last)/rate*1000;
}
export function latencyFromTiming(timing,displayedAt){
 if(!timing||!Number.isFinite(timing.sentAt)||displayedAt<timing.sentAt)return null;
 const result={kind:timing.kind,pipelineMs:displayedAt-timing.sentAt};
 if(timing.kind==='speech'&&Number.isFinite(timing.speechEndedAt)&&Number.isFinite(timing.recognitionReadyAt)&&timing.speechEndedAt<=timing.recognitionReadyAt&&timing.recognitionReadyAt<=displayedAt){result.recognitionMs=timing.recognitionReadyAt-timing.speechEndedAt;result.totalMs=displayedAt-timing.speechEndedAt;result.basis='local_pcm_energy_estimate';if(timing.revision===0&&Number.isFinite(timing.speechStartedAt)&&timing.speechStartedAt<=timing.speechEndedAt)result.firstDisplayMs=displayedAt-timing.speechStartedAt;}
 return result;
}
export function retryDelay(attempt,random=Math.random){return Math.min(15000,1000*2**Math.min(4,Math.max(0,attempt-1)))+Math.floor(random()*500);}
