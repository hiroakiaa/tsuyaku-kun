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
try {
  const documentPages=Array.from({length:20},()=> '施設の案内です。'.repeat(70));
  documentPages[3]='施設の受付は入口の右にあります。';
  documentPages[15]='施設の休館日は火曜日です。';
  let calls=0;
  globalThis.fetch=async (_url,{body})=>{
    const passages=JSON.parse(JSON.parse(body).messages.at(-1).content).資料;
    calls++;
    const items=passages.length<documentPages.length
      ? [{label:'受付',answer:'入口の右です。',sources:[{page:4,quote:documentPages[3]}]},
         {label:'休館日',answer:null,sources:[]}]
      : [{label:'休館日',answer:'火曜日です。',sources:[{page:16,quote:documentPages[15]}]}];
    if (JSON.parse(body).stream) {
      const data = {choices:[{delta:{content:JSON.stringify({items})},finish_reason:'stop'}]};
      return new Response('data: '+JSON.stringify(data)+'\n\ndata: [DONE]\n\n');
    }
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items})}}]});
  };
  const environment={...env,AI:undefined,ROOMS:{...env.ROOMS,get:()=>({
    async fetch(url) { return Response.json(url.endsWith('/data') ? {pages:documentPages,owner:'author'} : null); },
  })}};
  const response=await documents(new Request('https://test/documents/20000000-0000-0000-0000-000000000000/ask',{
    method:'POST',body:JSON.stringify({question:'受付の場所と休館日を教えてください。'}),
  }),environment,{uid:'author'});
  const result=await response.json();
  assert.equal(calls,2);
  assert.deepEqual(result.items.map(({label,answer,evidence})=>[label,answer,evidence[0]?.page]),[
    ['受付','入口の右です。',4],
    ['休館日','火曜日です。',16],
  ]);
  calls=0;
  const streamed=await documents(new Request('https://test/documents/20000000-0000-0000-0000-000000000000/ask',{
    method:'POST',headers:{Accept:'application/x-ndjson'},
    body:JSON.stringify({question:'受付の場所と休館日を教えてください。'}),
  }),environment,{uid:'author'});
  const events=(await streamed.text()).trim().split('\n').map(JSON.parse);
  const first=events.findIndex(event=>event.item?.answer==='入口の右です。');
  const review=events.findIndex(event=>event.status==='資料全体を確認しています…');
  const replacement=events.findIndex(event=>event.replaceItems?.some(item=>item.answer==='火曜日です。'));
  assert.equal(calls,2);
  assert.ok(first>=0 && first<review && review<replacement,JSON.stringify(events));
  assert.ok(events.slice(0,replacement).every(event=>!event.item || event.item.answer));
  assert.deepEqual(events[replacement].replaceItems.map(item=>item.evidence[0].page),[4,16]);
  assert.equal(events.at(-1).done,true);
} finally {
  globalThis.fetch=originalFetch;
}
console.log('PASS full review retains earlier grounded answers and completes missing items');
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
  assert.deepEqual((await ask('At what time does the library shut?')).pages,[2,1]);
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
  assert.equal(inventedQuote.items.length,1);
  assert.equal(inventedQuote.items[0].answer,null);
  assert.deepEqual(inventedQuote.items[0].evidence,[]);
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
    },list:async()=>new Map()});
    assert.equal(response.status,200,path);
  }
}
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
assert.equal(scheduledExpiration,undefined);
assert.ok(expiredStorage.has('pdf:0'));
expiredStorage.set('semantic-index:0','vectors');
expiredStorage.set('answer:test','cached answer');
const expiredRoom = new TranslationRoom({
  storage:documentStore,
  getWebSockets:()=>[],
},{});
await expiredRoom.alarm();
assert.ok(expiredStorage.has('document'));
assert.ok(expiredStorage.has('pdf:0'));
assert.ok(expiredStorage.has('semantic-index:0'));
assert.ok(expiredStorage.has('answer:test'));
for (const owner of ['another-user','author']) {
  const result = await documentStorage(new Request('https://room/document/remove',{method:'POST',body:owner}),documentStore);
  assert.equal(result.status,owner==='author' ? 200 : 403);
}
assert.equal(expiredStorage.size,0);
console.log('PASS legacy document remains available after its alarm and can be removed by its creator');
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

const dismissalTable = [
  '月 | 部活終了 | 下校完了 | 月 | 部活終了 | 下校完了',
  '4 | 16:45 | 17:00 | 10 | 16:30 | 16:45',
  '5 | 16:45 | 17:00 | 11 | 16:10 | 16:25',
  '6 | 16:45 | 17:00 | 12 | 16:10 | 16:25',
  '7 | 16:45 | 17:00 | 1 | 16:30 | 16:45',
  '8 | 16:30 | 16:45 | 2 | 16:30 | 16:45',
  '9 | 16:30 | 16:45 | 3 | 16:30 | 16:45',
].join('\n');
const dismissalEnv = {ROOMS:{idFromName:name=>name,get:()=>({
  fetch:async url=>Response.json(url.endsWith('/data')
    ? {pages:['学校案内',dismissalTable],owner:'author',sourceType:'pdf'} : null),
})}};
for (const [question,label,answer] of [
  ['请用中文说明4月和11月全体学生完成离校的时间。','离校完成时间','4月：17:00\n11月：16:25'],
  ['Em português, a que horas todos os alunos devem ter saído da escola em abril e novembro?','Horário limite de saída','abril: 17:00\nnovembro: 16:25'],
]) {
  const response = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST',headers:{Accept:'application/x-ndjson'},body:JSON.stringify({question}),
  }),dismissalEnv,{uid:'author'});
  assert.equal(response.status,200);
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events,[{item:{label,answer,evidence:[{page:2,quote:dismissalTable}]}},{done:true}]);
}
console.log('PASS localized dismissal reads completion column and preserves source');

{
  const scheduleCases = [
    ['When does the library close?','15:00',['Library | 9 AM | 3 PM','Library | 9 AM | 1 PM'],[1,2]],
    ['When does the library close?','3 PM and 1 PM',['Library | 9 AM | 3 PM','Library | 9 AM | 1 PM'],[]],
    ['When is the last admission for the library?','3 PM and 1 PM',['Library | 9 AM | 3 PM','Library | 9 AM | 1 PM'],[]],
    ['When does the library close?','Weekdays at 3 PM and Saturdays at 1 PM',
      ['Library | Weekdays | 3 PM','Library | Saturdays | 1 PM'],[1,2,3]],
  ];
  const fetchBefore=globalThis.fetch;
  try {
    for (const [question,answer,rows,expected] of scheduleCases) {
      const pages=['Facility | Opening or day | Closing',...rows];
      const sources=pages.map((quote,index)=>({page:index+1,quote}));
      globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{
        content:JSON.stringify({items:[{label:'Library',answer,sources}]}),
      }}]});
      const result=await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:'test'},pages,question,'full');
      assert.equal(result.items[0].answer,expected.length ? answer : null);
      assert.deepEqual(result.items[0].evidence.map(source=>source.page),expected);
    }
  } finally {
    globalThis.fetch=fetchBefore;
  }
  console.log('PASS timetable citations distinguish unsupported conflicts and labeled schedules');
}

{
  const pages=[
    'Facility | Opening | Closing\nLibrary | 9 AM | 3 PM',
    'Facility | Opening | Last admission\nLibrary | 9 AM | 1 PM',
  ];
  const env={ROOMS:{idFromName:id=>id,get:()=>({
    fetch:async url=>{
      assert.ok(url.endsWith('/data'),'A confirmed timetable answer should bypass generation and cache');
      return Response.json({pages,sourceType:'pdf',owner:'author'});
    },
  })}};
  for (const [question,answer,page] of [
    ['When does the library close?','3 PM',1],
    ['When is the last admission for the library?','1 PM',2],
  ]) {
    const request=new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question}),
    });
    const result=await (await documents(request,env,{uid:'author'})).json();
    assert.equal(result.answer,answer);
    const [heading,row]=pages[page-1].split('\n');
    assert.deepEqual(result.items[0].evidence,[{page,quote:row},{page,quote:heading}]);
  }
  console.log('PASS repeated timetable headings distinguish closing and last admission');
}

{
  const pages=[
    '施設 | 開館時刻 | 閉館時刻\n図書館 | 午前９時 | 午後３時',
    '施設 | 開館時刻 | 最終⼊館時刻\n図書館 | 午前９時 | 午後１時',
  ];
  const env={ROOMS:{idFromName:id=>id,get:()=>({
    fetch:async url=>{
      assert.ok(url.endsWith('/data'),'A confirmed timetable answer should bypass generation and cache');
      return Response.json({pages,sourceType:'pdf',owner:'author'});
    },
  })}};
  for (const [question,answer,page] of [
    ['図書館の閉館時刻は？','午後３時',1],
    ['図書館の最終入館時刻は？','午後１時',2],
  ]) {
    const request=new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question}),
    });
    const result=await (await documents(request,env,{uid:'author'})).json();
    assert.equal(result.answer,answer);
    const [heading,row]=pages[page-1].split('\n');
    assert.deepEqual(result.items[0].evidence,[{page,quote:row},{page,quote:heading}]);
  }
  console.log('PASS Japanese timetable headings normalize compatible glyphs');
}

{
  const pages=[[
    'Exhibition admission','Visitor | Fee','Students 420 yen','',
    'Workshop admission','Visitor | Fee','Students | 650 yen',
  ].join('\n')];
  const env={ROOMS:{idFromName:id=>id,get:()=>({
    fetch:async url=>{
      assert.ok(url.endsWith('/data'),'A confirmed fee must bypass answer generation');
      return Response.json({pages,sourceType:'pdf',owner:'author'});
    },
  })}};
  for (const [title,answer,row] of [
    ['Exhibition admission','420 yen','Students 420 yen'],
    ['Workshop admission','650 yen','Students | 650 yen'],
  ]) {
    const request=new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',
      headers:{Accept:'application/x-ndjson'},
      body:JSON.stringify({question:'What is the student '+title+' fee?'}),
    });
    const response=await documents(request,env,{uid:'author'});
    assert.equal(response.status,200);
    assert.deepEqual((await response.text()).trim().split('\n').map(JSON.parse),[
      {item:{label:title,answer,evidence:[{page:1,quote:row},{page:1,quote:title}]}},
      {done:true},
    ]);
  }
  console.log('PASS adjacent fee tables preserve their own titles and values');
}

{
  const guide = Array.from({length:24},()=> '展示室では写真を撮影できます。'.repeat(48));
  guide[5] = '団体見学の予約は利用日の14日前までに申し込んでください。';
  guide[20] = '団体見学のキャンセルは利用日の3日前までに連絡してください。';
  const expectedPages = [6,21];
  try {
    globalThis.fetch = async (_url,{body})=>{
      const {資料:passages} = JSON.parse(JSON.parse(body).messages[1].content);
      assert.ok(expectedPages.every(page=>passages.some(passage=>passage.page===page)));
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
        items:[{label:'団体見学',answer:'予約は14日前まで、キャンセルは3日前までです。',
          sources:expectedPages.map(page=>({page,quote:guide[page-1]}))}],
      })}}]});
    };
    const result = await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:'test'},guide,
      '団体見学の予約とキャンセルはそれぞれ何日前まで？','search');
    assert.ok(expectedPages.every(page=>result.candidatePages.includes(page)));
    assert.ok(result.candidatePages.length<guide.length);
    assert.deepEqual(result.items.flatMap(item=>item.evidence.map(source=>source.page)),expectedPages);
    console.log('PASS group visit deadlines retrieve both evidence pages from '+result.candidatePages.length+' candidates');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const cacheFixture = {sourceType:'pdf',owner:'author',pages:['第一ページの説明。','第二ページの説明。']};
const cachedPageKeys = new Set();
const cacheEnv = {ROOMS:{idFromName:name=>name,get:()=>({
  async fetch(url) {
    if (url.endsWith('/data')) return Response.json(cacheFixture);
    assert.match(url,/\/document\/page-translation\/[a-f0-9]{64}$/);
    const reuse=cachedPageKeys.has(url) ? 'cache' : 'generated';
    cachedPageKeys.add(url);
    return Response.json({reuse});
  },
})}};
async function translateFixture(page,language='en') {
  const response=await documents(new Request('https://test/documents/30000000-0000-0000-0000-000000000000/translate',{
    method:'POST',body:JSON.stringify({page,language,layoutText:cacheFixture.pages[page-1]}),
  }),cacheEnv,{uid:'author'});
  assert.equal(response.status,200);
  return (await response.json()).reuse;
}
assert.equal(await translateFixture(1),'generated');
assert.equal(await translateFixture(2),'generated');
cacheFixture.pages[1]='差し替え後の第二ページ。';
cacheFixture.revision=1;
assert.equal(await translateFixture(1),'cache');
assert.equal(await translateFixture(2),'generated');
assert.equal(await translateFixture(2),'cache');
assert.equal(await translateFixture(1,'es'),'generated');
console.log('PASS PDF translation cache keys only change for edited pages or languages');

{
  const reordered='Facility\nWeekday admission\nWeekend admission\nAdult\nChild\nAdult\nChild\nMuseum\n800 yen\n300 yen\n1000 yen\n500 yen';
  const stored='Weekday admission | Weekend admission\nFacility\nAdult | Child | Adult | Child\nMuseum | 800 yen | 300 yen | 1000 yen | 500 yen';
  const translationEnv={ROOMS:{idFromName:id=>id,get:()=>({
    async fetch(url,options) {
      if (url.endsWith('/data')) return Response.json({sourceType:'pdf',owner:'author',pages:[stored]});
      return Response.json(JSON.parse(options.body));
    },
  })}};
  for (const [layoutText,expected] of [[reordered,true],[reordered.replace('1000 yen','1001 yen'),false],
    [reordered.replace('\nAdult\nChild\nMuseum','\nChild\nChild\nMuseum'),false]]) {
    const response=await documents(new Request('https://test/documents/30000000-0000-0000-0000-000000000000/translate',{
      method:'POST',body:JSON.stringify({page:1,language:'es',layoutText}),
    }),translationEnv,{uid:'author'});
    const result=await response.json();
    assert.equal(result.hasLayout,expected);
    assert.equal(result.text,expected ? reordered : stored);
  }
  for (const [layoutText,diagramText,expected] of [
    [reordered,'先生が話す',true],
    [reordered.replace('1000 yen','1001 yen'),'先生が話す',false],
    [reordered,'字'.repeat(4001),false],
  ]) {
    const response=await documents(new Request('https://test/documents/30000000-0000-0000-0000-000000000000/translate',{
      method:'POST',body:JSON.stringify({page:1,language:'es',layoutText,diagramText}),
    }),translationEnv,{uid:'author'});
    const result=await response.json();
    assert.equal(result.includesDiagram===true,expected);
    assert.equal(result.text.includes('先生が話す'),expected);
    if (diagramText.length>4000) assert.equal(result.text,reordered);
  }

}


{
  const pages=[[
    'Weekday admission | Weekend admission',
    'Facility',
    'Adult | Child | Adult | Child',
    'Science museum | 500 yen | 200 yen | 800 yen | 300 yen',
    'Art museum | 800 yen | 300 yen | 1000 yen | 500 yen',
  ].join('\n')];
  const environment={ROOMS:{idFromName:id=>id,get:()=>({
    fetch:async url=>{
      assert.ok(url.endsWith('/data'),'Grouped fee must use table lookup');
      return Response.json({pages,sourceType:'pdf',owner:'author'});
    },
  })}};
  const ambiguous='I am visiting the art museum. What single adult admission price applies to my visit?';
  for (const [question,previousQuestion,expected] of [
    [ambiguous,undefined,'Are you visiting on a weekday or a weekend?'],
    ['On a weekend.',ambiguous,'1000 yen'],
    ['How much is adult admission at the art museum?',undefined,'800 yen on weekdays, 1000 yen on weekends'],
  ]) {
    const response=await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question,previousQuestion}),
    }),environment,{uid:'author'});
    const [item]=(await response.json()).items;
    assert.equal(item.answer,expected);
    assert.match(item.evidence[0].quote,/^Art museum \|/);
    assert.match(item.evidence[1].quote,/Weekday admission.*Weekend admission/);
  }
}

{
  const pages=['初級講習の受講料は320円です。','上級講習の受講料は760円です。'];
  const environment={ROOMS:{idFromName:id=>id,get:()=>({
    fetch:async url=>{
      assert.ok(url.endsWith('/data'),'Course fees must use their verified source');
      return Response.json({pages,sourceType:'pdf',owner:'author'});
    },
  })}};
  const question='受講料を一つ教えてください。';
  for (const [text,previousQuestion,answer,citations] of [
    [question,undefined,'初級講習・上級講習のうち、どれですか？',[1,2]],
    ['上級講習です。',question,'760円',[2]],
  ]) {
    const response=await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
      method:'POST',body:JSON.stringify({question:text,previousQuestion}),
    }),environment,{uid:'author'});
    const [item]=(await response.json()).items;
    assert.equal(item.answer,answer);
    assert.deepEqual(item.evidence.map(source=>source.page),citations);
  }
}
