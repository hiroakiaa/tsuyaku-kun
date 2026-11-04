import assert from 'node:assert/strict';import {RecognitionNoiseGuard} from '../web/recognition-noise-guard.js';
const g=new RecognitionNoiseGuard();for(let i=0;i<7;i++)assert.equal(g.observe('empty',1000+i*1000),false);assert.equal(g.observe('empty',8000),true);assert.equal(g.observe('empty',9000),false);
const speech=new RecognitionNoiseGuard();for(let i=0;i<50;i++)assert.equal(speech.observe('accepted',i*1000),false);
const sparse=new RecognitionNoiseGuard();for(let i=0;i<20;i++)assert.equal(sparse.observe('empty',i*10000),false);
const uncertain=new RecognitionNoiseGuard();for(let i=0;i<30;i++)assert.equal(uncertain.observe('language_uncertain',i*1000),false);
const mixed=new RecognitionNoiseGuard();for(const [i,reason]of ['empty','accepted','empty','accepted','empty','empty','accepted','empty','empty','empty'].entries())assert.equal(mixed.observe(reason,i*1000),false);
assert(Object.values(g.rows[0]).every(v=>typeof v==='number'||typeof v==='boolean'));
console.log('PASS dense non-speech results pause once; accepted short replies, sparse silence and language uncertainty do not trigger pause; no transcript storage');
