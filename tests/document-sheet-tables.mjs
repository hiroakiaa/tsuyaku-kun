import assert from 'node:assert/strict';
import {documents} from '../server/documents.js';
const pages = [
  'R9入試表\nA1 学校 | B1 コース | C1 入試\nC2 定員 | D2 日程\nA3 青空高校 | B3 普通 | C3 40\n結合セル範囲: C1:D1, A3:A4',
  'R9入試表\nB4 特進 | C4 20\n結合セル範囲: A3:A4',
  'R9料金表\nA1 区分 | B1 利用者 | C1 料金\nC2 平日 | D2 休日\nA3 会議室 | B3 大人 | D3 900円\nB4 子ども | D4 450円\n結合セル範囲: C1:D1, A3:A4',
  'R9予定表\nA1 行事 | B1 対象 | C1 時刻\nC2 開始 | D2 終了\nA3 説明会 | B3 午前組 | C3 10:00\nB4 午後組 | C4 14:00\n結合セル範囲: C1:D1, A3:A4',
  'R8料金表\nA1 区分 | B1 利用者 | C1 料金\nC2 平日 | D2 休日\nA3 会議室 | B3 大人 | D3 800円\nB4 子ども | D4 400円\n結合セル範囲: C1:D1, A3:A4',
];
const env = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages,sourceType:'xlsx'})})}};
for(const [question,value,sheet,cell,page] of [
  ['令和9年度の青空高校の特進の入試定員は？','20','R9入試表','C4',2],
  ['令和9年度の会議室の子どもの休日料金は？','450円','R9料金表','D4',3],
  ['説明会の午後組の開始時刻は？','14:00','R9予定表','C4',4],
  ['会議室の子どもの休日料金は？','令和8年度',null,null,null],
]){
  const request=new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body:JSON.stringify({question})});
  const result=await (await documents(request,env,{uid:'test'})).json();
  assert.ok(result.answer.includes(value),question);
  if(sheet) assert.ok(result.items[0].evidence.some(e=>e.sheet===sheet&&e.cell===cell&&e.page===page),question);
  else assert.deepEqual(result.pages,[]);
}

const followup = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST', body:JSON.stringify({question:'令和8年度です',previousQuestion:'会議室の子どもの休日料金は？'}),
}),env,{uid:'test'});
const clarified = await followup.json();
assert.equal(clarified.answer,'400円');
assert.ok(clarified.items[0].evidence.some(e=>e.sheet==='R8料金表' && e.cell==='D4' && e.page===5));
