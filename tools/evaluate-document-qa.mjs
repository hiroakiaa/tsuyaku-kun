import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {evaluateDocumentQuestion} from '../server/documents.js';

const pages = [
  '給食費は月額4,000円です。年間10回徴収します。年間の給食費は40,000円です。',
  '生徒会費は年間600円です。',
  'PTA会費は年間2,400円です。',
  ...Array.from({length:9},()=> '図書室では本を借りられます。返却は図書室のカウンターで行います。'.repeat(19)),
  '下校完了は、4月から9月は17時30分、10月から3月は16時45分です。',
];
pages.push('教材費は年額600円です。');
const cases = [
  ['せいとかいひは年間いくら？', [['600',2,'生徒会費']]],
  ['教材費の年額は？', [['600',14,'教材費']]],
  ['給食費は1年でいくら？', [['40,000',1,'給食費']]],
  ['給食費は1年間でいくら？', [['40,000',1,'給食費']]],
  ['給食費の月額と、生徒会費・PTA会費の年額をそれぞれ教えて', [['4,000',1,'給食費'],['600',2,'生徒会費'],['2,400',3,'PTA会費']]],
  ['下校の時刻は？', [['17時30分',13,'下校完了'],['16時45分',13,'下校完了']]],
  ['学校指定の靴の販売店はどこ？', []],
];
const key = process.env.OPENAI_DOCUMENT_QA_KEY;
const saved = process.argv[2] ? JSON.parse(await readFile(process.argv[2],'utf8')) : null;
if (!saved) assert.ok(key,'検証用の OPENAI_DOCUMENT_QA_KEY を環境変数に設定してください。');
const normalize = text=>text.normalize('NFKC').replace(/[,\s]/g,'');
const rows = [];
for (const [question,expected] of cases) {
  for (const mode of ['full','search']) {
    const started = performance.now();
    const recorded = saved?.find(row=>row.question===question && row.mode===mode);
    if (saved && !recorded) continue;
    const {items,usage} = recorded ?? await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:key},pages,question,mode);
    const elapsedMs = recorded ? recorded.elapsedMs ?? null : Math.round(performance.now()-started);
    const correct = expected.length ? expected.every(([value,page,sourceLabel])=>items.some(item=>
      item.answer && normalize(item.answer).includes(normalize(value)) &&
      item.evidence.some(source=>source.page===page && normalize(source.quote).includes(normalize(value)) && (!sourceLabel || normalize(source.quote).includes(normalize(sourceLabel))))
    )) : !items.some(item=>item.answer);
    const expectedPages = new Set(expected.map(([,page])=>page));
    const unexpectedPages = [...new Set(items.flatMap(item=>item.evidence.map(source=>source.page)))].filter(page=>!expectedPages.has(page));
    const input = usage?.prompt_tokens ?? null;
    const output = usage?.completion_tokens ?? null;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? null;
    const estimatedUSD = [input,output,cached].every(Number.isFinite)
      ? ((input-cached)*0.4+cached*0.1+output*1.6)/1e6 : null;
    const evidencePages = [...new Set(items.flatMap(item=>item.evidence.map(source=>source.page)))];
    rows.push({question,mode,correct:correct && !unexpectedPages.length,unexpectedPages,pages:evidencePages.join(', '),input,output,cached,estimatedUSD,elapsedMs});
  }
}
console.table(rows);
const summary = ['full','search'].map(mode=>{
  const samples = rows.filter(row=>row.mode===mode);
  const durations = samples.map(row=>row.elapsedMs).filter(Number.isFinite).sort((a,b)=>a-b);
  return {mode, cases:samples.length, passed:samples.filter(row=>row.correct).length,
    medianMs:durations[Math.ceil(durations.length/2)-1] ?? null, maxMs:durations.at(-1) ?? null,
    measuredCostCases:samples.filter(row=>row.estimatedUSD!==null).length,
    estimatedUSD:samples.every(row=>row.estimatedUSD!==null)
      ? samples.reduce((sum,row)=>sum+row.estimatedUSD,0) : null};
});
console.log(JSON.stringify({summary,rows},null,2));
