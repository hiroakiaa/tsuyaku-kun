import assert from 'node:assert/strict';
import {documents,documentStorage,evaluateDocumentQuestion} from '../server/documents.js';

import {TranslationRoom} from '../server/worker.js';

const pages = Array.from({length:20},()=> '校舎の案内です。'.repeat(32));
pages[15] = '冷房は午後2時から運転します。';
let vectors;
const inputs = [];
const room = {
  async fetch(url,options) {
    if (url.endsWith('/data')) return Response.json({pages,owner:'author'});
    if (url.includes('/vectors/')) {
      if (options?.method==='POST') vectors = JSON.parse(options.body);
      return Response.json(vectors ?? null);
    }
    return Response.json(null);
  },
};
const env = {
  ROOMS:{get:()=>room,idFromName:name=>name},
  OPENAI_DOCUMENT_QA_KEY:'test',
  AI:{async run(_model,{text}) {
    inputs.push(text.length);
    return {data:text.map((value,i)=>i===0 || value===pages[15] ? [1,0] : [0,1])};
  }},
};
const originalFetch = globalThis.fetch;
try {
  let expectFullDocument = false;
  globalThis.fetch = async (_url,{body})=>{
    const payload = JSON.parse(JSON.parse(body).messages[1].content);
    if (expectFullDocument) assert.equal(payload.資料.length,pages.length);
    else assert.ok(payload.資料.length<pages.length);
    assert.ok(payload.資料.some(passage=>passage.page===16));
    const items = [{label:'冷房',answer:'午後2時からです。',sources:[{page:16,quote:pages[15]}]}];
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items})}}]});
  };
  for (const [question,expected] of [['When does cooling start?','computed'],['When is the AC switched on?','reused']]) {
    const req = new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question}),
    });
    const res = await documents(req,env,{uid:'author'});
    assert.equal(res.status,200);
    const result = await res.json();
    assert.equal(result.semanticIndex,expected);
    assert.deepEqual(result.pages,[16]);
  }
  assert.deepEqual(inputs,[pages.length+1,1]);
  const evaluation = await evaluateDocumentQuestion(env,pages,'When does cooling start?','search');
  assert.ok(evaluation.candidatePages.includes(16));
  assert.ok(evaluation.candidatePages.length < pages.length);
  assert.equal(new Set(evaluation.candidatePages).size,evaluation.candidatePages.length);
  assert.deepEqual(Object.keys(evaluation.timing).sort(),['generationMs','retrievalMs']);
  for (const milliseconds of Object.values(evaluation.timing)) {
    assert.ok(Number.isInteger(milliseconds) && milliseconds>=0);
  }
  expectFullDocument = true;
  const full = await evaluateDocumentQuestion(env,pages,'When does cooling start?','full');
  assert.equal(full.timing.retrievalMs,null);
  assert.ok(Number.isInteger(full.timing.generationMs) && full.timing.generationMs>=0);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS document QA semantic retrieval reuses document vectors');
const japanesePages = Array.from({length:20},()=> '施設の紹介です。'.repeat(70));
japanesePages[12] = '山 本 学 園の出願は11月20日までです。';
const lexicalEnv = {
  OPENAI_DOCUMENT_QA_KEY:'test',
  ROOMS:{idFromName:name=>name,get:()=>({
    async fetch(url) {
      return Response.json(url.endsWith('/data') ? {pages:japanesePages,owner:'author'} : null);
    },
  })},
};
try {

  globalThis.fetch = async (_url,{body})=>{
    const {資料:passages} = JSON.parse(JSON.parse(body).messages[1].content);
    assert.ok(passages.length<japanesePages.length);
    assert.ok(passages.some(passage=>passage.page===13));
    const items = [{label:'出願期限',answer:'11月20日です。',sources:[
      {page:12,quote:japanesePages[12]},
      {page:13,quote:japanesePages[12]},
    ]}];
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items})}}]});
  };
  const response = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST',body:JSON.stringify({question:'山本学園の出願期限は？'}),
  }),lexicalEnv,{uid:'author'});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.deepEqual(result.items[0].evidence.map(source=>source.page),[13]);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS spaced Japanese keywords retrieve the right page and reject a wrong-page citation');
const admissionsPage = '北学園の一般入試は5科13以上。\n南学園の一般入試は9科15以上。';
try {
  globalThis.fetch = async ()=>Response.json({choices:[{finish_reason:'stop',message:{
    content:JSON.stringify({items:[{label:'一般入試',answer:'5科13以上。',sources:[{page:1,quote:'北学園の一般入試は5科13以上。'}]}]}),
  }}]});
  const env = {OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:name=>name,get:()=>({
    fetch:async url=>Response.json(url.endsWith('/data') ? {pages:[admissionsPage],owner:'author'} : null),
  })}};
  const response = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST',body:JSON.stringify({question:'南学園の一般入試の基準は？',previousQuestion:'北学園高校の一般入試は？'}),
  }),env,{uid:'author'});
  const result = await response.json();
  assert.equal(result.items[0].answer,null);
  assert.deepEqual(result.pages,[]);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS rejects another school on the same PDF page');
const tablePages = ['Facility | Opening | Closing','Library | 9 AM | 3 PM'];
let tableQuote = tablePages[1];
try {
  globalThis.fetch = async ()=>Response.json({choices:[{finish_reason:'stop',message:{
    content:JSON.stringify({items:[{label:'Library',answer:'3 PM',sources:[{page:2,quote:tableQuote}]}]}),
  }}]});
  const env = {OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:name=>name,get:()=>({
    fetch:async url=>Response.json(url.endsWith('/data') ? {pages:tablePages,owner:'author'} : null),
  })}};
  const ask = async question=>(await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST',body:JSON.stringify({question}),
  }),env,{uid:'author'})).json();
  assert.deepEqual((await ask('When does the library close?')).pages,[2,1]);
  assert.deepEqual((await ask('What is the Library capacity?')).pages,[2]);
  assert.deepEqual((await ask('図書館は何時に閉まりますか？')).pages,[2,1]);
  assert.deepEqual((await ask('図書館の定員は？')).pages,[2]);
  tablePages[0] = 'Facility | Hours\nOpening | Closing';
  assert.deepEqual((await ask('When does the library close?')).pages,[2,1]);
  tablePages[0] = 'Hours\nFacility\nOpening | Closing';
  tableQuote = '3 PM';
  assert.deepEqual((await ask('When does the library close?')).pages,[2,1]);
  tableQuote = 'Library | 9 AM | 3 PM. Members can stay until 6 PM.';
  const inventedQuote = await ask('図書館の閉館時刻を教えてください。');
  assert.deepEqual(inventedQuote.pages,[]);
  assert.ok(inventedQuote.items.every(item=>!item.answer && !item.evidence.length));
} finally {
  globalThis.fetch = originalFetch;
}

try {
  const payloads = [];
  globalThis.fetch = async (_url,options)=>{
    payloads.push(JSON.parse(options.body));
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"items":[]}'}}]});
  };
  const env = {OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:name=>name,get:()=>({
    fetch:async()=>Response.json(null),
  })}};
  const form = new FormData();
  const ocrText = 'The swimming pool opens at 8 AM.';
  form.set('pdf',new File(['%PDF-1.7 synthetic scan bytes'],'scan.pdf',{type:'application/pdf'}));
  form.set('title','Scan');
  form.set('pages',JSON.stringify([ocrText]));
  const response = await documents(new Request('https://test/documents',{method:'POST',body:form}),env,{uid:'author'});
  assert.equal(response.status,201);
  assert.equal(payloads.length,1);
  const sent = JSON.stringify(payloads[0]);
  assert.ok(sent.includes(ocrText));
  assert.doesNotMatch(sent,/image_url|data:image|synthetic scan bytes/);
} finally {
  globalThis.fetch = originalFetch;
}

try {
  const rows = [
    '月 | 部活終了 | 下校完了 | 月 | 部活終了 | 下校完了',
    '4 | 16:45 | 17:00 | 10 | 16:30 | 16:45',
    '5 | 16:45 | 17:00 | 11 | 16:10 | 16:25',
    '6 | 16:45 | 17:00 | 12 | 16:10 | 16:25',
    '7 | 16:45 | 17:00 | 1 | 16:30 | 16:45',
    '8 | 16:30 | 16:45 | 2 | 16:30 | 16:45',
    '9 | 16:30 | 16:45 | 3 | 16:30 | 16:45',
  ].join('\n');
  const verticalRows = ['月 | 部活動終了時刻 | 下校完了時刻', ...rows.split('\n').slice(1).flatMap(line=>{
    const cells = line.split(' | ');
    return [cells.slice(0,3),cells.slice(3)].map(([month,end,leave])=>[month+'月',end,leave].join(' | '));
  })].join('\n');
  for (const table of [rows,verticalRows]) {
    globalThis.fetch = async ()=>Response.json({choices:[{finish_reason:'stop',message:{
      content:JSON.stringify({items:[{label:'下校',answer:'4月から9月は17:00です。',sources:[{page:1,quote:table}]}]}),
    }}]});
    const env = {OPENAI_DOCUMENT_QA_KEY:'test',ROOMS:{idFromName:name=>name,get:()=>({
      fetch:async url=>Response.json(url.endsWith('/data') ? {pages:['学校生活の案内\n'+table],owner:'author'} : null),
    })}};
    const result = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question:'下校の時刻は何時ですか？'}),
    }),env,{uid:'author'});
    const data = await result.json();
    assert.deepEqual(data.pages,[1]);
    assert.equal(data.items[0].evidence[0].quote,table);
    assert.match(JSON.stringify(data),/8月：部活終了16:30、下校完了16:45/);
    assert.match(JSON.stringify(data),/9月：部活終了16:30、下校完了16:45/);
  }
} finally {
  globalThis.fetch = originalFetch;
}

const privateRecord = {owner:'author', visibility:'device', expires:Date.now()+60_000};
for (const path of ['data','pdf']) {
  const response = await documentStorage(new Request('https://room/document/'+path,{
    headers:{'X-Document-Viewer':'another-user'},
  }),{get:async key=>{
    assert.equal(key,'document');
    return privateRecord;
  }});
  assert.equal(response.status,404,path);
}

const expiredRecord = {...privateRecord, visibility:'shared', expires:Date.now()-1};
for (const viewer of ['author','another-user']) {
  for (const path of ['data','pdf']) {
    const response = await documentStorage(new Request('https://room/document/'+path,{
      headers:{'X-Document-Viewer':viewer},
    }),{get:async key=>{
      assert.equal(key,'document');
      return expiredRecord;
    }});
    assert.equal(response.status,404,path);
  }
}
const activeEntry = {id:'active',expires:privateRecord.expires};
const expiredEntry = {id:'expired',expires:expiredRecord.expires};
const libraryResponse = await documentStorage(new Request('https://room/document/library'),{
  list:async ()=>new Map([['entry:expired',expiredEntry],['entry:active',activeEntry]]),
});
assert.equal(libraryResponse.status,200);
assert.deepEqual(await libraryResponse.json(),[activeEntry]);
console.log('PASS expired shared document metadata and PDF are unavailable');
const expiredStorage = new Map();
let scheduledExpiration;
const documentStore = {
  get:async key=>expiredStorage.get(key),
  deleteAll:async ()=>expiredStorage.clear(),
  transaction:async callback=>callback({
    setAlarm:async time=>{scheduledExpiration=time;},
    put:async entries=>Object.entries(entries).forEach(([key,value])=>expiredStorage.set(key,value)),
  }),
};
const expiredUpload = new FormData();
expiredUpload.set('record',JSON.stringify({...expiredRecord,pages:['試験資料']}));
expiredUpload.set('pdf',new Blob(['pdf data']),'fixture.pdf');
const initialized = await documentStorage(new Request('https://room/document/init',{method:'POST',body:expiredUpload}),documentStore);
assert.equal(initialized.status,201);
assert.equal(scheduledExpiration,expiredRecord.expires);
assert.ok(expiredStorage.has('pdf:0'));
expiredStorage.set('semantic-index:0','vectors');
expiredStorage.set('answer:test','cached answer');
const expiredRoom = new TranslationRoom({
  storage:documentStore,
  getWebSockets:()=>[],
},{});
await expiredRoom.alarm();
assert.equal(expiredStorage.size,0);
console.log('PASS document expiration alarm clears stored PDF, vectors and answers');
const yearlyAdmissionPages = [
  'R8入試表\nA1 校名 | J1 一般入試\nA2 青空高校 | J2 9科14以上',
  'R9入試表\nA1 校名 | J1 一般入試\nA2 青空高校 | J2 9科16以上',
];
const yearlyAdmissionEnv = {ROOMS:{idFromName:name=>name,get:()=>({
  fetch:async url=>Response.json(url.endsWith('/data') ? {pages:yearlyAdmissionPages,owner:'author',sourceType:'xlsx'} : null),
})}};
const askAdmission = async (question,previousQuestion)=>(await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question,previousQuestion}),
}),yearlyAdmissionEnv,{uid:'author'})).json();
const ambiguousAdmission = '青空高校の一般入試の基準は？';
const clarification = await askAdmission(ambiguousAdmission);
assert.deepEqual(clarification.items[0].clarificationYears,['8','9']);
assert.deepEqual(clarification.pages,[]);
for (const [year,answer,page] of [['R8','9科14以上',1],['R9','9科16以上',2]]) {
  const resolved = await askAdmission(year,ambiguousAdmission);
  assert.equal(resolved.answer,answer);
  assert.deepEqual(resolved.pages,[page]);
}
console.log('PASS admissions clarification and both year-only replies');
