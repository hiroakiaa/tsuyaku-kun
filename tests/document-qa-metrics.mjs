import assert from 'node:assert/strict';
import {documentQaMetricCells,documentQaMetrics,recordDocumentQaMetric} from '../web/document-qa-metrics.js';

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

assert.deepEqual(documentQaMetrics().map(documentQaMetricCells),[
  ['案内','1.50秒','67％（2/3）','33％（1/3）'],
  ['案内','0.90秒','未計測','0％（0/1）'],
]);

for (let i=0;i<100;i++) recordDocumentQaMetric(String(i),'資料',{translation:'cache'});
assert.equal(documentQaMetrics().length,100);
assert.equal(documentQaMetrics()[0].id,'99');
assert.ok(!documentQaMetrics().some(row=>row.id==='one'));
console.log('PASS Document QA metrics separate same-title documents and limit retained rows');
const saved=records.get('document-qa-metrics-v1');
for(const sample of [{ms:NaN,items:1,unsupported:0},{ms:-1,items:1,unsupported:0},{ms:10,items:1,unsupported:2},{translation:'failed'},{}])recordDocumentQaMetric('invalid','資料',sample);
assert.equal(records.get('document-qa-metrics-v1'),saved,'Invalid measurements cannot corrupt valid history');
records.set('document-qa-metrics-v1',JSON.stringify([null,{id:'broken',title:'破損',answers:1,answerMs:'NaN'},...JSON.parse(saved)]));
assert.equal(documentQaMetrics().length,100);
assert.deepEqual(documentQaMetricCells({title:'破損'}),['破損','未計測','未計測','未計測']);
console.log('PASS Missing/negative/nonfinite measurements stay unmeasured rather than NaN or invented percentages');
