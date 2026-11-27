import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {processDocumentFiles} from '../web/document-file-batch.js';
const files=['first.pdf','failure.docx','last.xlsx'].map(name=>({name,size:100}));
let active=0,maxActive=0;const seen=[];
const result=await processDocumentFiles(files,async(file,index)=>{seen.push([file.name,index]);maxActive=Math.max(maxActive,++active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(index===1)throw Error('upload failed');return 'id-'+index;});
assert.equal(maxActive,1);assert.deepEqual(seen,files.map((f,i)=>[f.name,i]));assert.deepEqual(result.successes.map(r=>r.value),['id-0','id-2']);assert.equal(result.errors[0].file.name,'failure.docx');
let calls=0;const validation=await processDocumentFiles([{name:'huge.pdf',size:5000001},{name:'empty.pdf',size:0},{name:'bad.exe',size:5},{name:'ok.PDF',size:5000000}],async()=>++calls);
assert.equal(calls,1);assert.equal(validation.errors.length,3);assert.equal(validation.successes.length,1);
const html=await fs.readFile('documents.html','utf8');assert.match(html,/name="pdf"[^>]*multiple required/);assert.match(html,/name="file"[^>]*multiple required/);assert.doesNotMatch(html.match(/<form id="replace-pdf"[\s\S]*?<\/form>/)[0],/multiple/);
console.log('PASS sequential mixed-file registration, per-file validation, partial failures, no retries, both multi-select controls, single replacement');

const {processDocumentChat}=await import('../web/document-file-batch.js');
let created=0;const attached=[];
const chat=await processDocumentChat(files,async()=>{created++;return 'one-chat';},async(id,file)=>{attached.push([id,file.name]);if(file.name==='failure.docx')throw Error('failed');return file.name;});
assert.equal(created,1);assert.equal(chat.chatId,'one-chat');assert.deepEqual(attached,[['one-chat','failure.docx'],['one-chat','last.xlsx']]);assert.equal(chat.successes.length,2);assert.equal(chat.errors.length,1);
let attachments=0;const failed=await processDocumentChat(files,async()=>{throw Error('uncertain');},async()=>attachments++);assert.equal(attachments,0);assert.equal(failed.chatId,undefined);assert.equal(failed.errors.length,3);
await assert.rejects(()=>processDocumentChat(Array(10).fill(files[0]),async()=>created++,async()=>{}));assert.equal(created,1);
console.log('PASS one chat per batch, same-chat attachments, partial failure, failed root prevents other creations, existing 9-file limit');
