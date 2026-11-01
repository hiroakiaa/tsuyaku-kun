import assert from 'node:assert/strict';
import {UsageLedger} from '../web/usage.js';
import {schoolTranslation} from '../web/school-phrases.js';
import {improvementReport} from '../web/analysis-focus.js';
const data=new Map(),ledger=new UsageLedger({getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},()=>1000);ledger.begin('face',['ja','de']);
for(let i=0;i<70;i++){ledger.recognitionObservation(['ja','de'],{code:'sent',text:'private'});ledger.recognitionObservation(['de','ja'],{code:'filtered',filterReason:'empty'});}
ledger.recognitionObservation(['ja','en'],{code:'http_error'});ledger.recognitionObservation(['ja','de'],{code:'queue_overflow'});ledger.recognitionObservation(['ja','de'],{code:'stale_audio'});ledger.recognitionObservation(['ja','de'],{code:'retry'});ledger.recognitionObservation(['bad private text'],{code:'sent'});
const rows=ledger.current.recognitionByPair;assert.equal(rows.length,2);assert.equal(rows[0].requests,70);assert.equal(rows[0].empty,70);assert.equal(rows[0].queueDrops,1);assert.equal(rows[0].staleDrops,1);assert.equal(rows[0].retries,1);assert.equal(rows[1].requestErrors,1);assert(!JSON.stringify(rows).includes('private'));
ledger.current.translationTimings=[{catalogMatch:false}];const report=improvementReport([ledger.current]);assert.equal(report.recognitionCoverage.byLanguagePair[0].requests,70);assert.equal(report.catalogConsistency.mismatches,1);assert(report.findings.some(f=>f.code==='audio_discarded'));assert(report.findings.some(f=>f.code==='catalog_mismatch'));assert.equal(improvementReport([{...ledger.current,recognitionByPair:undefined}]).recognitionCoverage.byLanguagePair,null);
for(const text of ['おはようございます','おはようございます。','おはようございます．','おはようございます.']){const r=schoolTranslation('ja',text,['de']);assert.equal(r.translations.de,'Guten Morgen.');assert.equal(r.translations.ja,text);}
for(const text of ['おはようございます？','おはようございます！','おはようございます先生','おはようございません','2おはようございます'])assert.equal(schoolTranslation('ja',text,['de']),null);
assert.equal(schoolTranslation('de','Guten Morgen',['ja']).translations.ja,'おはようございます。');
assert.equal(schoolTranslation('en','Good morning?',['ja']),null);
console.log('PASS pair coverage survives log truncation; private text rejected; only final statement stops reuse school phrases');
