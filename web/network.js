const STAGES=new Set(['api','auth','turn','api_simple','api_headers']);
const OPERATIONS=new Set(['room_create','lesson_join','catalog','dictionary_translate','dictionary_candidate','token','initial_auth','turn_credentials','health','other']);
const RESULTS=new Set(['ok','network_or_cors','timeout','http_error','invalid_response','auth_unavailable','no_turn_server']);
export function connectionFailure(error,{stage='api',endpoint='',operation='other',status}={}){
 const code=error?.code&&RESULTS.has(error.code)?error.code:error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':Number.isInteger(status)?'http_error':'network_or_cors';
 const subject=stage==='auth'?'参加の認証':stage==='turn'?'音声中継サーバー':'字幕・翻訳サーバー';
 const explanation=code==='timeout'?'への接続が時間内に完了しませんでした。':code==='invalid_response'?'からアプリ用の応答を受け取れませんでした。':code==='http_error'?'が通信を受け付けませんでした（HTTP '+status+'）。':'に接続できませんでした。';
 return Object.assign(new Error(subject+explanation+'「接続を確認」で診断できます。'),{connectionIssue:true,connection:{stage,endpoint,operation,code,...(Number.isInteger(status)?{status}:{})}});
}
export function safeConnectionRecord(value){
 let endpoint='';try{const u=new URL(value.endpoint);if(['https:','http:'].includes(u.protocol))endpoint=u.origin;}catch{}
 return {at:Number.isFinite(value.at)?value.at:Date.now(),stage:STAGES.has(value.stage)?value.stage:'api',operation:OPERATIONS.has(value.operation)?value.operation:'other',code:RESULTS.has(value.code)?value.code:'network_or_cors',endpoint,...(Number.isInteger(value.status)&&value.status>=100&&value.status<=599?{status:value.status}:{}),...(Number.isFinite(value.elapsedMs)&&value.elapsedMs>=0?{elapsedMs:Math.round(value.elapsedMs)}:{}),...(typeof value.online==='boolean'?{online:value.online}:{})};
}
export class ConnectionDiary{
 constructor(storage){this.storage=storage;this.key='tsuyaku-connection-v1';}
 list(){try{const rows=JSON.parse(this.storage.getItem(this.key)||'[]');return Array.isArray(rows)?rows.slice(-50).map(safeConnectionRecord):[];}catch{return [];}}
 add(value){const record=safeConnectionRecord(value);try{this.storage.setItem(this.key,JSON.stringify([...this.list(),record].slice(-50)));}catch{}return record;}
}
export async function requestJson(url,options={}, {fetcher=fetch,stage='api',operation='other',onFailure=()=>{}}={}){
 let response;
 try{response=await fetcher(url,options);}catch(error){const failure=connectionFailure(error,{stage,endpoint:url,operation});onFailure(failure.connection);throw failure;}
 let result;
 try{result=await response.json();}catch{const failure=connectionFailure({code:'invalid_response'},{stage,endpoint:url,operation,status:response.status});onFailure(failure.connection);throw failure;}
 if(!response.ok||result.error)throw Object.assign(Error(result.error||'接続先が応答しました（HTTP '+response.status+'）。'),{usage:result.usage,latencyMs:result.latencyMs,httpStatus:response.status});
 return result;
}
export async function probeNetwork(api,{fetcher=fetch,now=()=>Date.now()}={}){
 return Promise.all(['api_simple','api_headers'].map(async stage=>{
 const started=now(),url=api+'/health',options={method:stage==='api_simple'?'GET':'POST',signal:AbortSignal.timeout(8000),referrerPolicy:'no-referrer',...(stage==='api_headers'?{headers:{Authorization:'Bearer connectivity-check','Content-Type':'application/json'},body:'{}'}:{})};
 let response;
 try{response=await fetcher(url,options);let valid=false;try{const data=await response.json();valid=data.ok===true&&data.app==='通訳君';}catch{}return safeConnectionRecord({stage,operation:'health',endpoint:url,code:!response.ok?'http_error':valid?'ok':'invalid_response',status:response.status,elapsedMs:now()-started});}
 catch(error){return safeConnectionRecord({...connectionFailure(error,{stage,endpoint:url,operation:'health'}).connection,elapsedMs:now()-started});}
 }));
}
