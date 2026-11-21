import assert from 'node:assert/strict';import {layoutPdfText} from '../web/document-table.js';
const item=(str,x,y,size=10,width=str.length*4)=>({str,width,dir:'ltr',transform:[size,0,0,size,x,y]});
for(const count of [2,3]){
 const items=[item('A spanning brochure title',20,780,22)];
 for(let column=0;column<count;column++){
  const x=20+column*240;items.push(item('Section '+column,x,750,16));
  for(let row=0;row<4;row++)items.push(item('Paragraph '+column+' line '+row+' with relevant facts.',x,725-row*18));
 }
 const text=layoutPdfText(items);for(let column=1;column<count;column++)assert.ok(text.indexOf('Paragraph '+(column-1)+' line 3')<text.indexOf('Section '+column),'Finish a prose column before the next heading');assert.ok(!text.includes(' | '));
}
const table=[item('Name',20,750,16),item('Fee',260,750,16),item('Count',500,750,16),...Array.from({length:4},(_,row)=>[item('Venue '+row,20,725-row*18),item((100+row)+' yen',260,725-row*18),item('20',500,725-row*18)]).flat()];assert.ok(layoutPdfText(table).includes('Venue 0 | 100 yen | 20'),'A regular three-column table retains row correspondence');
console.log('PASS two/three prose columns with spanning titles read column-first; short/numeric tables retain row order');
