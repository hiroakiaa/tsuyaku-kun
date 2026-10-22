// Pure helpers: no speech, names or credentials are persisted here.
export function microphoneHelp(error){
 if(['NotAllowedError','SecurityError'].includes(error?.name))return 'マイクが許可されていません。ブラウザーのサイト設定でマイクを許可してから、もう一度押してください。文字入力でも伝えられます。';
 if(error?.name==='NotFoundError')return 'マイクが見つかりません。接続機器を確認してください。文字入力でも伝えられます。';
 if(['NotReadableError','AbortError'].includes(error?.name))return 'マイクを使えません。他のアプリの録音を止め、イヤホンの接続を確認してから押し直してください。';
 return error?.name==='TimeoutError'?error.message:'マイクを開始できません。許可・接続機器を確認してください。文字入力でも伝えられます。';
}
export function safeSocketSend(socket,data){try{if(socket?.readyState!==1||(socket.bufferedAmount||0)>262144)return false;socket.send(JSON.stringify(data));return true;}catch{return false;}}
export function splitRecognizedText(text,limit=1000){const parts=[];let rest=text.trim();while(rest.length>limit){let end=limit;if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;const boundary=Math.max(rest.lastIndexOf('。',end-1),rest.lastIndexOf(' ',end-1),rest.lastIndexOf('\n',end-1));if(boundary>end/2)end=boundary+1;parts.push(rest.slice(0,end));rest=rest.slice(end);}if(rest)parts.push(rest);return parts;}
export function participantLabel(name,id){return name+' · '+String(id||'').slice(-6);}
