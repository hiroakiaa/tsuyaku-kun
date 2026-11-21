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

const scanSource=['説明会は4月8日に開催します。ノートと筆記用具を持参してください。','参加費は1200円です。欠席の場合は前日までに学校へ連絡してください。'];
const scanItems=scanSource.map((str,i)=>({str:str.replace('説明会','説明回').replace('筆記','筆紀'),width:450,height:14,ocr:true,ocrBox:[.05,.1+i*.1,.85,.04],transform:[14,0,0,14,20,700-i*30]}));
const scan=alignPdfTranslation({source:scanSource,lines:['Briefing on April 8. Bring a notebook and writing supplies.','Fee 1200 yen. Contact the school by the previous day if absent.']},scanItems,{quote:scanSource[0]});assert.ok(scan);assert.ok(scan.scanAlignment.score>.9);assert.equal(scan.scanAlignment.citationRanges.length,1);assert.ok(scan.lines.join(' ').includes('1200'));
assert.equal(alignPdfTranslation({source:scanSource,lines:['A','B']},scanItems.map(item=>({...item,ocr:false}))),null,'Approximate geometry is restricted to OCR, never native PDF text');
console.log('PASS two OCR passes with different glyph recognition retain canonical translation, numeric content and quote geometry');

const noisy=scanItems.map((item,index)=>({...item,str:(index===0?'口':'')+item.str+(index===1?'ロ':'')}));
const recovered=alignPdfTranslation({source:scanSource,lines:['Briefing on April 8. Bring a notebook and writing supplies.','Fee 1200 yen. Contact the school by the previous day if absent.']},noisy);
assert.ok(recovered);assert.deepEqual(recovered.untranslatedIndices,[],'Small unmatched OCR edges must not block the entire translated page');assert.ok(recovered.lines.join(' ').includes('1200'));
console.log('PASS canonical translations cover small OCR line-edge artifacts without changing source text or dropping translations');

const exactNoise=scanItems.map((item,index)=>({...item,str:(index===0?'口':'')+scanSource[index]+(index===1?'ロ':'')}));assert.deepEqual(alignPdfTranslation({source:scanSource,lines:['A','B']},exactNoise).untranslatedIndices,[]);
const unrelatedLine={...scanItems[1],str:'この別の欄には翻訳されていない重要な案内があります。',transform:[14,0,0,14,20,600]};const incomplete=alignPdfTranslation({source:scanSource,lines:['A','B']},[...scanItems,unrelatedLine]);assert.ok(!incomplete||incomplete.untranslatedIndices.length>0,'Never mask an unmatched substantive line');
