import assert from 'node:assert/strict';
import {TranslationMemory} from '../web/translation-memory.js';
import {equivalentPhrase} from '../web/phrase-equivalence.js';
import {storedTranslations} from '../server/dictionary.js';
import {UsageLedger,reuseSummary} from '../web/usage.js';
const noop={getItem:()=>null,setItem(){}},store={get:async()=>null,put:async()=>true};
const phrase={jaText:'手続きに必要な書類を教えてください。',enText:'Please tell me which documents are needed.'};
const data={phrases:[phrase]},m=new TranslationMemory(noop,store);
for(const text of ['必要な書類を教えてください','どんな書類が必要ですか？']){assert.equal(m.lookup('ja',text,['en'],'',data).translations.en,phrase.enText);assert.equal(storedTranslations(text,'ja',['en'],data).translations.en,phrase.enText);}
for(const text of ['必要な書類はありません。','明日までに必要な書類を教えてください。','書類は2枚必要ですか。','必要な書類を教えないでください。','必要な書類があれば教えてください。']){assert.equal(m.lookup('ja',text,['en'],'',data),null);assert.deepEqual(storedTranslations(text,'ja',['en'],data).translations,{});}
assert.equal(equivalentPhrase('15時です','16時です'),false);
assert.equal(equivalentPhrase('丸をもらう','丸をもらわない'),false);
assert.equal(m.lookup('ja','必要な書類を教えてください',['en'],'',{phrases:[phrase,{...phrase,enText:'Conflicting translation'}]}),null);
assert.deepEqual(storedTranslations('必要な書類を教えてください','ja',['en'],{phrases:[phrase,{...phrase,enText:'Conflicting translation'}]}).translations,{});
m.remember('ja',phrase.jaText,{en:'Reviewed correction'},'school');
assert.equal(m.lookup('ja','どんな書類が必要ですか',['en'],'school').translations.en,'Reviewed correction');
assert.equal(m.lookup('ja','どんな書類が必要ですか',['en'],'other'),null);
assert.equal(m.lookup('ja','どんな書類が必要ですか',['es'],'school'),null);
const rows=new Map(),ledger=new UsageLedger({getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)});
ledger.begin('face',['ja','en']);
ledger.caption({id:'a',at:1,final:true,status:'ready',memorySource:'spreadsheet',usage:{cacheHit:true}});
ledger.caption({id:'a',at:1,final:true,status:'ready',memorySource:'spreadsheet',usage:{cacheHit:true}});
ledger.caption({id:'b',at:2,final:true,status:'ready',usage:{inputTokens:20}});
ledger.event('translation_review');ledger.event('recognition_correction');
const summary=reuseSummary([...ledger.list(),{events:[]}]);
assert.equal(summary.withoutAIRate,.5);assert.equal(summary.withoutAI,1);assert.equal(summary.measuredSuccessfulCaptions,2);assert.equal(summary.unmeasuredSessions,1);assert.equal(summary.translationReviews,1);assert.equal(summary.recognitionCorrections,1);assert.equal(reuseSummary([]).withoutAIRate,null);
const large={phrases:Array.from({length:10000},(_,i)=>({jaText:'登録文'+i,enText:'Entry '+i})).concat(phrase)};
assert.equal(m.lookup('ja','必要な書類を教えてください',['en'],'',large).translations.en,phrase.enText);
console.log('Reuse quality: variants, protected facts, conflicts, reviewed corrections, counters and 10,000-row index passed');

const partial=m.lookup('ja',phrase.jaText,['en','es'],'',data,true);
assert.equal(partial.diagnostic.reason,'missing_languages');assert.deepEqual(partial.diagnostic.missing,['es']);
assert.equal(m.lookup('ja','未登録の文章',['en'],'',data,true).diagnostic.reason,'no_match');
ledger.reuseLookup(partial.diagnostic);assert.equal(ledger.current.reuseLookupCounts.missing_languages,1);assert.equal(ledger.current.missingTranslationLanguages.es,1);
