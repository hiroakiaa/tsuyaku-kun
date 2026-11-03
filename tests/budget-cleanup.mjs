import assert from 'node:assert/strict';
import {guardedAi} from '../server/ai-budget.js';
import {azureTranslate} from '../server/azure-translator.js';
import {completeBudgetCleanup} from '../server/budget-cleanup.js';
import {recognitionMetrics} from '../web/recognition-metrics.js';
import {safeConnectionRecord} from '../web/network.js';
const config=JSON.stringify({key:'synthetic',region:'japaneast',sku:'F0',monthlyF0:true});
for(const mode of ['recognition','translation']){
 let complete,leases=0,reserved=0,providerCalls=0;const tasks=[],actions=[],timing={};
 const gate=new Promise(r=>complete=r),env={budgetUid:'synthetic',AZURE_TRANSLATOR_F0:config,translationTiming:timing,backgroundBudgetCleanup:p=>tasks.push(p),ROOMS:{idFromName:n=>n,get:()=>({fetch:async request=>{const data=await request.json();actions.push(data.action);if(data.action==='reserve'){reserved++;leases++;return Response.json({id:'lease',day:1,reserved:20});}await gate;leases--;return Response.json({ok:true});}})}};
 const result=mode==='recognition'?await guardedAi(env,'@cf/openai/whisper-large-v3-turbo',{audio:'a'.repeat(44000)},async()=>{providerCalls++;assert.equal(reserved,1);return {text:'synthetic'};}):await azureTranslate(env,'synthetic','ja',['en'],()=>{},async()=>{providerCalls++;assert.equal(reserved,1);return Response.json([{translations:[{to:'en',text:'Synthetic.'}]}]);});
 assert(result);assert.equal(providerCalls,1);assert.equal(reserved,1);assert.equal(leases,1,'result is ready while cleanup is still held');assert.equal(tasks.length,1);assert.equal(timing.budgetSettleDeferred,true);assert.equal(timing.budgetSettleMs,null);complete();await Promise.all(tasks);assert.equal(leases,0);assert.equal(reserved,1,'cleanup does not erase reserved consumption');assert.deepEqual(actions,['reserve',mode==='recognition'?'settle':'release']);assert.equal(timing.budgetSettleMs,null,'background completion must not mutate response timing');
}
let clock=1;const synchronous={};await completeBudgetCleanup({},async()=>{clock+=23;},synchronous,()=>clock);assert.equal(synchronous.budgetSettleMs,23);assert.equal(synchronous.budgetSettleDeferred,undefined);
const tasks=[];await completeBudgetCleanup({backgroundBudgetCleanup:p=>tasks.push(p)},()=>Promise.reject(Error('synthetic offline')),{});await Promise.all(tasks);
let done=false;await completeBudgetCleanup({backgroundBudgetCleanup(){throw Error('context unavailable');}},async()=>{done=true;},{});assert(done);
assert.equal(recognitionMetrics({budgetSettleDeferred:true}).budgetSettleDeferred,true);assert.equal(safeConnectionRecord({budgetSettleDeferred:true}).budgetSettleDeferred,true);
console.log('PASS reservation before provider; result before held cleanup; server task lifetime; retained accounting; no extra calls; sync fallback and private deferred diagnostics');
