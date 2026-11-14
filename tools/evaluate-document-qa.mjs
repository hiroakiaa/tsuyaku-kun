import assert from 'node:assert/strict';
import {evaluateDocumentQuestion} from '../server/documents.js';

const pages = [
  '給食費は月額4,000円です。年間10回徴収します。年間の給食費は40,000円です。',
  '生徒会費は年間600円です。',
  'PTA会費は年間2,400円です。',
  ...Array.from({length:9},()=> '図書室では本を借りられます。返却は図書室のカウンターで行います。'.repeat(19)),
  '下校完了は、4月から9月は17時30分、10月から3月は16時45分です。',
];
const cases = [
  ['給食費は1年でいくら？', [['40,000',1]]],
  ['給食費は1年間でいくら？', [['40,000',1]]],
  ['給食費の月額と、生徒会費・PTA会費の年額をそれぞれ教えて', [['4,000',1],['600',2],['2,400',3]]],
  ['下校の時刻は？', [['17時30分',13],['16時45分',13]]],
  ['学校指定の靴の販売店はどこ？', []],
];
const key = process.env.OPENAI_DOCUMENT_QA_KEY;
assert.ok(key,'検証用の OPENAI_DOCUMENT_QA_KEY を環境変数に設定してください。');
const normalize = text=>text.normalize('NFKC').replace(/[,\s]/g,'');
const rows = [];
for (const [question,expected] of cases) {
  for (const mode of ['full','search']) {
    const {items,usage} = await evaluateDocumentQuestion({OPENAI_DOCUMENT_QA_KEY:key},pages,question,mode);
    const correct = expected.length ? expected.every(([value,page])=>items.some(item=>
      item.answer && normalize(item.answer).includes(normalize(value)) &&
      item.evidence.some(source=>source.page===page && normalize(source.quote).includes(normalize(value)))
    )) : !items.some(item=>item.answer);
    const input = usage?.prompt_tokens ?? null;
    const output = usage?.completion_tokens ?? null;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? null;
    const estimatedUSD = [input,output,cached].every(Number.isFinite)
      ? ((input-cached)*0.4+cached*0.1+output*1.6)/1e6 : null;
    const evidencePages = [...new Set(items.flatMap(item=>item.evidence.map(source=>source.page)))];
    rows.push({question,mode,correct,pages:evidencePages.join(', '),input,output,cached,estimatedUSD});
  }
}
console.table(rows);
console.log(JSON.stringify(rows,null,2));
