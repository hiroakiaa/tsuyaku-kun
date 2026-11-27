import assert from 'node:assert/strict';
import {answerCitations,citationOnPage} from '../web/document-citation-state.js';
const items=[{answer:'a',evidence:[{page:1,quote:'time'},{page:2,quote:'place'},{page:2,quote:'fee'},{page:2,quote:'place'}]},{answer:null,evidence:[{page:1,quote:'unsupported'}]},{answer:'b',evidence:[{page:3,quote:'outside'}]}];
const sequence=answerCitations(items,2);assert.equal(sequence.length,3);assert.deepEqual(citationOnPage(sequence,2),{page:2,quote:'place\nfee',quotes:['place','fee']});assert.deepEqual(citationOnPage(sequence,1),{page:1,quote:'time',quotes:['time']});assert.equal(citationOnPage(sequence,3),undefined);assert.deepEqual(answerCitations(JSON.parse(JSON.stringify(items)),2),sequence);assert.deepEqual(answerCitations([],2),[]);
console.log('PASS cross-page markers, all same-page quotes, deduplication, grounded-only references, history restoration');
