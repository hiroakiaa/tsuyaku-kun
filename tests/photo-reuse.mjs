import assert from 'node:assert/strict';
import {photoReuseOperation,photoReuseStorage} from '../server/photo-reuse.js';
const catalog={languages:[{code:'ja'},{code:'en'},{code:'pt'}],bank:[],phrases:[],glossary:[]},stores=new Map();let calls=0;
const storage=()=>{const rows=new Map();return {rows,get:async key=>rows.get(key),transaction:async fn=>fn({get:async key=>rows.get(key),put:async value=>{for(const [key,v]of Object.entries(value))rows.set(key,v);},delete:async key=>rows.delete(key)})};};
const run=async(input,uid)=>{assert.ok(uid);calls++;await new Promise(r=>setTimeout(r,5));const blocks=JSON.parse(input.messages[1].content).blocks;return {response:JSON.stringify({blocks:blocks.map(b=>({id:b.id,translations:Object.fromEntries(b.targets.map(target=>[target,'Translated text '+target]))}))}),usage:{prompt_tokens:20,completion_tokens:10}};};
const env={budgetUid:'user-a',ROOMS:{idFromName:name=>name,get:name=>({fetch:async request=>{if(!stores.has(name))stores.set(name,storage());try{return Response.json(await photoReuseStorage(stores.get(name),env,await request.json(),catalog,run));}catch(e){return Response.json({error:e.message},{status:e.status||502});}}})}};
const data={source:'ja',targets:['en'],blocks:[{id:'b20',text:'お知らせ本文です。'}]};
const first=await photoReuseOperation(env,'translate',data,catalog);assert.equal(first.reuse,'generated');assert.equal(calls,1);
const again=await photoReuseOperation(env,'translate',{...data,blocks:[{...data.blocks[0],id:'b99'}]},catalog);
assert.equal(again.reuse,'cache');assert.equal(again.blocks[0].id,'b99');assert.equal(again.usage.inputTokens,0);assert.equal(calls,1);
await photoReuseOperation({...env,budgetUid:'user-b'},'translate',data,catalog);assert.equal(calls,2,'Private photo translations are isolated by user');
await photoReuseOperation(env,'translate',{...data,targets:['pt']},catalog);assert.equal(calls,3);
const same={...data,blocks:[{id:'b0',text:'別のお知らせです。'}]},before=calls;
const parallel=await Promise.all([photoReuseOperation(env,'translate',same,catalog),photoReuseOperation(env,'translate',same,catalog)]);
assert.equal(calls,before+1);assert.ok(parallel.some(result=>result.reuse==='in-flight'));
const ocr=storage(),input={kind:'ocr',scope:'user',uid:'user-a',key:'a'.repeat(64),data:{image:'not persisted'}};
ocr.rows.set('ocr:'+input.key,{text:'Saved OCR text',blocks:[]});
assert.equal((await photoReuseStorage(ocr,env,input,catalog,run)).reuse,'cache');
assert.equal(JSON.stringify([...stores.values()].flatMap(store=>[...store.rows.values()])).includes('image'),false,'Only OCR text/geometry and translations are stored');
console.log('PASS persistent translation reuse, ID remapping, zero AI usage on cache hits, language separation, per-user privacy and concurrent request coalescing');

const sharedData={...data,blocks:[{id:'b0',text:'共通資料の再利用確認です。'}]},sharedBefore=calls;
const sharedResults=await Promise.all([photoReuseOperation(env,'translate',sharedData,catalog,{documentScope:'doc-1:2:1'}),photoReuseOperation({...env,budgetUid:'user-b'},'translate',sharedData,catalog,{documentScope:'doc-1:2:1'})]);assert.equal(calls,sharedBefore+1);assert.ok(sharedResults.some(r=>r.reuse==='in-flight'));const sharedAgain=await photoReuseOperation({...env,budgetUid:'user-b'},'translate',sharedData,catalog,{documentScope:'doc-1:2:1'});assert.equal(sharedAgain.reuse,'cache');assert.equal(sharedAgain.usage.inputTokens,0);await photoReuseOperation(env,'translate',sharedData,catalog,{documentScope:'doc-1:3:1'});assert.equal(calls,sharedBefore+2);await photoReuseOperation(env,'translate',sharedData,catalog,{documentScope:'doc-2:2:1'});assert.equal(calls,sharedBefore+3);console.log('PASS cross-user shared-document reuse, one concurrent generation, zero cached tokens, revision/document separation');

const originalFetch=globalThis.fetch,geometryStore=storage(),geometryKey='b'.repeat(64);geometryStore.rows.set('ocr:'+geometryKey,{text:'Hello',blocks:[]});let visionCalls=0;
globalThis.fetch=async()=>{visionCalls++;return Response.json({responses:[{fullTextAnnotation:{text:'Hello',pages:[{width:100,height:100,blocks:[{paragraphs:[{boundingBox:{vertices:[{x:10,y:20},{x:40,y:20},{x:40,y:30},{x:10,y:30}]},words:[{boundingBox:{vertices:[{x:10,y:20},{x:40,y:20},{x:40,y:30},{x:10,y:30}]},symbols:[{text:'Hello'}]}]}]}]}]}}]});};
try{const geometryEnv={GOOGLE_VISION_API_KEY:'synthetic-test-key',ROOMS:{idFromName:n=>n,get:()=>({fetch:async()=>Response.json({id:'lease',month:'2026-11',remaining:10,userRemaining:10})})}},geometryInput={kind:'ocr',scope:'synthetic',uid:'user-a',key:geometryKey,data:{image:'/9j/'+'A'.repeat(100),id:'synthetic-request-0001',layoutVersion:1}};const upgraded=await photoReuseStorage(geometryStore,geometryEnv,geometryInput,catalog,run);assert.equal(upgraded.layoutVersion,1);assert.deepEqual(upgraded.blocks[0].tokens,[['Hello',.1,.2,.3,.1]]);const cached=await photoReuseStorage(geometryStore,geometryEnv,geometryInput,catalog,run);assert.equal(cached.reuse,'cache');assert.equal(visionCalls,1);}finally{globalThis.fetch=originalFetch;}
console.log('PASS legacy OCR geometry upgraded once, word coordinates retained, next reader cache hit');
