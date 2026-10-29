import assert from 'node:assert/strict';
import {PcmSegmenter} from '../web/caption-pcm.js';
import {processingPresentation} from '../web/conversation-ui.js';
const activities=[],chunks=[],frame=Float32Array.from({length:320},(_,i)=>Math.sin(i*.15)*.08);
const pcm=new PcmSegmenter(16000,(samples,detail)=>chunks.push({samples,detail}),activity=>activities.push(activity));
while(!chunks.length)pcm.push(frame);
assert.equal(chunks[0].samples.length,48000);assert.equal(chunks[0].detail.boundary,'limit');assert.equal(activities.at(-1),'end');
const before=chunks.length;pcm.push(new Float32Array(32000));assert.equal(chunks.length,before);assert.equal(activities.at(-1),'end');
for(let i=0;i<10;i++)pcm.push(frame);assert.equal(activities.at(-1),'start');pcm.push(new Float32Array(9600));assert.equal(activities.at(-1),'end');assert.equal(chunks.at(-1).detail.boundary,'pause');
for(const phase of ['capturing','recognizing']){const state={mode:'face',mic:true,speechPhase:phase};assert.equal(processingPresentation(state).show,true);assert.equal(processingPresentation(state).text,'');assert.equal(processingPresentation({...state,mic:false}).show,false);assert.equal(processingPresentation({...state,paused:true}).show,false);}
assert.equal(processingPresentation({mode:'face',mic:true,speechPhase:'waiting'}).show,false);
assert.equal(processingPresentation({mode:'face',mic:true,speechPhase:'waiting',translating:true}).show,true);
console.log('PASS dots and capture: forced segment ends capture, silence leaves it idle, fresh speech resumes and pending states have no visible copy');

