import assert from 'node:assert/strict';
import {answerCitations,citationOnPage} from '../web/document-citation-state.js';
const items=[{answer:'a',evidence:[{page:1,quote:'time'},{page:2,quote:'place'},{page:2,quote:'fee'},{page:2,quote:'place'}]},{answer:null,evidence:[{page:1,quote:'unsupported'}]},{answer:'b',evidence:[{page:3,quote:'outside'}]}];
const sequence=answerCitations(items,2);assert.equal(sequence.length,3);assert.deepEqual(citationOnPage(sequence,2),{page:2,quote:'place\nfee',quotes:['place','fee']});assert.deepEqual(citationOnPage(sequence,1),{page:1,quote:'time',quotes:['time']});assert.equal(citationOnPage(sequence,3),undefined);assert.deepEqual(answerCitations(JSON.parse(JSON.stringify(items)),2),sequence);assert.deepEqual(answerCitations([],2),[]);
console.log('PASS cross-page markers, all same-page quotes, deduplication, grounded-only references, history restoration');

const {citationRanges}=await import('../web/document-citation-state.js');const normalize=s=>s.normalize('NFKC').replace(/[\s、。]+/gu,'');
const pageText=normalize('令和8年11月28日（土）予備日12月1日（火）※両日、給食も弁当もなし');
assert.ok(citationRanges(pageText,'令 和8年11月28日(土) 予備日12月1日(N)※両日、給食も弁当もなし',normalize).length);
assert.deepEqual(citationRanges(normalize('給食も弁当もなし 給食も弁当もなし'),'日付誤認識、給食も弁当もなし',normalize),[]);
assert.deepEqual(citationRanges(pageText,'別の学校、弁当を持参してください',normalize),[]);
console.log('PASS punctuation clauses recover OCR differences while repeated or unrelated text stays unmarked');

assert.equal(citationRanges(normalize('給食はありません。弁当も不要です。'),'両日邊前中活動のだめ、弁 当 も 不要 で す 。',normalize).length,1);
