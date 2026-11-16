import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {lookupTableCell} from '../web/document-table-lookup.js';

const width=1200,height=400;
const pixels=new Uint8ClampedArray(width*height*4).fill(255);
function mark(x,y) { pixels.fill(0,(y*width+x)*4,(y*width+x)*4+3); }
for (const y of [20,70,150,220]) for(let x=20;x<=1100;x++) mark(x,y);
for (const x of [20,200,600,1100]) for(let y=20;y<=220;y++) mark(x,y);
const cell=(str,x,y)=>({str,height:12,transform:[1,0,0,1,x,y+3]});
const items=[
  cell('所要時間',230,10),cell('項目',40,45),cell('所要時間',230,45),cell('所要時間',270,45),cell('費用',640,45),
  cell('北',60,115),cell('館',60,125),cell('15分',230,115),cell('500円',640,115),
  cell('南館',60,180),cell('30分',230,180),cell('900円',640,180),
];
const page={
  getViewport:()=>({width,height,scale:1,convertToViewportPoint:(x,y)=>[x,y]}),
  getTextContent:async()=>({items}),
  render:()=>({promise:Promise.resolve()}),
};
globalThis.document={createElement:()=>({getContext:()=>({getImageData:()=>({data:pixels})})})};
const pdf={numPages:1,getPage:async()=>page};
assert.deepEqual((await lookupTableCell(pdf,'北館の所要時間の基準は？')).evidence,[{page:1,quote:'15分'}]);
assert.equal((await lookupTableCell(pdf,'南館の費用はいくら？')).answer,'900円');
assert.equal(await lookupTableCell(pdf,'西館の費用は？'),null);
items.push(cell('北館別棟',60,250),cell('45分',230,250));
for (const y of [290]) for(let x=20;x<=1100;x++) mark(x,y);
assert.equal((await lookupTableCell(pdf,'北館の所要時間の基準は？')).answer,'15分');
assert.equal((await lookupTableCell(pdf,'北館別の所要時間は？')).answer,'45分');
console.log('PASS vertical row labels, duplicate headings and adjacent table cells');
import {layoutPdfText} from '../web/document-table.js';
const verticalGlyph = (str,x,y)=>({str,dir:'ttb',width:10,transform:[10,0,0,10,x,y]});
const verticalPage = layoutPdfText([
  verticalGlyph('館',100,160),
  verticalGlyph('午',80,180),
  verticalGlyph('開',100,180),
  verticalGlyph('前',80,160),
  verticalGlyph('時',80,120),
  verticalGlyph('八',80,140),
]);
assert.equal(verticalPage,'開館\n午前八時');
console.log('PASS PDF vertical text follows right-to-left columns and top-to-bottom glyphs');

const reader = await readFile(new URL('../web/documents.js',import.meta.url),'utf8');
const formatQuoteSource = reader.slice(reader.indexOf('  function formatQuote('),reader.indexOf('  function renderAnswerText('));
const formatQuote = runInNewContext(formatQuoteSource+'\nformatQuote');
assert.deepEqual(Array.from(formatQuote('月 | 部活終了 | 下校完了\n４ | １６：４５ | １７：００\n１１ | １６：１０ | １６：２５')),[
  '月 | 部活終了 | 下校完了','４ | １６：４５ | １７：００','１１ | １６：１０ | １６：２５',
]);
assert.deepEqual(Array.from(formatQuote('自然を観\n察します。\n\n実験を行います。')),['自然を観察します。','実験を行います。']);
console.log('PASS table quotation preserves rows and prose joins wrapped lines');

{
  const {PDFDocument,PDFName}=await import('../web/document-pdf-lib.mjs');
  const {readTaggedTables,findTaggedTableCell}=await import('../web/document-tagged-table.js');
  const pdf=await PDFDocument.create();
  const pages=[pdf.addPage(),pdf.addPage()];
  const context=pdf.context;
  const cell=(role,page,index)=>context.obj({S:role,K:[
    context.obj({S:'NonStruct',Pg:pages[page].ref,K:index}),
  ]});
  const row=(role,page)=>context.obj({S:'TR',K:[cell(role,page,0),cell(role,page,1)]});
  const table=context.obj({S:'Table',K:[row('TH',0),row('TD',1)]});
  pdf.catalog.set(PDFName.of('StructTreeRoot'),context.register(context.obj({K:[table]})));
  const begin=id=>({type:'beginMarkedContentProps',id});
  const end={type:'endMarkedContent'};
  const marks=(page,index)=>begin('p'+pages[page].ref.objectNumber+'R_mc'+index);
  const items=[
    [marks(0,0),{str:'施設'},end,marks(0,1),{str:'最終'},begin(null),{str:'⼊'},end,{str:'館時刻'},end],
    [marks(1,0),{str:'図書館'},end,marks(1,1),{str:'13:00'},end],
  ];
  assert.deepEqual(await readTaggedTables({
    getMarkInfo:async()=>null,
    getData:()=>assert.fail('An untagged PDF should not be parsed twice'),
  }),[]);
  const tables=await readTaggedTables({
    getMarkInfo:async()=>({Marked:true}),
    numPages:2,
    getData:()=>pdf.save(),
    getPage:async number=>({getTextContent:async()=>({items:items[number-1]})}),
  });
  const answer=findTaggedTableCell(tables,'図書館の最終入館時刻は？');
  assert.equal(answer?.answer,'13:00');
  assert.deepEqual(answer.evidence,[{page:2,quote:'図書館 | 13:00'},{page:1,quote:'最終⼊館時刻'}]);
  assert.equal(findTaggedTableCell([...tables,...tables],'図書館の最終入館時刻は？'),null);
  console.log('PASS tagged PDF nested text and unambiguous cross-page citations');
}

{
  const part=(str,x,y,size=12,width=str.length*5)=>({str,width,transform:[size,0,0,size,x,y]});
  const rows=[
    part('Exhibition',0,100,18),part('Workshop',180,100,18),
    part('Visitor',0,80),part('Fee',75,80),part('Visitor',180,80),part('Fee',255,80),
    part('Adults',0,60),part('780 yen',75,60),part('Adults',180,60),part('1350 yen',255,60),
    part('Students',0,40),part('420 yen',75,40),part('Students',180,40),part('650 yen',255,40),
  ];
  assert.equal(layoutPdfText(rows),[
    'Exhibition','Visitor | Fee','Adults | 780 yen','Students | 420 yen',
    '','Workshop','Visitor | Fee','Adults | 1350 yen','Students | 650 yen',
  ].join('\n'));
  assert.match(layoutPdfText(rows.map(item=>({...item,transform:item.transform.map((value,i)=>i===0||i===3?12:value)}))),
    /^Exhibition \| Workshop\nVisitor \| Fee \| Visitor \| Fee/);
}

{
  const cell = (str,x,y) => ({str,width:str.length*10,transform:[10,0,0,10,x,y]});
  const items = [
    cell('区分',10,90),cell('予約',100,90),cell('料金',190,90),
    cell('個',10,75),cell('人',20,75),cell('240円',190,75),
    cell('団体',10,60),cell('要予約',100,60),cell('680円',190,60),
  ];
  assert.equal(layoutPdfText(items),'区分 | 予約 | 料金\n個人 |  | 240円\n団体 | 要予約 | 680円');
}

{
  const cell = (str,x,y) => ({str,width:str.length*10,transform:[10,0,0,10,x,y]});
  assert.match(layoutPdfText([
    cell('区分',22,90),cell('予約',113,90),cell('利',200,90),cell('用',210,90),cell('料',220,90),cell('金',230,90),
    cell('個',10,75),cell('人',20,75),cell('240円',190,75),
    cell('団体',10,60),cell('要予約',100,60),cell('680円',190,60),
  ]),/個人 \|  \| 240円/u);
}

{
  const cell=(str,x,y)=>({str,width:str.length*10,transform:[10,0,0,10,x,y]});
  const items=[
    ['施設','平日','','休日',''],
    ['施設','開始','終了','開始','終了'],
    ['受付','09:00','16:00','10:00','17:00'],
    ['研修室','08:00','15:00','09:00','16:00'],
  ].flatMap((row,index)=>row.flatMap((str,column)=>str?[cell(str,10+column*100,100-index*15)]:[]));
  assert.equal(layoutPdfText(items).split('\n')[0],'施設 | 平日 |  | 休日 | ');
}
