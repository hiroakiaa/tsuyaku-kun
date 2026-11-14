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
  const tables=await readTaggedTables({
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
