import assert from 'node:assert/strict';
import {documents} from '../server/documents.js';

const cases = [
  {format:'PDF', pages:['研修の参加費は3,500円です。','別の研修の参加費は5,300円です。'], quote:'研修の参加費は3,500円です。', correct:'3,500円です。', wrong:'5,300円です。'},
  {format:'Excel抽出', pages:['受付 | 定員 ３０人 | 予備席 12人','別会場の定員は60人です。'], quote:'受付 | 定員 ３０人', correct:'30人です。', wrong:'60人です。'},
  {format:'スキャンOCR抽出', pages:['交付手数料は４００円です。','郵送手数料は800円です。'], quote:'交付手数料は４００円です。', correct:'400円です。', wrong:'800円です。'},
  {format:'負の金額',pages:['前月との差額は−４００円です。','別の月の差額は400円です。'],quote:'前月との差額は−４００円です。',correct:'-400円です。',wrong:'400円です。'},
  {format:'定員の下限',pages:['開催に必要な人数は30人以上です。','別の催しは60人以上です。'],quote:'開催に必要な人数は30人以上です。',correct:'30人以上です。',wrong:'60人以上です。'},
  {format:'下限と上限の区別',pages:['開催条件は30人以上です。','別の催しの募集人数は30人以下です。'],quote:'開催条件は30人以上です。',correct:'30人以上です。',wrong:'30人以下です。'},
  {format:'上限を含まない割合',pages:['対象となる割合は10%未満です。','別区分は10%以下です。'],quote:'対象となる割合は10%未満です。',correct:'10%未満です。',wrong:'10%以下です。'},
];

const savedFetch = globalThis.fetch;
let passed = 0;
try {
  for (const {format,pages,quote,correct,wrong} of cases) {
    for (const [answer,page,expected] of [[correct,1,true],[wrong,1,false],[correct,2,false]]) {
      globalThis.fetch = async ()=>Response.json({choices:[{finish_reason:'stop',message:{
        content:JSON.stringify({items:[{label:format,answer,sources:[{page,quote}]}]}),
      }}]});
      const env = {OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:name=>name,get:()=>({
        fetch:async url=>Response.json(url.endsWith('/data') ? {pages,owner:'author'} : null),
      })}};
      const response = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
        method:'POST',body:JSON.stringify({question:'資料の記載を教えてください。'}),
      }),env,{uid:'author'});
      const result = await response.json();
      const ok = expected ? result.items[0]?.answer===answer && result.pages.join()==='1'
        : result.items[0]?.answer===null && result.pages.length===0;
      if (ok) passed++;
      console.log(format,expected?'正しい根拠':page===2?'誤ったページ':'根拠にない数値',ok?'PASS':'FAIL');
    }
  }
} finally {
  globalThis.fetch = savedFetch;
}
console.log(`${passed}/${cases.length*3}`);
assert.equal(passed,cases.length*3);
