// Remove only an extremely quiet tail already classified as a natural pause.
// Keep 200ms of context, all leading context, and at least 500ms of total audio.
export function trimmedAudioLength(samples,boundary){
 if(boundary!=='pause'||!(samples instanceof Int16Array)||samples.length<8000)return samples.length;
 let quiet=0;
 for(let end=samples.length;end>=320&&quiet<8000;end-=320){
  let sum=0,squares=0;for(let at=end-320;at<end;at++){const x=samples[at]/32768;sum+=x;squares+=x*x;}
  if(Math.sqrt(Math.max(0,squares/320-(sum/320)**2))>=.001)break;
  quiet+=320;
 }
 return Math.max(8000,samples.length-Math.max(0,quiet-3200));
}
