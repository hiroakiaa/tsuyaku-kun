import assert from 'node:assert/strict';
import {createServerRecognition} from '../web/caption-server.js';
import {recentSessionEvents,explainConnection,safeConnectionRecord} from '../web/network.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
const audio=()=>({samples:new Int16Array(16000).fill(123),at:Date.now(),boundary:'pause'});
function fixture(options={}){
 const requests=[],out=[],diagnostics=[];let usage=0;
 const R=createServerRecognition({endpoint:'https://test/transcribe?language=en',getStream:()=>null,getToken:async()=>'',onUsage:n=>usage+=n,onDiagnostic:d=>diagnostics.push(d),fetcher:(_,o)=>new Promise((resolve,reject)=>{requests.push({signal:o.signal,body:o.body,resolve:text=>resolve({ok:true,status:200,json:async()=>({text})}),reject});o.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')));}),...options});
 const r=new R();r.active=true;r.onresult=e=>out.push(e.results[e.resultIndex][0].transcript);return {r,requests,out,diagnostics,usage:()=>usage};
}
{
 const f=fixture();f.r.queue.push(audio(),audio(),audio());const pending=f.r.drain();await tick();assert.equal(f.requests.length,2);
 f.requests[1].resolve('Second.');await tick();assert.deepEqual(f.out,[]);assert.equal(f.requests.length,2,'completed responses occupy slots');
 f.requests[0].resolve('First.');await pending;await tick();assert.deepEqual(f.out,['First.','Second.']);assert.equal(f.requests.length,3);
 f.requests[2].resolve('Third.');await tick();assert.deepEqual(f.out,['First.','Second.','Third.']);assert.equal(f.usage(),3);assert.equal(f.r.sending,false);assert.ok(f.requests.every(x=>new Uint8Array(x.body).every(n=>n===0)));f.r.abort();
}
{
 const f=fixture({canParallel:()=>false});f.r.queue.push(audio(),audio());const pending=f.r.drain();await tick();assert.equal(f.requests.length,1);f.requests[0].resolve('First.');await pending;await tick();assert.equal(f.requests.length,2);f.requests[1].resolve('Second.');await tick();f.r.abort();
}
{
 const f=fixture();f.r.queue.push(audio(),audio());const pending=f.r.drain();await tick();f.requests[1].resolve('Later.');await tick();f.r.abort();await pending;assert.deepEqual(f.out,[]);assert.ok(f.requests.every(x=>x.signal.aborted));assert.equal(f.r.jobs.size,0);
}
{
 const f=fixture();f.r.queue.push(audio(),audio());const pending=f.r.drain();await tick();f.requests[1].resolve('Recovered.');f.requests[0].reject(Error('network'));await pending;assert.deepEqual(f.out,['Recovered.']);assert.equal(f.r.failures,0);assert.equal(f.diagnostics[0].code,'network_or_cors');f.r.abort();
}
{
 const now=Date.now(),s={startedAt:now-600000,updatedAt:now,events:[{type:'recognition_error',seconds:100},{type:'recognition_error',seconds:500},{type:'asr_queue_drop',seconds:601},{type:'recognition_error'},{type:'recognition_error',seconds:-1}]};
 assert.equal(recentSessionEvents([s],now).length,1);const report=explainConnection([],{now,sessions:[s]});assert.ok(report.facts.some(x=>x.includes('音声認識エラー 1回')));assert.equal(recentSessionEvents([{...s,events:s.events.slice(0,1)}],now).length,0);
 assert.equal(safeConnectionRecord({orderWaitMs:42,text:'private'}).orderWaitMs,42);assert.equal(safeConnectionRecord({orderWaitMs:Infinity}).orderWaitMs,undefined);
}
console.log('Recognition: two bounded slots, ordered responses, translation coordination, abort, failures, no replay; diagnostic event timestamps passed');
