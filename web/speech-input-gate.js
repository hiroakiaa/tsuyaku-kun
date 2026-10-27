// The microphone's ON intent is kept while recognition waits for playback.
export function createSpeechInputGate({capture,valid,suspend,resume,onWaiting=()=>{},schedule=setTimeout,cancel=clearTimeout,tailMs=400}){
 let token=null,timer=null,waiting=false;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 const drop=()=>{clear();token=null;if(waiting){waiting=false;onWaiting(false);}};
 function begin(){clear();if(token&&!valid(token))drop();if(!token)token=capture();if(!token||!valid(token)){drop();return;}if(!waiting){waiting=true;suspend();onWaiting(true);}}
 function sync(playing){if(!token)return;if(!valid(token)){drop();return;}if(playing){clear();return;}if(timer!==null)return;timer=schedule(()=>{timer=null;const previous=token,allowed=previous&&valid(previous);token=null;waiting=false;onWaiting(false);if(allowed)resume();},tailMs);}
 return {begin,sync,cancel:drop,get waiting(){return waiting;}};
}
