import assert from 'node:assert/strict';
import {photoTranslationPlan,translatePhotoProgressively} from '../web/photo-progress.js';
const blocks=[{id:'b0',text:'提出日は10月20日です。'.repeat(45)},{id:'b1',text:'教科書を持ってきてください。'}];
const plan=photoTranslationPlan(blocks);assert.ok(plan.length>2);assert.ok(plan.every(b=>b.reduce((n,p)=>n+p.text.length,0)<=260&&b.length<=6));assert.equal(plan.flat().filter(p=>p.originalId==='b0').map(p=>p.text).join(''),blocks[0].text);
const cache=new Map();let active=0,max=0,calls=0;const progress=[];
const request=async body=>{calls++;active++;max=Math.max(max,active);assert.deepEqual(body.targets,['es']);await new Promise(r=>setTimeout(r,2));active--;return {blocks:body.blocks.map(b=>({id:b.id,translations:{es:'ES:'+b.text}}))};};
const result=await translatePhotoProgressively({blocks,source:'ja',target:'es',request,cache,onProgress:(data,n)=>progress.push(n)});assert.equal(result.blocks.length,2);assert.equal(result.blocks[0].translations.ja,blocks[0].text);assert.ok(max<=2);assert.equal(progress.length,plan.length);
const before=calls;await translatePhotoProgressively({blocks,source:'ja',target:'es',request,cache});assert.equal(calls,before,'repeat translation must not spend AI again');
let count=0;const partialCache=new Map();await assert.rejects(()=>translatePhotoProgressively({blocks,source:'ja',target:'es',cache:partialCache,request:async body=>{if(++count===2)throw Error('network');return request(body);}}));assert.ok(partialCache.size>0,'successful batches survive another batch failing');
await assert.rejects(()=>translatePhotoProgressively({blocks,source:'ja',target:'es',cache:new Map(),request:async()=>({blocks:[]})}));
console.log('Photo progress: bounded batches, no text loss, two requests maximum, selected language only, cache and failure recovery passed');

const longBlocks=Array.from({length:100},(_,i)=>({id:'b'+i,text:('段落'+i+'の確認用文章。').repeat(30)}));
const longResult=await translatePhotoProgressively({blocks:longBlocks,source:'ja',target:'en',cache:new Map(),request:async body=>({blocks:body.blocks.map(b=>({id:b.id,translations:{en:b.text}}))})});
assert.equal(longResult.blocks.length,100);
for(let i=0;i<longBlocks.length;i++)assert.equal(longResult.blocks[i].translations.en.replace(/\s/gu,''),longBlocks[i].text.replace(/\s/gu,''),'No text is dropped after 1200 or 12000 characters');
console.log('PASS long photo: '+longBlocks.reduce((n,b)=>n+b.text.length,0)+' characters, 100 paragraphs, no truncation');

const attempts=new Map(),resumed=[];
const retryBlocks=[{id:'b0',text:'A'.repeat(260)},{id:'b1',text:'B'.repeat(260)},{id:'b2',text:'C'.repeat(260)}];
const recovered=await translatePhotoProgressively({blocks:retryBlocks,source:'ja',target:'en',cache:new Map(),wait:async()=>{},onResume:event=>resumed.push(event),request:async body=>{
 const text=body.blocks[0].text;attempts.set(text,(attempts.get(text)||0)+1);
 if(text.startsWith('B')&&attempts.get(text)<=2)throw Object.assign(Error('timeout'),{name:'TimeoutError'});
 return {blocks:body.blocks.map(b=>({id:b.id,translations:{en:b.text}}))};
}});
assert.equal(recovered.blocks.length,3);assert.equal(attempts.get('A'.repeat(260)),1);assert.equal(attempts.get('B'.repeat(260)),3);assert.equal(attempts.get('C'.repeat(260)),1);assert.equal(resumed.length,2);
const {resumeTranslation}=await import('../web/translation-resume.js');
let valid=true,abortCalls=0;
await assert.rejects(()=>resumeTranslation(async()=>{abortCalls++;throw new DOMException('Timed out','TimeoutError');},{valid:()=>valid,wait:async()=>{valid=false;}}),error=>error.name==='AbortError');assert.equal(abortCalls,1);
let permanentCalls=0;await assert.rejects(()=>resumeTranslation(async()=>{permanentCalls++;throw Object.assign(Error('denied'),{status:403});},{wait:async()=>{}}));assert.equal(permanentCalls,1);
console.log('PASS timeout continuation: only failed chunks retry; successful chunks remain; cancellation and permanent failures stop');

let splitCalls=0;const splitEvents=[];const adaptive=await translatePhotoProgressively({blocks:[{id:'b0',text:'X'.repeat(240)}],source:'ja',target:'en',cache:new Map(),wait:async()=>{},onResume:e=>splitEvents.push(e),request:async body=>{splitCalls++;if(body.blocks[0].text.length>130)throw Object.assign(Error('AI service unavailable'),{status:502});return {blocks:body.blocks.map(b=>({id:b.id,translations:{en:b.text}}))};}});
assert.equal(adaptive.blocks[0].translations.en.replace(/\s/g,''),'X'.repeat(240));assert.equal(splitCalls,4);assert.ok(splitEvents.some(e=>e.split));
let malformed=0;await translatePhotoProgressively({blocks:[{id:'b0',text:'test'}],source:'ja',target:'en',cache:new Map(),wait:async()=>{},request:async body=>++malformed===1?{blocks:[]}:{blocks:body.blocks.map(b=>({id:b.id,translations:{en:'complete'}}))}});assert.equal(malformed,2);
let exhausted=0;await assert.rejects(()=>translatePhotoProgressively({blocks:[{id:'b0',text:'Q'.repeat(240)}],source:'ja',target:'en',cache:new Map(),wait:async()=>{},request:async()=>{exhausted++;throw Object.assign(Error('service down'),{status:502});}}));assert.ok(exhausted<=8);
console.log('PASS adaptive split recovery, missing-output recovery and finite retry cost');
