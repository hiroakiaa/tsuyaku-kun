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
  {format:'万円と端数',pages:['体験会の参加費は1万500円です。','見学の参加費は500円です。'],quote:'体験会の参加費は1万500円です。',correct:'10,500円です。',wrong:'500円です。'},
  {format:'小数の万円',pages:['年間利用料は1.2万円です。','月額利用料は2円です。'],quote:'年間利用料は1.2万円です。',correct:'12,000円です。',wrong:'2万円です。'},
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

const feePage='教材費は月400円を10回徴収します。登録費は初回のみ100円です。';
const feeEnv={OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:id=>id,get:()=>({
  async fetch(url) { return Response.json(url.endsWith('/data') ? {pages:[feePage],owner:'author'} : null); },
})}};
try {
  for (const [formula,expected] of [
    ['400円×10回＋100円＝4,100円',true],
    ['400円×11回＋100円＝4,500円',false],
    ['400円×10回＋100円＝4,200円',false],
  ]) {
    globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{
      content:JSON.stringify({items:[{label:'年間費用',answer:formula,sources:[{page:1,quote:feePage}]}]}),
    }}]});
    const response=await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question:'年間費用の合計を教えてください。'}),
    }),feeEnv,{uid:'author'});
    const result=await response.json();
    assert.equal(result.items[0]?.answer,expected ? formula : null);
  }
} finally {
  globalThis.fetch=savedFetch;
}
console.log('PASS annual fee totals require matching quoted amounts and counts');

const multiFeeQuote='入学費は8000円です。学年費は月1500円を12か月徴収します。保険料は年間1200円です。';
const multiFeeAnswer='学年費は1500円×12か月＝18000円。初年度は8000円＋1500円×12か月＋1200円＝27200円です。';
try{
  for(const [answer,expected] of [[multiFeeAnswer,true],[multiFeeAnswer.replace('27200','27300'),false],[multiFeeAnswer.replace('12か月＝','13か月＝'),false],[multiFeeAnswer.replaceAll('8000円','9000円').replace('27200','28200'),false]]){
    globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:'初年度費用',answer,sources:[{page:1,quote:multiFeeQuote}]}]})}}]});
    const env={...feeEnv,ROOMS:{idFromName:x=>x,get:()=>({fetch:async url=>Response.json(url.endsWith('/data')?{pages:[multiFeeQuote],owner:'author'}:null)})}};
    const response=await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body:JSON.stringify({question:'1年間にかかるお金の合計は？'})}),env,{uid:'author'});
    const result=await response.json();assert.equal(result.items[0]?.answer,expected?answer:null);
  }
}finally{globalThis.fetch=savedFetch;}
console.log('PASS multiple verified fee formulas retain correct subtotals and reject unsupported operands, counts, or totals');

const discountQuote='基本入館料は1200円です。中学生は基本入館料が半額になります。休日は300円を追加します。休日加算は割引の対象外です。';
try{
 for(const [answer,expected] of [['1200円÷2＋300円＝900円です。',true],['1200円÷2＝600円。600円＋300円＝900円です。',true],['1200円÷2＋300円÷2＝750円です。',false],['1200円÷2＋300円＝800円です。',false]]){
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:'休日の中学生料金',answer,sources:[{page:1,quote:discountQuote}]}]})}}]});
  const env={...feeEnv,ROOMS:{idFromName:x=>x,get:()=>({fetch:async url=>Response.json(url.endsWith('/data')?{pages:[discountQuote],owner:'author'}:null)})}};
  const result=await(await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body:JSON.stringify({question:'休日に中学生が入館すると合計いくら？'})}),env,{uid:'author'})).json();assert.equal(result.items[0]?.answer,expected?answer:null);
 }
}finally{globalThis.fetch=savedFetch;}
console.log('PASS half-price proof respects the undiscounted supplement and rejects wrong totals');
