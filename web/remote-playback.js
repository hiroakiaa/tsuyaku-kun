// An accepted stream is not proof of playback. Expose a tap recovery if play fails or stalls.
export function remotePlayback({audio,button,valid=()=>true,onBlocked=()=>{},onReady=()=>{},delay=setTimeout,cancel=clearTimeout}){
 let attempt=0;audio.autoplay=true;audio.muted=false;audio.setAttribute('playsinline','');button.type='button';button.hidden=true;
 const play=()=>{if(!valid()||!audio.srcObject)return Promise.resolve(false);const version=++attempt;audio.muted=false;return new Promise(resolve=>{let settled=false;const finish=ok=>{if(settled)return;settled=true;cancel(timer);if(version!==attempt||!valid()){resolve(false);return;}button.hidden=ok;ok?onReady():onBlocked();resolve(ok);};const timer=delay(()=>finish(false),5000);timer?.unref?.();try{Promise.resolve(audio.play()).then(()=>finish(true),()=>finish(false));}catch{finish(false);}});};
 button.onclick=play;return {play};
}
