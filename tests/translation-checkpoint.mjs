import assert from 'node:assert/strict';
import {translationCheckpoints} from '../server/translation-checkpoint.js';
const rows=new Map([['document',{}]]),storage={get:async key=>rows.get(key),transaction:async fn=>fn({get:async key=>rows.get(key),put:async object=>{for(const [key,value]of Object.entries(object))rows.set(key,value);},delete:async key=>rows.delete(key)})};
const calls=new Map(),batches=[['a'],['b'],['c']],translate=async batch=>{calls.set(batch[0],(calls.get(batch[0])||0)+1);if(batch[0]==='b'&&calls.get('b')===1)throw Error('timeout');return batch.map(value=>'translated '+value);};
await assert.rejects(()=>translationCheckpoints(storage,'page-language-hash',batches,translate));
const result=await translationCheckpoints(storage,'page-language-hash',batches,translate);
assert.deepEqual(result,['translated a','translated b','translated c']);assert.equal(calls.get('a'),1);assert.equal(calls.get('b'),2);assert.equal(calls.get('c'),1);
await translationCheckpoints(storage,'page-language-hash',batches,translate);assert.equal(calls.get('b'),2);
console.log('PASS document translation resumes unfinished groups and reuses saved groups');
