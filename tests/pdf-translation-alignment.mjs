import assert from 'node:assert/strict';
import {alignPdfTranslation} from '../web/pdf-translation-alignment.js';
const items=['School handbook','Bring your notebook.','The office opens at nine.'].map((str,i)=>({str,width:200,height:12,transform:[12,0,0,12,30,750-i*30]}));
const translated='School rules include bringing a notebook and the office opens at nine.';
const result=alignPdfTranslation({source:[items.map(item=>item.str).join(' ')],lines:[translated]},items);
assert.equal(result.source.length,3);assert.equal(result.lines.join(' ').replace(/\s+/g,' ').trim(),translated);
assert.equal(alignPdfTranslation({source:['Different document'],lines:['Wrong']},items),null);
const reordered=alignPdfTranslation({source:[items[2].str,items[0].str,items[1].str],lines:['THIRD','FIRST','SECOND']},items);
assert.deepEqual(reordered.lines,['FIRST','SECOND','THIRD']);
assert.deepEqual(alignPdfTranslation({source:[items[1].str],lines:['NOTEBOOK']},items).untranslatedIndices,[0,2]);
console.log('PASS paragraph-to-line geometry, text conservation, reordered sources, unchanged unreferenced text and wrong-page protection');

const packed=[{str:'School handbook',width:150,height:12,transform:[12,0,0,12,30,750]}];
const split=alignPdfTranslation({source:['School','handbook'],lines:['Campus','Guide']},packed);assert.ok(split);assert.equal(split.source.length,2);assert.deepEqual(split.lines,['Campus','Guide']);assert.equal(split.items.length,2);assert.equal(split.items.reduce((n,item)=>n+item.width,0),150);assert.equal(split.items[0].transform[4],30);assert.ok(split.items[1].transform[4]>30);
const invisible=alignPdfTranslation({source:['School handbook'],lines:['Guide']},[{...packed[0],str:'School\u200b handbook'}]);assert.ok(invisible);assert.equal(invisible.lines[0],'Guide');
console.log('PASS cached source boundaries inside a PDF item, split geometry and invisible PDF controls');
