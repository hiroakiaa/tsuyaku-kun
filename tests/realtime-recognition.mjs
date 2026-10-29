import assert from 'node:assert/strict';
import {realtimePair,RealtimeUtterances} from '../web/realtime-protocol.js';
import {startRealtimeSession} from '../server/realtime-recognition.js';
import {budgetOperation,reserveCost} from '../server/ai-budget.js';
import {RECOGNITION_PRICE,AI_LIMITS} from '../web/cost-policy.js';
assert.deepEqual(realtimePair(['ja','en']),['ja','en']);for(const p of [[],['ja','vi'],['ja','en','pt'],['unknown'],null])assert.equal(realtimePair(p),null);
const out=[],uncertain=[],parser=new RealtimeUtterances(['ja','en'],r=>out.push(r),()=>uncertain.push(true));
const result=(text,language,start=0,extra={})=>({type:'Results',start,duration:1,is_final:true,speech_final:true,channel:{alternatives:[{transcript:text,confidence:.99,languages:language?[language]:[]}]},...extra});
parser.accept({...result('Do you like','en'),is_final:false});assert.equal(out.length,0);
parser.accept(result('Do you like','en',0,{speech_final:false}));parser.accept(result('Do you like','en',0,{speech_final:false}));parser.accept(result('math?','en',1));assert.equal(out[0].text,'Do you like math?');
parser.accept(result('math?','en',1));assert.equal(out.length,1);parser.accept(result('math?','en',3));assert.equal(out.length,2);
parser.accept(result('未確認','ru',4));parser.accept(result('Not guessed','',5));assert.equal(out.length,2);assert.equal(uncertain.length,2);
const db=new Map(),storage={get:async k=>structuredClone(db.get(k)),put:async(k,v)=>db.set(k,structuredClone(v)),transaction:async fn=>fn(storage)};
const now=Date.UTC(2026,9,30),cost=reserveCost(RECOGNITION_PRICE.streamModel,{seconds:15});let lease=await budgetOperation(storage,{action:'reserve',uid:'a',model:RECOGNITION_PRICE.streamModel,cost},now);
await budgetOperation(storage,{action:'extend',...lease,uid:'a',cost},now+1000);let status=await budgetOperation(storage,{action:'status',uid:'a'},now+1000);assert.equal(status.user.calls,1);assert.equal(status.inFlight,1);assert.equal(status.user.usedUSD,cost*2/1e6);assert.equal(status.user.limitUSD,AI_LIMITS.userUSD);
await assert.rejects(budgetOperation(storage,{action:'extend',...lease,uid:'other',cost},now+1000));
const monthly=await budgetOperation(storage,{action:'monthly',uid:'a'},now+1000);assert.equal(monthly.models[0].model,RECOGNITION_PRICE.streamModel);assert.equal(monthly.models[0].estimatedBeforeFreeUSD,cost*2/1e6);assert.equal(monthly.calls,1);
await budgetOperation(storage,{action:'settle',...lease,actual:1000},now+2000);assert.equal((await budgetOperation(storage,{action:'status',uid:'a'},now+2000)).user.usedUSD,.001);await assert.rejects(budgetOperation(storage,{action:'extend',...lease,uid:'a',cost},now+3000));
class Socket extends EventTarget{constructor(){super();this.sent=[];this.bufferedAmount=0;}accept(){}send(v){this.sent.push(v);}close(code=1000){this.closed=true;const e=new Event('close');e.code=code;this.dispatchEvent(e);}message(data){const e=new Event('message');e.data=data;this.dispatchEvent(e);}}
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
for(const scenario of ['valid','bad-auth','cancel-opening','renew-failure','burst','missing-language']){
 const client=new Socket(),provider=new Socket(),calls=[];let time=now,ai=0,options;const timers=new Map();let next=0,resolveProvider;
 const session=startRealtimeSession(client,{FIREBASE_PROJECT:'test',AI:{run:async(model,input,opts)=>{ai++;options={model,input,opts};if(scenario==='cancel-opening')await new Promise(r=>resolveProvider=r);return {webSocket:provider};}}},{candidates:['ja','en'],now:()=>time,setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;},clearTimer:id=>timers.delete(id),verifyToken:async token=>{if(scenario==='bad-auth')throw Error('bad');assert.equal(token,'synthetic');return {uid:'test',exp:(now+3600000)/1000};},aiFailure:e=>({reason:e.appBudget?'quota':'auth'}),callBudget:async data=>{calls.push(data);if(data.action==='extend'&&scenario==='renew-failure')throw Error('quota');return data.action==='reserve'?{id:'lease',day:1}:{ok:true};}});
 client.message(JSON.stringify({type:'auth',token:'synthetic'}));await flush();
 if(scenario==='bad-auth'){assert.equal(ai,0);await session.done;continue;}
 if(scenario==='cancel-opening'){session.close();resolveProvider();await flush();assert(provider.closed);assert.equal(calls.filter(c=>c.action==='settle').length,1);continue;}
 assert.equal(options.model,RECOGNITION_PRICE.streamModel);assert.equal(options.input.language,'multi');assert.equal(options.opts.websocket,true);assert(client.sent.some(x=>JSON.parse(x).type==='ready'));
 time+=100;client.message(new ArrayBuffer(3200));assert.equal(provider.sent.filter(x=>x instanceof ArrayBuffer).length,1);
 if(scenario==='renew-failure'){const timer=[...timers.values()].find(t=>t.delay===9000);time=now+9000;await timer.fn();await flush();assert(client.closed);assert.equal(calls.at(-1).actual,undefined);continue;}
 if(scenario==='burst'){for(let i=0;i<34;i++)client.message(new ArrayBuffer(3200));assert(client.closed);assert(client.sent.some(x=>typeof x==='string'&&JSON.parse(x).code==='overloaded'));continue;}
 provider.message(JSON.stringify(result('Hello.',scenario==='missing-language'?'':'en')));assert(client.sent.some(x=>JSON.parse(x).type===(scenario==='missing-language'?'uncertain':'result')));
 client.message(JSON.stringify({type:'stop'}));await session.done;assert(provider.closed);assert(calls.at(-1).actual>0);
}
console.log('PASS realtime ASR: language limits, final-only utterances, duplicate suppression, unknown languages, one renewable budget slot, monthly accounting, auth, cancellation, quota failure and bounded audio');

const {createRealtimeRecognition}=await import('../web/realtime-recognition.js');
for(const scenario of ['complete','provider-error','queue-bound']){
 let node,ws,released=0,unknown=0,usage=0,results=0,errors=0;class C{constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};}resume(){return Promise.resolve();}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class W{constructor(){node=this;this.port={postMessage(){},onmessage:null};}connect(){}disconnect(){}}
 class S{constructor(){ws=this;this.readyState=0;this.bufferedAmount=0;this.sent=[];}send(v){this.sent.push(v instanceof ArrayBuffer?v.slice(0):v);}close(){this.readyState=3;}open(){this.readyState=1;this.onopen?.();}message(value){this.onmessage?.({data:JSON.stringify(value)});}}
 const Factory=createRealtimeRecognition({endpoint:'wss://example.test/transcribe-stream',candidates:['ja','en'],getStream:()=>({getAudioTracks:()=>[{enabled:true,readyState:'live'}]}),getToken:async()=>'synthetic',acquireSlot:async()=>()=>{released++;},onUsage:n=>usage+=n,onUnmeasured:()=>unknown++,Context:C,Worklet:W,Socket:S});
 const rec=new Factory();rec.onresult=e=>{results++;assert.equal(e.language,'en');assert.equal(e.results[e.resultIndex].isFinal,true);};rec.onerror=()=>errors++;rec.start();await flush();ws.open();
 const voice=()=>{const samples=Int16Array.from({length:1600},(_,i)=>i%2?1500:-1500);node.port.onmessage({data:samples});return samples;};voice();assert.equal(usage,0);
 if(scenario==='queue-bound'){for(let i=0;i<30;i++)voice();assert.equal(errors,1);assert.equal(released,1);assert.equal(unknown,1);continue;}
 ws.message({type:'ready'});assert.equal(usage,.1);assert.equal(released,0);assert.equal(rec.pending.length,0);assert(ws.sent.some(v=>v instanceof ArrayBuffer));
 if(scenario==='provider-error'){ws.message({type:'error',code:'quota'});assert.equal(errors,1);assert.equal(unknown,1);assert.equal(released,1);continue;}
 const final={type:'result',id:0,language:'en',text:'Hello.',final:true};ws.message(final);ws.message(final);assert.equal(results,1);rec.abort();assert.equal(released,1);assert.equal(unknown,0);assert.equal(rec.node.port.onmessage,null);
}
console.log('PASS realtime client: bounded startup audio, one held AI slot, final-only deduplication, observed stream usage, unknown failure cost and synchronous abort');
