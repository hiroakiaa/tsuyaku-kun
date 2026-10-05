export function createStreamingRecognition({endpoint,getStream,getToken,
  Context=window.AudioContext||window.webkitAudioContext,Worklet=window.AudioWorkletNode,Socket=window.WebSocket}) {
  return class StreamingRecognition {
    start(){
      this.active=true;
      try{
        this.stream=getStream();
        if(!this.stream?.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'))throw Error('microphone');
        this.context=new Context();const resumed=this.context.resume();
        this.timeout=setTimeout(()=>this.fail('network'),15000);
        void this.connect(resumed);
      }catch(_){this.fail('audio-capture')}
    }
    async connect(resumed){
      try{
        await resumed;const token=await getToken();if(!this.active)return;
        this.socket=new Socket(endpoint);
        this.socket.onopen=()=>{if(this.active)this.socket.send(JSON.stringify({token}))};
        this.socket.onmessage=event=>{if(this.active)void this.message(event)};
        this.socket.onerror=()=>this.fail('network');
        this.socket.onclose=()=>{if(this.active){this.abort();this.onend?.()}};
      }catch(_){if(this.active)this.fail('network')}
    }
    async message(event){
      try{
        const data=JSON.parse(event.data);
        if(data.type==='error'){this.fail(data.error);return}
        if(data.type==='ready'){
          if(this.preparing)return;this.preparing=true;
          await this.context.audioWorklet.addModule(new URL('./caption-stream-pcm.js',import.meta.url));
          if(!this.active)return;
          this.source=this.context.createMediaStreamSource(this.stream);this.node=new Worklet(this.context,'caption-stream-pcm');
          this.node.port.onmessage=event=>{
            if(!this.active)return;
            if(this.socket.readyState!==1||this.socket.bufferedAmount>64000){this.fail('overloaded');return}
            this.socket.send(event.data.buffer);event.data.fill(0);
          };
          this.source.connect(this.node);this.node.connect(this.context.destination);
          this.context.onstatechange=()=>{if(this.active&&this.context.state!=='running')this.fail('interrupted')};
          if(this.context.state!=='running'){this.fail('interrupted');return}
          clearTimeout(this.timeout);this.onstart?.();return;
        }
        if(data.type==='result'&&Number.isSafeInteger(data.id)&&data.id>=0&&typeof data.text==='string'&&typeof data.final==='boolean'){
          const result=[{transcript:data.text.slice(0,600)}];result.isFinal=data.final;
          this.onresult?.({resultIndex:data.id,results:{length:data.id+1,[data.id]:result}});
        }
      }catch(_){if(this.active)this.fail('network')}
    }
    fail(error){if(!this.active)return;this.abort();this.onerror?.({error})}
    abort(){
      this.active=false;clearTimeout(this.timeout);
      if(this.socket){this.socket.onopen=this.socket.onmessage=this.socket.onerror=this.socket.onclose=null;try{this.socket.close()}catch(_){}}
      if(this.node){this.node.port.onmessage=null;this.node.port.postMessage('stop');this.node.disconnect()}
      this.source?.disconnect();
      if(this.context){this.context.onstatechange=null;void this.context.close().catch(()=>{})}
      this.stream=null;
    }
  };
}
