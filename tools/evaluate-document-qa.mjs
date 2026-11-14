import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {evaluateDocumentQuestion} from '../server/documents.js';

const twoFees = process.argv.includes('--two-fees');
const pages = twoFees ? [
  '生徒会費は年間600円です。',
  ...Array.from({length:12},()=> '図書室では本を借りられます。返却は図書室のカウンターで行います。'.repeat(19)),
  '教材費は年額600円です。',
] : [
  '給食費は月額4,000円です。年間10回徴収します。年間の給食費は40,000円です。',
  '生徒会費は年間600円です。',
  'PTA会費は年間2,400円です。',
  ...Array.from({length:9},()=> '図書室では本を借りられます。返却は図書室のカウンターで行います。'.repeat(19)),
  '下校完了は、4月から9月は17時30分、10月から3月は16時45分です。',
  '教材費は年額600円です。',
];
const cases = [
  ['せいとかいひは年間いくら？', [['600',twoFees ? 1 : 2,'生徒会費']]],
  ['教材費の年額は？', [['600',14,'教材費']]],
  ['給食費は1年でいくら？', [['40,000',1,'給食費']]],
  ['給食費は1年間でいくら？', [['40,000',1,'給食費']]],
  ['給食費の月額と、生徒会費・PTA会費の年額をそれぞれ教えて', [['4,000',1,'給食費'],['600',twoFees ? 1 : 2,'生徒会費'],['2,400',3,'PTA会費']]],
  ['下校の時刻は？', [['17時30分',13,'下校完了'],['16時45分',13,'下校完了']]],
  ['学校指定の靴の販売店はどこ？', []],
];
const key = process.env.OPENAI_DOCUMENT_QA_KEY;
const inputPath = process.argv.slice(2).find(argument=>!argument.startsWith('--'));
const saved = inputPath ? JSON.parse(await readFile(inputPath,'utf8')) : null;
if (!saved) assert.ok(key,'検証用の OPENAI_DOCUMENT_QA_KEY を環境変数に設定してください。');
const normalize = text=>text.normalize('NFKC').replace(/[,\s]/g,'');
const rows = [];
const selectedCases = twoFees ? cases.slice(0,2)
  : process.argv.includes('--baseline-five') ? cases.slice(2) : cases;
for (const [question,expected] of selectedCases) {
  for (const mode of ['full','search']) {
    const started = performance.now();
    const recorded = saved?.find(row=>row.question===question && row.mode===mode);
    if (saved && !recorded) continue;
    const {items,usage,candidatePages,timing} = recorded ?? await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:key},pages,question,mode);
    const elapsedMs = recorded ? recorded.elapsedMs ?? null : Math.round(performance.now()-started);
    const correct = expected.length ? expected.every(([value,page,sourceLabel])=>items.some(item=>
      item.answer && normalize(item.answer).includes(normalize(value)) &&
      item.evidence.some(source=>source.page===page && normalize(source.quote).includes(normalize(value)) && (!sourceLabel || normalize(source.quote).includes(normalize(sourceLabel))))
    )) : !items.some(item=>item.answer);
    const expectedPages = new Set(expected.map(([,page])=>page));
    const missingCandidatePages = Array.isArray(candidatePages) ? [...expectedPages].filter(page=>!candidatePages.includes(page)) : null;
    const unexpectedPages = [...new Set(items.flatMap(item=>item.evidence.map(source=>source.page)))].filter(page=>!expectedPages.has(page));
    // The two-fee fixture has fixed source text and page numbering.
    const invalidQuotes = twoFees ? items.flatMap(item=>item.evidence).filter(source=>{
      const original = pages[source.page-1];
      return !original || !normalize(source.quote) || !normalize(original).includes(normalize(source.quote));
    }).length : null;
    const input = usage?.prompt_tokens ?? null;
    const output = usage?.completion_tokens ?? null;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? null;
    const estimatedUSD = [input,output,cached].every(Number.isFinite)
      ? ((input-cached)*0.4+cached*0.1+output*1.6)/1e6 : null;
    const evidencePages = [...new Set(items.flatMap(item=>item.evidence.map(source=>source.page)))];
    const matchedPages = evidencePages.filter(page=>expectedPages.has(page)).length;
    rows.push({question,mode,candidatePages:candidatePages ?? null,missingCandidatePages,matchedPages,expectedPageCount:expectedPages.size,returnedPageCount:evidencePages.length,correct:correct && !unexpectedPages.length && !invalidQuotes,invalidQuotes,unexpectedPages,pages:evidencePages.join(', '),input,output,cached,estimatedUSD,elapsedMs,retrievalMs:timing?.retrievalMs ?? null,generationMs:timing?.generationMs ?? null});
  }
}
console.table(rows);
const summary = ['full','search'].map(mode=>{
  const samples = rows.filter(row=>row.mode===mode);
  const latency = field=>{
    const durations = samples.map(row=>row[field]).filter(Number.isFinite).sort((a,b)=>a-b);
    const count = durations.length;
    const medianMs = count ? (durations[Math.floor((count-1)/2)]+durations[Math.floor(count/2)])/2 : null;
    return {count,medianMs,maxMs:durations.at(-1) ?? null};
  };
  const overall = latency('elapsedMs');
  const passed = samples.filter(row=>row.correct).length;
  const complete = samples.length===selectedCases.length;
  const retrievalSamples = samples.filter(row=>row.expectedPageCount && row.missingCandidatePages!==null);
  const expectedCandidates = retrievalSamples.reduce((sum,row)=>sum+row.expectedPageCount,0);
  const missedCandidates = retrievalSamples.reduce((sum,row)=>sum+row.missingCandidatePages.length,0);
  return {mode, expectedCases:selectedCases.length, unmeasuredCases:selectedCases.length-samples.length, cases:samples.length, passed,
    accuracy:complete && samples.length ? passed/samples.length : null,
    retrieval: {
      measuredCases:retrievalSamples.length,
      expectedPages:expectedCandidates,
      missedPages:missedCandidates,
      recall:expectedCandidates ? 1-missedCandidates/expectedCandidates : null,
    },
    citationPages: {
      matched:samples.reduce((sum,row)=>sum+row.matchedPages,0),
      expected:samples.reduce((sum,row)=>sum+row.expectedPageCount,0),
      returned:samples.reduce((sum,row)=>sum+row.returnedPageCount,0),
    },
    measuredLatencyCases:overall.count, medianMs:overall.medianMs, maxMs:overall.maxMs,
    retrievalLatency:mode==='search' ? latency('retrievalMs') : null,
    generationLatency:latency('generationMs'),
    measuredCostCases:samples.filter(row=>row.estimatedUSD!==null).length,
    estimatedUSD:complete && samples.every(row=>row.estimatedUSD!==null)
      ? samples.reduce((sum,row)=>sum+row.estimatedUSD,0) : null};
});
console.log(JSON.stringify({summary,rows},null,2));
if (process.argv.includes('--require-pass') && summary.some(result=>result.unmeasuredCases || result.passed!==result.expectedCases)) process.exitCode = 1;
if (process.argv.includes('--require-retrieval')) {
  const searchRows = rows.filter(row=>row.mode==='search' && row.expectedPageCount>0);
  const expectedQuestions = selectedCases.filter(([,expected])=>expected.length>0).length;
  if (searchRows.length!==expectedQuestions || searchRows.some(row=>row.missingCandidatePages===null || row.missingCandidatePages.length)) {
    process.exitCode = 1;
  }
}
