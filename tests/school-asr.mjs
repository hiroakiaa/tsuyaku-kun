import assert from 'node:assert/strict';
import {recognizeAudio} from '../server/worker.js';
import {cleanRecognition,recognitionEvidence,suspectedSchoolOutro} from '../server/audio.js';
import {recognitionMetrics} from '../web/recognition-metrics.js';
import {safeConnectionRecord} from '../web/network.js';
for(const pair of [['ja','en'],['ja','de'],['ko','vi'],['fil','ja-easy']]){let input;const timing={};await recognizeAudio({schoolRecognition:true,translationTiming:timing,AI:{run:async(_,v)=>{input=v;return {text:'test'};}}},new Uint8Array([1]),pair[0],['private sentence'],pair);assert.equal(input.language,undefined);assert.equal(input.condition_on_previous_text,false);assert.equal(input.initial_prompt,undefined);assert.equal(timing.schoolHintCount,0);}
const outro='これから数多くの動画でお会いしましょう。';assert(suspectedSchoolOutro({text:outro}));assert.equal(cleanRecognition({text:outro},'ja',{schoolContext:true}),'');assert.equal(cleanRecognition({text:outro},'ja'),outro);for(const text of ['これから数学の授業を始めます。','動画でお会いしましょうという表現を勉強します。','「これから数多くの動画でお会いしましょう」と言いました。','はい、はい、はい。'])assert.equal(cleanRecognition({text},'ja',{schoolContext:true}),text);
assert.equal(cleanRecognition({text:'repeated noise',segments:[{text:'repeated noise',compression_ratio:3,avg_logprob:-.7}]}),'');
assert.equal(cleanRecognition({text:'yes yes yes',segments:[{text:'yes yes yes',compression_ratio:3,avg_logprob:-.2,no_speech_prob:.01}]}),'yes yes yes');
const evidence=recognitionEvidence({segments:[{text:'private text',avg_logprob:-.7,compression_ratio:3},{no_speech_prob:.8}]});assert.equal(evidence.highCompressionSegments,1);assert.equal(evidence.noSpeechSegments,1);assert.equal(evidence.confidenceMeasuredSegments,2);assert(!JSON.stringify(evidence).includes('private'));assert.deepEqual(recognitionEvidence({text:'unknown confidence'}),{});assert.equal(safeConnectionRecord(recognitionMetrics({...evidence,schoolHintCount:0,stockOutroRejected:true})).stockOutroRejected,true);
console.log('PASS unsafe bilingual prompting disabled; standalone school outro guard preserves quotes, lessons and confident repetitions');
