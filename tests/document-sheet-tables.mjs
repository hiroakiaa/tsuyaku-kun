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
for(const [question,value,sheet,cell,page,context] of [
  ['令和9年度の青空高校の特進の入試定員は？','20','R9入試表','C4',2,[['A3',1],['B4',2],['C1',1],['C2',1]]],
  ['令和9年度の会議室の子どもの休日料金は？','450円','R9料金表','D4',3,[['A3',3],['B4',3],['C1',3],['D2',3]]],
  ['説明会の午後組の開始時刻は？','14:00','R9予定表','C4',4,[['A3',4],['B4',4],['C1',4],['C2',4]]],
  ['会議室の子どもの休日料金は？','令和8年度',null,null,null],
]){
  const request=new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{method:'POST',body:JSON.stringify({question})});
  const result=await (await documents(request,env,{uid:'test'})).json();
  assert.ok(result.answer.includes(value),question);
  if(sheet) assert.deepEqual(result.items.flatMap(item=>item.evidence.map(e=>[e.sheet,e.cell,e.page])),[...context,[cell,page]].map(([address,sourcePage])=>[sheet,address,sourcePage]),question);
  else {
    assert.equal(result.answer,'令和8年度・令和9年度のうち、どの年度ですか？');
    assert.deepEqual(result.pages,[]);
    assert.deepEqual(result.items.flatMap(item=>item.evidence),[]);
  }
}

for (const reply of ['令和8年度です','令和8年度','R8','Ｒ８']) {
  const followup = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST', body:JSON.stringify({question:reply,previousQuestion:'会議室の子どもの休日料金は？'}),
  }),env,{uid:'test'});
  const clarified = await followup.json();
  assert.equal(clarified.answer,'400円');
  const next = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST', body:JSON.stringify({question:'大人は？',previousQuestion:clarified.items[0].worksheetContext}),
  }),env,{uid:'test'});
  const adult = await next.json();
  assert.equal(adult.answer,'800円');
  assert.deepEqual(adult.items[0].evidence.map(e=>[e.sheet,e.cell,e.page]),
    ['A3','B3','C1','D2','D3'].map(cell=>['R8料金表',cell,5]));
  const back = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
    method:'POST', body:JSON.stringify({question:'子どもは？',previousQuestion:adult.items[0].worksheetContext}),
  }),env,{uid:'test'});
  const child = await back.json();
  assert.equal(child.answer,'400円');
  assert.deepEqual(child.items[0].evidence.map(e=>[e.sheet,e.cell,e.page]),
    ['A3','B4','C1','D2','D4'].map(cell=>['R8料金表',cell,5]));
  assert.deepEqual(clarified.items.flatMap(item=>item.evidence.map(e=>[e.sheet,e.cell,e.page])),['A3','B4','C1','D2','D4'].map(cell=>['R8料金表',cell,5]));
}

const switchYear = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST', body:JSON.stringify({question:'R9',previousQuestion:'令和8年度の会議室の子どもの休日料金は？'}),
}),env,{uid:'test'});
const switched = await switchYear.json();
assert.equal(switched.answer,'450円');
assert.deepEqual(switched.items[0].evidence.map(e=>[e.sheet,e.cell,e.page]),
  ['A3','B4','C1','D2','D4'].map(cell=>['R9料金表',cell,3]));
const threeYearPages = [...pages, pages[4].replace('R8料金表','R7料金表').replace('400円','350円')];
const threeYearEnv = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages:threeYearPages,sourceType:'xlsx'})})}};
const ambiguous = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST', body:JSON.stringify({question:'会議室の子どもの休日料金は？'}),
}),threeYearEnv,{uid:'test'});
const threeYears = await ambiguous.json();
assert.equal(threeYears.answer,'令和7年度・令和8年度・令和9年度のうち、どの年度ですか？');
assert.deepEqual(threeYears.items.flatMap(item=>item.evidence),[]);

const blank = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST', body:JSON.stringify({question:'令和9年度の青空高校の特進の入試日程は？'}),
}),env,{uid:'test'});
const emptyCell = await blank.json();
assert.equal(emptyCell.answer,'該当セルは空欄です。');
assert.deepEqual(emptyCell.pages,[]);
assert.deepEqual(emptyCell.items[0].evidence,[]);

const mixedPages = [...pages, pages[2].replace('R9料金表','R7料金表').replace('B4 子ども | D4 450円','B4 子ども')];
const mixedEnv = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages:mixedPages,sourceType:'xlsx'})})}};
const mixed = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question:'会議室の子どもの休日料金は？'}),
}),mixedEnv,{uid:'test'});
const mixedResult = await mixed.json();
assert.equal(mixedResult.answer,'令和7年度・令和8年度・令和9年度のうち、どの年度ですか？');
assert.deepEqual(mixedResult.pages,[]);
const emptyYear = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question:'R7',previousQuestion:'会議室の子どもの休日料金は？'}),
}),mixedEnv,{uid:'test'});
const emptyYearResult = await emptyYear.json();
assert.equal(emptyYearResult.answer,'該当セルは空欄です。');
assert.deepEqual(emptyYearResult.items[0].evidence,[]);

const mergedPages = pages.map(text=>text.startsWith('R9料金表')
  ? text.replace('B4 子ども | D4 450円','B4 子ども').replace('A3:A4','A3:A4, D3:D4') : text);
const mergedEnv = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages:mergedPages,sourceType:'xlsx'})})}};
const merged = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question:'令和9年度の会議室の子どもの休日料金は？'}),
}),mergedEnv,{uid:'test'});
const mergedResult = await merged.json();
assert.equal(mergedResult.answer,'900円');
assert.deepEqual(mergedResult.items[0].evidence.map(e=>e.cell),['A3','B4','C1','D2','D3']);

const freePages = mergedPages.map(text=>text.startsWith('R9料金表') ? text.replace('D3 900円','D3 0') : text);
const freeEnv = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages:freePages,sourceType:'xlsx'})})}};
const free = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question:'令和9年度の会議室の子どもの休日料金は？'}),
}),freeEnv,{uid:'test'});
const freeResult = await free.json();
assert.equal(freeResult.answer,'0');
assert.deepEqual(freeResult.items[0].evidence.map(e=>e.cell),['A3','B4','C1','D2','D3']);

const widePages = pages.map(text=>text.startsWith('R9料金表')
  ? text.replace(/\b([CD])(\d+)/g,(_,col,row)=>(col==='C' ? 'Z' : 'AA')+row) : text);
const wideEnv = {ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({pages:widePages,sourceType:'xlsx'})})}};
const wide = await documents(new Request('https://test/documents/10000000-0000-0000-0000-000000000000/ask',{
  method:'POST',body:JSON.stringify({question:'令和9年度の会議室の子どもの休日料金は？'}),
}),wideEnv,{uid:'test'});
const wideResult = await wide.json();
assert.equal(wideResult.answer,'450円');
assert.deepEqual(wideResult.items[0].evidence.map(e=>e.cell),['A3','B4','Z1','AA2','AA4']);
