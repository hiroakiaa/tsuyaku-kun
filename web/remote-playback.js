// A received WebRTC track must be played explicitly; autoplay may require a tap.
export function remotePlayback({audio,button,valid=()=>true,onBlocked=()=>{},onReady=()=>{}}){
 let attempt=0;audio.autoplay=true;audio.muted=false;audio.setAttribute('playsinline','');button.type='button';button.hidden=true;
 const play=()=>{if(!valid()||!audio.srcObject)return Promise.resolve(false);const version=++attempt;audio.muted=false;let promise;try{promise=audio.play();}catch(e){promise=Promise.reject(e);}return Promise.resolve(promise).then(()=>{if(version!==attempt||!valid())return false;button.hidden=true;onReady();return true;},()=>{if(version===attempt&&valid()){button.hidden=false;onBlocked();}return false;});};
 button.onclick=play;return {play};
}
