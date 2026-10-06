export function acquireMicrophone(getMedia,isCurrent,{timeoutMs=15000}={}){
 return new Promise((resolve,reject)=>{let settled=false;const finish=(error,stream)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(stream);};const timer=setTimeout(()=>finish(Object.assign(Error('マイクの応答がありません。ブラウザーの許可画面を確認してください。'),{name:'TimeoutError'})),timeoutMs);
 Promise.resolve().then(getMedia).then(stream=>{if(settled||!isCurrent()){stream.getTracks().forEach(t=>t.stop());if(!settled)finish(Object.assign(Error('マイクの開始を取り消しました。'),{name:'AbortError'}));return;}finish(null,stream);},error=>finish(error));
 });
}
