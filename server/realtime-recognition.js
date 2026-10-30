import {realtimePair,RealtimeUtterances} from '../web/realtime-protocol.js';
import {reserveCost,budgetError} from './ai-budget.js';
import {RECOGNITION_PRICE} from '../web/cost-policy.js';
const SLICE=15;
async function budgetCall(env,data){if(!env.ROOMS)throw budgetError();const stub=env.ROOMS.get(env.ROOMS.idFromName('__ai_budget_v1__')),r=await stub.fetch(new Request('https://budget/budget',{method:'POST',body:JSON.stringify(data)})),value=await r.json();if(!r.ok)throw budgetError(value.reason);return value;}
export function startRealtimeSession(socket,env,{candidates,verifyToken,aiFailure,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,callBudget=data=>budgetCall(env,data),waitUntil=()=>{}}={}){
 socket.binaryType='arraybuffer';
 let state='auth',upstream,lease,uid,startedAt,providerCalled=false,sentBytes=0,reservedSeconds=0,renewTimer,deadlineTimer,lifetimeTimer,openingTimer,inputTimer;const pair=realtimePair(candidates);let resolveDone;const done=new Promise(r=>resolveDone=r);
 const send=value=>{if(state!=='closed')try{socket.send(JSON.stringify(value));}catch{}};
 const close=(reason=null)=>{
  if(state==='closed')return;const previous=state;if(reason)send({type:'error',code:reason});state='closed';for(const timer of [renewTimer,deadlineTimer,lifetimeTimer,openingTimer,inputTimer,authTimer])clearTimer(timer);
  try{if(upstream){upstream.send(JSON.stringify({type:'CloseStream'}));upstream.close(1000,'finished');}}catch{}
  try{socket.close(reason?1011:1000,'finished');}catch{}
  // Unknown connection failures retain their reservation, never claim a free call.
  const seconds=providerCalled&&previous==='ready'?Math.min(reservedSeconds,Math.max(sentBytes/32000,(now()-startedAt)/1000)):null;
  const actual=!providerCalled?0:reason?undefined:Number.isFinite(seconds)?Math.ceil(seconds/60*RECOGNITION_PRICE.streamPerMinute*1e6):undefined;
  const settlement=Promise.resolve(lease?callBudget({action:'settle',...lease,...(actual!==undefined?{actual}:{})}):null).catch(()=>{}).finally(resolveDone);waitUntil(settlement);
 };
 const meter=new RealtimeUtterances(pair||[],r=>send({type:'result',...r}),reason=>send({type:'uncertain',reason}));
 const inputDeadline=()=>{clearTimer(inputTimer);inputTimer=setTimer(()=>close('timeout'),5000);};
 const arm=()=>{
  clearTimer(deadlineTimer);deadlineTimer=setTimer(()=>close('quota'),Math.max(0,startedAt+reservedSeconds*1000-now()));
  clearTimer(renewTimer);renewTimer=setTimer(async()=>{
   if(state!=='ready')return;try{await callBudget({action:'extend',...lease,uid,cost:reserveCost(RECOGNITION_PRICE.streamModel,{seconds:SLICE})});if(state!=='ready')return;reservedSeconds+=SLICE;arm();}catch{close('quota');}
  },Math.max(0,startedAt+(reservedSeconds-6)*1000-now()));
 };
 const authTimer=setTimer(()=>close('auth'),8000);
 socket.addEventListener('message',event=>{
  if(state==='closed')return;
  if(state==='auth'){
   if(typeof event.data!=='string'||event.data.length>10000){close('auth');return;}let input;try{input=JSON.parse(event.data);}catch{close('auth');return;}
   if(input?.type!=='auth'||typeof input.token!=='string'||!pair){close('auth');return;}
   state='opening';clearTimer(authTimer);openingTimer=setTimer(()=>close('timeout'),8000);
   waitUntil((async()=>{try{
    const auth=await verifyToken(input.token,env.FIREBASE_PROJECT);input.token='';if(state==='closed')return;uid=auth.uid;
    if(env.REQUEST_LIMIT&&!((await env.REQUEST_LIMIT.limit({key:'stream-user:'+uid})).success))throw budgetError();
    lease=await callBudget({action:'reserve',uid,model:RECOGNITION_PRICE.streamModel,cost:reserveCost(RECOGNITION_PRICE.streamModel,{seconds:SLICE})});
    if(state==='closed'){await callBudget({action:'settle',...lease,actual:0}).catch(()=>{});return;}
    startedAt=now();reservedSeconds=SLICE;providerCalled=true;
    const response=await env.AI.run(RECOGNITION_PRICE.streamModel,{encoding:'linear16',sample_rate:'16000',channels:'1',language:pair.length>1?'multi':pair[0],interim_results:'true',vad_events:'true',endpointing:'300',utterance_end_ms:'1000',punctuate:'true',smart_format:'true'},{websocket:true});
    const ws=response?.webSocket;if(!ws)throw Error('Streaming recognition unavailable');ws.accept();
    if(state==='closed'){ws.close(1000,'cancelled');return;}upstream=ws;state='ready';clearTimer(openingTimer);
    upstream.addEventListener('message',event=>{if(state!=='ready'||typeof event.data!=='string'||event.data.length>64000)return;let data;try{data=JSON.parse(event.data);}catch{return;}if(data.type==='Error'){close('service');return;}if(data.type==='SpeechStarted')send({type:'activity',phase:'capturing'});meter.accept(data);});
    upstream.addEventListener('close',event=>{if(state==='ready')meter.flush();close([1000,1001].includes(event.code)?null:'service');});upstream.addEventListener('error',()=>close('service'));
    lifetimeTimer=setTimer(()=>close('session_limit'),Math.min(120000,Number.isFinite(auth.exp)?Math.max(0,auth.exp*1000-now()):120000));arm();inputDeadline();send({type:'ready',model:'nova-3',languages:pair});
   }catch(error){close(aiFailure?.(error)?.reason||'service');}})());return;
  }
  if(state!=='ready'){close('input');return;}
  if(typeof event.data==='string'){
   if(event.data.length>64){close('input');return;}let data;try{data=JSON.parse(event.data);}catch{close('input');return;}if(data?.type==='stop'){meter.flush();close();}else if(data?.type==='ping')send({type:'pong'});else close('input');return;
  }
  if(!(event.data instanceof ArrayBuffer)||!event.data.byteLength||event.data.byteLength>6400||event.data.byteLength%2){close('input');return;}
  const nextBytes=sentBytes+event.data.byteLength;
  if(now()>=startedAt+reservedSeconds*1000||nextBytes>reservedSeconds*32000){close('quota');return;}
  if(nextBytes>Math.max(0,now()-startedAt)/1000*32000+96000||upstream.bufferedAmount>64000){close('overloaded');return;}
  sentBytes=nextBytes;inputDeadline();try{upstream.send(event.data);}catch{close('service');}
 });
 socket.addEventListener('close',event=>close([1000,1001].includes(event.code)?null:'service'));socket.addEventListener('error',()=>close('service'));
 return {done,close};
}
export async function realtimeUpgrade(request,env,{verifyToken,aiFailure,ctx,Pair=globalThis.WebSocketPair}={}){
 if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 const url=new URL(request.url),candidates=(url.searchParams.get('languages')||'').split(',');if(!realtimePair(candidates))return new Response('Unsupported language pair',{status:400});
 if(env.REQUEST_LIMIT&&!((await env.REQUEST_LIMIT.limit({key:'stream-ip:'+(request.headers.get('CF-Connecting-IP')||'local')})).success))return new Response('Try later',{status:429});
 const pair=new Pair(),client=pair[0],server=pair[1];server.accept();startRealtimeSession(server,env,{candidates,verifyToken,aiFailure,waitUntil:p=>ctx?.waitUntil?.(p)});return new Response(null,{status:101,webSocket:client});
}
