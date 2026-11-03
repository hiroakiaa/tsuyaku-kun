import assert from 'node:assert/strict';
import {createUiFixture} from './browser-fixture.mjs';
const f=await createUiFixture({automaticLanguage:true});
try{
 for(const width of [390,1024]){
  const c=await f.browser.newContext({viewport:{width,height:844}});await f.setup(c);
  await c.addInitScript(()=>{localStorage.setItem('tsuyaku-speaking-language','ja');localStorage.setItem('tsuyaku-display-language','en');Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const a=new AudioContext(),o=a.createOscillator(),d=a.createMediaStreamDestination();o.connect(d);o.start();void a.resume();return d.stream;}});});
  await c.route('**/web/caption-server.js*',r=>r.fulfill({contentType:'text/javascript',body:`export function tokenWithAbort(f){return f();}export function encodeWav(){return new ArrayBuffer(0);}export function createServerRecognition(){return class{constructor(){window.testRecognition=this;}start(){this.onstart?.();}abort(){}stop(){}setHints(){}}}` }));
  const p=await c.newPage(),errors=[];p.setDefaultTimeout(10000);console.log('START',width);p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});await p.goto(f.origin);await p.locator('#microphone:not([disabled])').waitFor();console.log('READY');await p.locator('#microphone').click();console.log('CLICKED');await p.waitForFunction(()=>!!window.testRecognition);
  await p.evaluate(()=>window.testRecognition.onlanguageuncertain({reason:'outside_pair',candidates:['de']}));
  assert.equal(await p.locator('#face-other-language').inputValue(),'en');
  await p.getByRole('button',{name:'言語の候補を選ぶ',exact:true}).click();
  await p.screenshot({path:'checks/language-candidate-'+width+'.png'});
  await p.evaluate(()=>window.testRecognition.onerror({error:'auth'}));await p.getByRole('button',{name:'相手の言語をドイツ語にする',exact:true}).click();assert.equal(await p.locator('#face-other-language').inputValue(),'en');await p.locator('#microphone').click();await p.waitForFunction(()=>!!window.testRecognition);await p.evaluate(()=>window.testRecognition.onlanguageuncertain({reason:'outside_pair',candidates:['de']}));await p.getByRole('button',{name:'言語の候補を選ぶ',exact:true}).click();await p.getByRole('button',{name:'相手の言語をドイツ語にする',exact:true}).click();
  assert.equal(await p.locator('#face-other-language').inputValue(),'de');
  assert.equal(await p.locator('#face-self-language').inputValue(),'ja');
  assert.equal(await p.locator('#captions .caption').count(),0);
  assert.deepEqual(errors,[]);await c.close();console.log('PASS candidate requires choice; German applies to chosen side; no unselected transcript '+width);
 }
}finally{await f.browser.close();}
