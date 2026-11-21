import assert from 'node:assert/strict';
import {documents,evaluateDocumentQuestion} from '../server/documents.js';
const saved=globalThis.fetch;let calls=0,prompt;
const pages=['Office café: registration costs GBP 25.','Workshop: at most 20 people may attend.','The inter-\nnational fee is CHF 30.'];
const env={OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:x=>x,get:()=>({fetch:async url=>Response.json(url.endsWith('/data')?{pages,owner:'author'}:null)})}};
const ask=body=>documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body}),env,{uid:'author'});
try{
 globalThis.fetch=async(_url,{body})=>{calls++;prompt=JSON.parse(JSON.parse(body).messages.find(m=>m.role==='user').content);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:'Capacity',answer:'20人',sources:[{page:2,quote:pages[1]}]}]})}}]});};
 for(const body of ['{','null','[]','1',JSON.stringify({question:'\u200b\ufeff\u2060'})])assert.equal((await ask(body)).status,400);
 for(const question of ['99ページの内容は？','pages 3 to 2の内容は？'])assert.equal((await ask(JSON.stringify({question}))).status,400);
 assert.equal(calls,0);
 let result=await(await ask(JSON.stringify({question:'2ページの人数条件は？'}))).json();assert.equal(result.items[0].answer,'20人以下');assert.deepEqual(result.pages,[2]);assert.ok(prompt.資料.filter(p=>p.page!==2).every(p=>!p.text));
 result=await(await ask(JSON.stringify({question:'page 1の人数条件は？'}))).json();assert.equal(result.items[0].answer,null);assert.deepEqual(result.pages,[]);
}finally{globalThis.fetch=saved;}
console.log('PASS malformed/empty questions avoid model calls; explicit pages preserve numbering and reject off-scope citations; omitted simple bounds restored from unanimous sources');

try{
 const texts=Array.from({length:16},(_,i)=>('Unrelated landscape section '+i+'. ').repeat(28));texts[10]='Café membership is available on Tuesday.';texts[11]='The inter-\nnational workshop starts on Friday.';texts[12]='The member\u200bship fee is published here.';
 for(const [query,page,quote]of [['cafe',11,texts[10]],['international',12,texts[11]],['membership',13,texts[12]]]){globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:query,answer:quote,sources:[{page,quote}]}]})}}]});const result=await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:'test'},texts,query,'search');assert.ok(result.candidatePages.includes(page));assert.ok(result.candidatePages.length<texts.length);assert.equal(result.items[0].answer,quote);}
 globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:'cafe',answer:'Tuesday',sources:[{page:11,quote:'Cafe membership is available on Tuesday.'}]}]})}}]});assert.equal((await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:'test'},texts,'cafe','search')).items[0].answer,null);
}finally{globalThis.fetch=saved;}
console.log('PASS folded search locates original accented, wrapped and invisible-text pages while literal quotations stay exact');
