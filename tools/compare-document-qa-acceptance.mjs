import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [beforePath,afterPath]=process.argv.slice(2);
assert.ok(beforePath && afterPath,'Usage: node tools/compare-document-qa-acceptance.mjs BEFORE.json AFTER.json');

async function readReport(path) {
  const report=JSON.parse(await readFile(path,'utf8'));
  assert.ok(Number.isSafeInteger(report.total) && report.total>0,path+' has no expected test total');
  assert.ok(Array.isArray(report.measurements),path+' has no measurements');
  const cases=new Map();
  for (const row of report.measurements) {
    assert.equal(typeof row.fixture,'string');
    assert.equal(typeof row.question,'string');
    const key=JSON.stringify([row.fixture,row.question]);
    assert.ok(!cases.has(key),path+' contains a duplicate case '+key);
    cases.set(key,row);
  }
  return {report,cases};
}

const [before,after]=await Promise.all([readReport(beforePath),readReport(afterPath)]);
assert.deepEqual(
  {total:after.report.total,network:after.report.network,limits:after.report.limits,retryScan:after.report.retryScan},
  {total:before.report.total,network:before.report.network,limits:before.report.limits,retryScan:before.report.retryScan},
  'Reports must use identical test conditions',
);
const keys=new Set([...before.cases.keys(),...after.cases.keys()]);
assert.ok(keys.size<=before.report.total,'Reports use different question sets');
const result={compared:0,improved:0,regressed:0,unchanged:0,missing:[],cases:[]};
const fields=['answerPassed','citationPassed','citationNavigation'];
const fieldResults=Object.fromEntries(fields.map(field=>[field,{improved:0,regressed:0,unchanged:0,unmeasured:0}]));
for (const key of keys) {
  const [fixture,question]=JSON.parse(key);
  const a=before.cases.get(key),b=after.cases.get(key);
  if (!a || !b) {
    result.missing.push({fixture,question,missingFrom:a?'after':'before'});
    continue;
  }
  assert.equal(typeof a.passed,'boolean');
  assert.equal(typeof b.passed,'boolean');
  result.compared++;
  const outcome=a.passed===b.passed?'unchanged':b.passed?'improved':'regressed';
  result[outcome]++;
  for (const field of fields) {
    const previous=a[field], current=b[field];
    const change=typeof previous!=='boolean' || typeof current!=='boolean' ? 'unmeasured'
      : previous===current ? 'unchanged' : current ? 'improved' : 'regressed';
    fieldResults[field][change]++;
  }
  result.cases.push({fixture,question,outcome,before:a.passed,after:b.passed,
    answer:[a.answerPassed,b.answerPassed],citations:[a.citationPassed,b.citationPassed]});
}
console.log(JSON.stringify({
  before:before.report.commit,after:after.report.commit,expected:before.report.total,
  ...result,fieldResults,failuresBefore:before.report.failures??null,failuresAfter:after.report.failures??null,
},null,2));
if (result.compared!==before.report.total || result.regressed || Object.values(fieldResults).some(field=>field.regressed)) process.exitCode=1;
