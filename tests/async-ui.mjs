import assert from 'node:assert/strict';
import {singleFlight} from '../web/async-ui.js';
import {photoReadResult} from '../web/photo-translate.js';
let calls=0,release;
const run=singleFlight(async()=>{calls++;await new Promise(resolve=>release=resolve);return calls;});
const first=run(),second=run();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);release();assert.equal(await first,1);
const third=run();await Promise.resolve();assert.equal(calls,2);release();assert.equal(await third,2);
let retries=0;const retry=singleFlight(async()=>{if(++retries===1)throw Error('temporary');return 'ready';});await assert.rejects(retry(),/temporary/);assert.equal(await retry(),'ready');
for(const bad of [null,{}, {text:undefined},{text:5}])assert.throws(()=>photoReadResult(bad),/読み取り結果/);
const value=photoReadResult({text:'原文',blocks:[null,{id:'bad',text:3},{id:'b0',text:'原文'}],truncated:'false'});assert.equal(value.text,'原文');assert.deepEqual(value.blocks,[{id:'b0',text:'原文'}]);assert.equal(value.truncated,false);assert.deepEqual(photoReadResult({text:'原文',blocks:null}).blocks,[]);
console.log('Async UI: shared attempts, explicit retries and validated photo results passed');

const {installLazyAction}=await import('../web/async-ui.js');
function lazyButton(){const attributes=new Map();return {disabled:false,isConnected:true,getAttribute:k=>attributes.get(k)??null,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};}
{const button=lazyButton();let release,loads=0,opened=0;installLazyAction(button,async()=>{loads++;await new Promise(r=>release=r);button.onclick=()=>opened++;});const click=button.onclick,first=click({});assert.equal(click({}),first);await Promise.resolve();assert.equal(loads,1);assert(button.disabled);release();await first;assert.equal(opened,1);assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-busy'),null);button.onclick();assert.equal(opened,2);assert.equal(loads,1);}
{const button=lazyButton();let failures=0;const attempts=[];installLazyAction(button,async attempt=>{attempts.push(attempt);if(attempt===1)throw Error('offline');button.onclick=()=>{};},{onError:()=>failures++});await button.onclick({});assert.equal(failures,1);assert.equal(button.disabled,false);await button.onclick({});assert.deepEqual(attempts,[1,2]);}
console.log('PASS optional UI loads once on demand, shares pending clicks, restores busy state and retries only after user action');
