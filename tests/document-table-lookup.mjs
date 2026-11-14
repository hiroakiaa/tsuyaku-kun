import assert from 'node:assert/strict';
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
console.log('PASS vertical row labels, duplicate headings and adjacent table cells');
