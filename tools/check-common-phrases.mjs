import assert from 'node:assert/strict';
import {createUiFixture} from './browser-fixture.mjs';
import {catalog} from '../server/catalog.js';
const f=await createUiFixture({automaticLanguage:true});let translations=0,recognitions=0;
try{
 f.setApiHandler(async r=>{const path=new URL(r.url()).pathname;if(path==='/catalog')return {json:{...catalog,phrases:[],terms:[],bank:[],glossary:[]}};if(path==='/transcribe'){recognitions++;return {json:{text:'How old are you?',language:'en'}};}if(path==='/translate'){translations++;throw Error('Exact builtin must not request translation');}});
 const c=await f.browser.newContext({viewport:{width:390,height:844}});await f.setup(c);
 await c.addInitScript(()=>{localStorage.setItem('tsuyaku-english-guides-v1','off');localStorage.setItem('tsuyaku-speaking-language','ja');localStorage.setItem('tsuyaku-display-language','en');const Context=window.AudioContext;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new Context().createMediaStreamDestination().stream});window.AudioContext=class extends Context{get audioWorklet(){return {addModule:async()=>{}};}createMediaStreamSource(){return {connect(){},disconnect(){}};}};window.AudioWorkletNode=class{constructor(c,name){this.port={postMessage(){},onmessage:null};if(name==='caption-pcm')window.asrNode=this;}connect(){}disconnect(){}};});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.origin);await p.locator('#microphone:not([disabled])').waitFor();await p.locator('#microphone').click();await p.waitForFunction(()=>window.asrNode?.port.onmessage);
 await p.evaluate(()=>{const samples=new Int16Array(16000);for(let i=0;i<6000;i++)samples[i]=i%2?2000:-2000;window.asrNode.port.onmessage({data:{samples,boundary:'pause'}});});
 await p.getByText('何歳ですか？',{exact:true}).waitFor();assert.equal(await p.getByText('同梱の定型文',{exact:true}).count(),1);assert.equal(translations,0);assert.equal(recognitions,1);assert.equal(await p.locator('.caption-waiting').count(),0);assert.deepEqual(errors,[]);await p.screenshot({path:'checks/common-phrases-390x844.png'});await c.close();console.log('PASS browser: one recognition, no translation request, builtin label, ready bubble and no script errors');
}finally{await f.browser.close();}
