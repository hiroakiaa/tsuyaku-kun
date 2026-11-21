import assert from 'node:assert/strict';
import {documents} from '../server/documents.js';

const cases = [
 {format:'英ポンド',pages:['The fee is GBP 25.','Another fee is GBP 30.'],quote:'The fee is GBP 25.',correct:'£25',wrong:'£30'},
 {format:'フラン',pages:['The fee is 25 Swiss francs.','Another fee is CHF 30.'],quote:'The fee is 25 Swiss francs.',correct:'CHF 25',wrong:'CHF 30'},
 {format:'人民元のコード',pages:['The fee is CNY 300.','Another fee is CNY 330.'],quote:'The fee is CNY 300.',correct:'RMB 300',wrong:'RMB 330'},
 {format:'英ポンド小数',pages:['The fee is £.50.','Another fee is £.60.'],quote:'The fee is £.50.',correct:'GBP 0.50',wrong:'GBP 0.60'},
 {format:'通貨の取り違え',pages:['The fee is GBP 25.','Another fee is EUR 25.'],quote:'The fee is GBP 25.',correct:'GBP 25',wrong:'EUR 25'},
 {format:'英語の人数',pages:['The group has 20 people.','Another group has 30 people.'],quote:'The group has 20 people.',correct:'20人',wrong:'30人'},
 {format:'英語の参加者人数',pages:['There are 20 participants.','Another event has 30 participants.'],quote:'There are 20 participants.',correct:'20名',wrong:'30名'},
 {format:'英語の下限',pages:['At least 20 people are required.','Another group has at most 20 people.'],quote:'At least 20 people are required.',correct:'20人以上',wrong:'20人以下'},
 {format:'英語の上限',pages:['At most 20 people may attend.','Another group has at least 20 people.'],quote:'At most 20 people may attend.',correct:'20人以下',wrong:'20人以上'},
 {format:'英語の未満',pages:['The fee is less than 20 euros.','Another fee is over 20 euros.'],quote:'The fee is less than 20 euros.',correct:'20 EUR未満',wrong:'20 EUR超'},
 {format:'英語の重量条件',pages:['The weight is at most 5 kg.','Another limit is at least 5 kg.'],quote:'The weight is at most 5 kg.',correct:'5000 g以下',wrong:'5000 g以上'},

  {format:'英語円の日本語回答',pages:['The annual membership fee is 2400 yen.','Other fees are 300 yen.'],quote:'The annual membership fee is 2400 yen.',correct:'2400円です。',wrong:'300円です。'},
  {format:'円の接頭表記',pages:['The cost is JPY 2,400.','Other fees are ¥300.'],quote:'The cost is JPY 2,400.',correct:'2400円です。',wrong:'300円です。'},
  {format:'ドル金額',pages:['The fee is 25 US dollars.','Other fee is USD 30.'],quote:'The fee is 25 US dollars.',correct:'USD 25',wrong:'USD 30'},
  {format:'通貨単位違い',pages:['The fee is 25 euros.','Other fee is 25 US dollars.'],quote:'The fee is 25 euros.',correct:'EUR 25',wrong:'USD 25'},
  {format:'漢数字の金額',pages:['交付手数料は二百円です。','郵送料は四百円です。'],quote:'交付手数料は二百円です。',correct:'200円です。',wrong:'400円です。'},
  {format:'日付表記の変換',pages:['説明会は2027年4月8日です。','別の説明会は2027年4月9日です。'],quote:'説明会は2027年4月8日です。',correct:'April 8, 2027',wrong:'April 9, 2027'},
  {format:'年度の変化',pages:['説明会は2027年4月8日です。','別の年度は2028年4月8日です。'],quote:'説明会は2027年4月8日です。',correct:'2027-04-08',wrong:'2028-04-08'},
  {format:'和暦の日付',pages:['説明会は令和9年4月8日です。','別の日程は令和9年4月9日です。'],quote:'説明会は令和9年4月8日です。',correct:'2027-04-08',wrong:'2027-04-09'},
  {format:'重量換算',pages:['荷物の重さは5 kgまでです。','別の荷物は500 gです。'],quote:'荷物の重さは5 kgまでです。',correct:'5000 gまでです。',wrong:'500 gまでです。'},
  {format:'長さ換算',pages:['長さは300 cmです。','別の設備は3 kmです。'],quote:'長さは300 cmです。',correct:'3 mです。',wrong:'3 kmです。'},
  {format:'容量の単位',pages:['ファイルは5 MBまでです。','別プランは5 GBまでです。'],quote:'ファイルは5 MBまでです。',correct:'5000 KBまでです。',wrong:'5 GBまでです。'},

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

try{
 for(const [quote,calculation,expected] of [
  [multiFeeQuote,[{amount:8000,count:1},{amount:1500,count:12,countUnit:'か月'},{amount:1200,count:1}],'8000円＋1500円×12か月＋1200円＝27200円'],
  [discountQuote,[{amount:1200,count:1,halve:true},{amount:300,count:1}],'1200円÷2＋300円＝900円'],
  [discountQuote,[{amount:1200,count:1,halve:true},{amount:300,count:1,halve:true}],null],
  [multiFeeQuote,[{amount:1500,count:13,countUnit:'か月'}],null],
 ]){
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{label:'費用',answer:'999999円です。',calculation,sources:[{page:1,quote}]}]})}}]});
  const env={...feeEnv,ROOMS:{idFromName:x=>x,get:()=>({fetch:async url=>Response.json(url.endsWith('/data')?{pages:[quote],owner:'author'}:null)})}};
  const result=await(await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body:JSON.stringify({question:'費用の合計は？'})}),env,{uid:'author'})).json();assert.equal(result.items[0]?.answer,expected);
 }
}finally{globalThis.fetch=savedFetch;}
console.log('PASS server computes grounded operands instead of trusting model arithmetic; invalid counts and excluded discounts cannot repair answers');
