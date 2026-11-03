import assert from 'node:assert/strict';
import {PcmSegmenter} from '../web/caption-pcm.js';
import {capturePauseMs} from '../web/caption-server.js';
const voice=n=>Float32Array.from({length:n*16},(_,i)=>Math.sin(i*.13)*.04),silence=n=>new Float32Array(n*16);
const run=profile=>{const rows=[],segmenter=new PcmSegmenter(16000,(samples,detail)=>rows.push({samples,detail}),()=>{},{pauseMs:capturePauseMs(profile)});return {rows,segmenter};};
const current=run('responsive'),previous=run('balanced');
for(const s of [current,previous]){s.segmenter.push(voice(600));s.segmenter.push(silence(280));assert.equal(s.rows.length,0);s.segmenter.push(silence(20));}
assert.equal(current.rows.length,1);assert.equal(previous.rows.length,0);previous.segmenter.push(silence(100));assert.equal(previous.rows.length,1);assert.equal(previous.rows[0].samples.length-current.rows[0].samples.length,1600);assert.deepEqual([...current.rows[0].samples.slice(0,12800)],[...previous.rows[0].samples.slice(0,12800)]);
const pause=run('responsive');pause.segmenter.push(voice(400));pause.segmenter.push(silence(200));pause.segmenter.push(voice(400));assert.equal(pause.rows.length,0);pause.segmenter.push(silence(300));assert.equal(pause.rows.length,1);assert.equal(pause.rows[0].detail.boundary,'pause');pause.segmenter.push(silence(2000));assert.equal(pause.rows.length,1);
const continuous=run('responsive');continuous.segmenter.push(voice(4000));assert.equal(continuous.rows[0].samples.length,48000);assert.equal(continuous.rows[0].detail.boundary,'limit');continuous.segmenter.clear();assert(continuous.segmenter.samples.every(x=>x===0));
console.log('PASS responsive capture sends 100ms earlier, preserves 200ms hesitation and waveform prefix, no silence duplicates, same 3s limit and audio cleanup');
