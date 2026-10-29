import assert from 'node:assert/strict';
import {recognitionDecoding} from '../server/recognition-policy.js';
import {recognizeAudio} from '../server/worker.js';
assert.equal(recognitionDecoding().beamSize,5);assert.equal(recognitionDecoding('beam1').beamSize,1);for(const value of ['__proto__','constructor','random',99,null])assert.throws(()=>recognitionDecoding(value));
const bytes=new Uint8Array([1,2,3]);
for(const profile of [undefined,'baseline','beam1']){
 let called;await recognizeAudio({recognitionProfile:profile,AI:{run:async(model,input)=>{called={model,input};return {text:'one',language:'en',language_probability:.99};}}},bytes,'ja',[],['ja','en']);
 assert.equal(called.model,'@cf/openai/whisper-large-v3-turbo');assert.equal(called.input.beam_size,profile==='beam1'?1:5);assert.equal(called.input.vad_filter,true);assert.equal(called.input.language,undefined);assert.equal(called.input.initial_prompt,undefined);assert.equal(called.input.task,'transcribe');assert.equal(called.input.condition_on_previous_text,false);
}
console.log('PASS ASR comparison profiles: default beam 5, explicit beam 1, bounded enum, same multilingual model and unchanged speech filters');
