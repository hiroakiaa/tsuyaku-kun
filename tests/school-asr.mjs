import assert from 'node:assert/strict';
import {recognizeAudio} from '../server/worker.js';
import {schoolRecognitionHints} from '../web/recognition-hints.js';
import {cleanRecognition,recognitionEvidence} from '../server/audio.js';
import {recognitionMetrics} from '../web/recognition-metrics.js';
import {safeConnectionRecord} from '../web/network.js';
for(const pair of [['ja','en'],['ja','de'],['ko','vi'],['fil','ja-easy']]){let input;const timing={};await recognizeAudio({schoolRecognition:true,translationTiming:timing,AI:{run:async(_,v)=>{input=v;return {text:'test'};}}},new Uint8Array([1]),pair[0],['private sentence'],pair);assert.equal(input.language,undefined);assert.equal(input.condition_on_previous_text,false);assert.equal(input.initial_prompt,schoolRecognitionHints(pair).join('、'));assert(!input.initial_prompt.includes('private'));assert.equal(timing.schoolHintCount,16);}
assert(schoolRecognitionHints(['ja','en']).includes('数学'));assert(!schoolRecognitionHints(['en','de']).includes('数学'));
assert.equal(cleanRecognition({text:'repeated noise',segments:[{text:'repeated noise',compression_ratio:3,avg_logprob:-.7}]}),'');
assert.equal(cleanRecognition({text:'yes yes yes',segments:[{text:'yes yes yes',compression_ratio:3,avg_logprob:-.2,no_speech_prob:.01}]}),'yes yes yes');
const evidence=recognitionEvidence({segments:[{text:'private text',avg_logprob:-.7,compression_ratio:3},{no_speech_prob:.8}]});assert.equal(evidence.highCompressionSegments,1);assert.equal(evidence.noSpeechSegments,1);assert.equal(evidence.confidenceMeasuredSegments,2);assert(!JSON.stringify(evidence).includes('private'));assert.deepEqual(recognitionEvidence({text:'unknown confidence'}),{});assert.equal(safeConnectionRecord(recognitionMetrics({...evidence,schoolHintCount:16})).schoolHintCount,16);
console.log('PASS balanced school vocabulary without language lock, no personal prompts, confidence evidence and guarded repetition filtering');
