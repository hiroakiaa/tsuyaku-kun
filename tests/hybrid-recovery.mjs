import assert from 'node:assert/strict';
import {FreshAudioWindow,createRealtimeRecovery} from '../web/realtime-recovery.js';
import {createRealtimeRecognition} from '../web/realtime-recognition.js';
const now=Date.now(),voice=()=>Int16Array.from({length:1600},(_,i)=>i%2?800:-800),audio=new FreshAudioWindow();
for(let i=0;i<100;i++)audio.push(voice(),now-10000+(i+1)*100);const old=audio.frames[0].samples;audio.push(voice(),now+100);assert(old.every(v=>v===0));
assert.equal(audio.take(0,.5,now),null);assert.equal(audio.take(1,8,now),null);assert.equal(audio.take(1,2,now),null);const clip=audio.take(9,10,now);assert(clip.samples.length<=96000);assert(clip.speechEndedAt<=now+100);audio.clear();assert.equal(audio.frames.length,0);
for(const scenario of ['valid','filtered','unknown','quota']){
 let calls=0,releases=0,usage=0,unknown=0;const controller=new AbortController();
 const recover=createRealtimeRecovery({endpoint:'https://test/transcribe',getToken:async()=>'synthetic',acquireSlot:async()=>()=>releases++,onUsage:s=>usage+=s,onUnmeasured:()=>unknown++,fetcher:async(url,options)=>{calls++;assert.match(url,/language=auto&languages=ja%2Cen/);assert.match(url,/profile=beam1/);assert.equal(options.method,'POST');assert.equal(options.body.byteLength,clip.samples.length*2+44);if(scenario==='unknown')throw Error('network');return {ok:scenario!=='quota',status:scenario==='quota'?429:200,json:async()=>scenario==='quota'?{aiFailure:{reason:'quota'}}:{text:'Please wait. Please wait.',language:'en',languageUncertain:scenario==='filtered'}};}});
 if(['unknown','quota'].includes(scenario))await assert.rejects(recover({...clip,speechEndedAt:Date.now(),signal:controller.signal,candidates:['ja','en']}));else{const result=await recover({...clip,speechEndedAt:Date.now(),signal:controller.signal,candidates:['ja','en']});assert.equal(result?.text,scenario==='valid'?'Please wait. Please wait.':undefined);}
 assert.equal(calls,1);assert.equal(releases,1);assert(usage>0);assert.equal(unknown,scenario==='unknown'?1:0);
 await recover({...clip,speechEndedAt:Date.now()-5000,signal:controller.signal,candidates:['ja','en']});assert.equal(calls,1,'stale audio never creates another request');
}
clip.samples.fill(0);
const onset=new FreshAudioWindow();for(let i=0;i<10;i++)onset.push(voice(),now-1000+(i+1)*100);const providerOnly=onset.take(.5,.8,now),withOnset=onset.take(.5,.8,now,now-900);assert(withOnset.speechStartedAt<providerOnly.speechStartedAt,'local onset retains audio before late provider word time');assert(withOnset.samples.length>providerOnly.samples.length);providerOnly.samples.fill(0);withOnset.samples.fill(0);onset.clear();
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
for(const scenario of ['order','cancel','cap']){
 let node,ws,finish,calls=0,uncertain=0,recoverySamples;const delivered=[];
 class C{constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};}resume(){return Promise.resolve();}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class W{constructor(){node=this;this.port={postMessage(){}};}connect(){}disconnect(){}}
 class S{constructor(){ws=this;this.readyState=0;this.bufferedAmount=0;}send(){}close(){this.readyState=3;}message(data){this.onmessage?.({data:JSON.stringify(data)});}}
 const F=createRealtimeRecognition({endpoint:'wss://test',candidates:['ja','en'],getStream:()=>({getAudioTracks:()=>[{enabled:true,readyState:'live'}]}),getToken:async()=>'synthetic',recoverAudio:async data=>{calls++;recoverySamples=data.samples;if(scenario==='cap')return {text:'Hello.',language:'en'};return new Promise(resolve=>finish=resolve);},Context:C,Worklet:W,Socket:S});const r=new F();r.onresult=e=>delivered.push(e.resultIndex);r.onlanguageuncertain=()=>uncertain++;r.start();await flush();ws.readyState=1;ws.onopen();ws.message({type:'ready'});for(let i=0;i<10;i++)node.port.onmessage({data:voice()});
 const unsure=id=>ws.message({type:'uncertain',id,audioStart:.1,audioEnd:.8,reason:'language_outside'});unsure(0);await flush();
 if(scenario==='cap'){for(let i=1;i<4;i++){unsure(i);await flush();}assert.equal(calls,3);assert.equal(uncertain,1);r.abort();continue;}
 ws.message({type:'result',id:1,text:'Later.',language:'en',final:true});assert.deepEqual(delivered,[]);
 if(scenario==='cancel'){r.abort();assert(recoverySamples.every(v=>v===0));finish({text:'Hello.',language:'en'});await flush();assert.deepEqual(delivered,[]);assert.equal(r.audio.frames.length,0);continue;}
 finish({text:'Hello.',language:'en'});await flush();assert.deepEqual(delivered,[0,1]);assert(recoverySamples.every(v=>v===0));r.abort();
}
console.log('PASS hybrid recovery: fresh bounded audio only, one check, actual repetition preserved, usage and unknown cost, source order, three-check cap and cancellation wipe');
