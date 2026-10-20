import assert from 'node:assert/strict';import {microphoneUnavailable} from '../web/device-check.js';
assert.equal(microphoneUnavailable(null),true);assert.equal(microphoneUnavailable({getAudioTracks:()=>[{readyState:'ended'}]}),true);assert.equal(microphoneUnavailable({getAudioTracks:()=>[{readyState:'live'}]}),false);
console.log('Device check: ended and missing microphones distinguished from live inputs');

const {deviceCheckPanel}=await import('../web/device-check.js');let close,release,stopped=0;const nodes=[],el=(tag,text)=>{const node={tag,text,append(){},setAttribute(){},closest:()=>({addEventListener:(name,fn)=>close=fn})};nodes.push(node);return node;};deviceCheckPanel({el,modal(){},Context:null,getMedia:()=>new Promise(r=>release=r)});const start=nodes.find(n=>n.text==='マイク入力を確認'),pending=start.onclick();await Promise.resolve();close();release({getTracks:()=>[{stop:()=>stopped++}]});await pending;assert.equal(stopped,1,'closing a microphone check must stop a late permission result');console.log('Device check: closing dialog releases late microphone permission without recording');
let resumeTone,toneStarts=0,toneCloses=0;
class DelayedAudio{resume(){return new Promise(r=>resumeTone=r)}close(){toneCloses++;return Promise.resolve()}createOscillator(){return {frequency:{},connect(){return {connect(){}}},start(){toneStarts++},stop(){}}}createGain(){return {gain:{}}}}
nodes.length=0;deviceCheckPanel({el,modal(){},Context:DelayedAudio});const toneButton=nodes.find(n=>n.text==='確認音を鳴らす'),tonePending=toneButton.onclick();assert.equal(toneButton.disabled,true);await toneButton.onclick();close();resumeTone();await tonePending;assert.equal(toneStarts,0,'closing before resume must suppress late sound');assert.ok(toneCloses>0);
class BrokenAudio{constructor(){throw Error('unavailable')}}
nodes.length=0;deviceCheckPanel({el,modal(){},Context:BrokenAudio});await nodes.find(n=>n.text==='確認音を鳴らす').onclick();assert.equal(nodes.find(n=>n.text==='確認音を鳴らす').disabled,false);close();
console.log('Device check: late confirmation sound suppressed and unavailable audio recovers');
