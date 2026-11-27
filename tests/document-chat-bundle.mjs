import assert from 'node:assert/strict';
import {PDFDocument} from '../web/document-pdf-lib.mjs';
import {combineChatFiles} from '../web/document-chat-bundle.js';
async function fixture(name,width){const p=await PDFDocument.create();p.addPage([width,400]);return new File([await p.save()],name,{type:'application/pdf'});}
const files=[await fixture('A.pdf',500),await fixture('B.pdf',600)];
const result=await combineChatFiles(files,async file=>({file,pages:[file.name+' text']}));
const pdf=await PDFDocument.load(await result.file.arrayBuffer());assert.deepEqual(pdf.getPages().map(p=>p.getWidth()),[500,600]);assert.deepEqual([...result.pages],['A.pdf text','B.pdf text']);assert.deepEqual(result.sources.map(s=>[s.name,s.start]),[['A.pdf',1],['B.pdf',2]]);
await assert.rejects(()=>combineChatFiles(files,async file=>{if(file.name==='B.pdf')throw Error('unreadable');return {file,pages:['text']};}),/B.pdf.*全資料の登録を中止/);
await assert.rejects(()=>combineChatFiles(files,async file=>({file,pages:[]})),/一致しません/);
await assert.rejects(()=>combineChatFiles(files,async file=>({file,pages:['x'.repeat(80000)]})),/150,000文字/);
console.log('PASS all source PDF pages preserved in order, all text included, unreadable/misaligned/oversize batches rejected before upload');
