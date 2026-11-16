import assert from 'node:assert/strict';
import {documentQaMetrics,recordDocumentQaMetric} from '../web/document-qa-metrics.js';

const records = new Map();
Object.defineProperty(globalThis,'localStorage',{
  configurable:true,
  value:{getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)},
});

assert.deepEqual(documentQaMetrics(),[]);
recordDocumentQaMetric('one','案内',{ms:2000,items:2,unsupported:1});
recordDocumentQaMetric('two','案内',{ms:900,items:1,unsupported:0});
recordDocumentQaMetric('one','案内',{ms:1000,items:1,unsupported:0});
for (const translation of ['generated','cache','in-flight']) {
  recordDocumentQaMetric('one','案内',{translation});
}
assert.deepEqual(documentQaMetrics(),[
  {id:'one',title:'案内',answers:2,answerMs:3000,items:3,unsupported:1,translations:3,reused:2},
  {id:'two',title:'案内',answers:1,answerMs:900,items:1,unsupported:0,translations:0,reused:0},
]);

for (let i=0;i<100;i++) recordDocumentQaMetric(String(i),'資料',{translation:'cache'});
assert.equal(documentQaMetrics().length,100);
assert.equal(documentQaMetrics()[0].id,'99');
assert.ok(!documentQaMetrics().some(row=>row.id==='one'));
console.log('PASS Document QA metrics separate same-title documents and limit retained rows');
