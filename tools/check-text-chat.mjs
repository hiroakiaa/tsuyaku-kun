import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
const fixture=await createUiFixture(),{browser,setup,origin}=fixture,results=[],errors=[];
try{for(const [width,height] of [[390,844],[568,320],[1024,600]]){
 const context=await browser.newContext({viewport:{width,height}});await setup(context);let turn=0;context.on('request',r=>{if(r.url().includes('turn-credentials'))turn++;});
 await context.addInitScript(()=>{
  window.testPeerCalls=0;window.RTCPeerConnection=class{constructor(){window.testPeerCalls++;throw Error('Chat must not create audio peer')}};
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};window.testSpoken=[];Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>['ja-JP','es-ES','en-US'].map(lang=>({lang,name:'Test voice '+lang,localService:true})),cancel(){},resume(){},pause(){},addEventListener(){},removeEventListener(){},speak(u){window.testSpoken.push(u.text);u.onstart?.();}}});
  window.SpeechRecognition=class{start(){window.testRecognition=this;this.onstart?.()}abort(){}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const c=new AudioContext(),d=c.createMediaStreamDestination();window.testAudio=c;return d.stream;}});
 });
 const groups=new Map();let serial=0;
 await context.routeWebSocket('**/rooms/*/socket',socket=>{
  const roomId=new URL(socket.url()).pathname.split('/')[2],id=(++serial).toString(16).padStart(32,'0');let client;
  const send=(s,m)=>s.send(JSON.stringify(m));
  socket.onMessage(raw=>{const m=JSON.parse(String(raw));let group=groups.get(roomId);if(!group)groups.set(roomId,group=[]);
   if(m.type==='auth'){client={socket,id,language:m.language||'ja',name:'試験参加者'};group.push(client);send(socket,{type:'ready',id,role:group.length===1?'teacher':'guest',mode:'interpreter',history:[],expires:Date.now()+3600000});for(const p of group)send(p.socket,{type:'participants',participants:group.map(x=>({id:x.id,language:x.language,name:x.name,role:'guest'}))});if(group.length>1)send(socket,{type:'signal',from:group[0].id,signal:{description:{type:'offer',sdp:'synthetic obsolete client'}}});}
   if(m.type==='language'&&client)client.language=m.language;
   if(m.type==='ping')send(socket,{type:'pong'});
   if(m.type==='caption'&&m.final){const key=id+'_'+m.id,record={type:'translation',id:key,text:m.text,source:client.language,translations:{ja:'明日は学校へ行きます。',es:'Mañana voy a la escuela.',en:'I will go to school tomorrow.'},status:'ready',final:true,revision:m.revision||0,at:Date.now(),latencyMs:1,usage:{inputTokens:0,outputTokens:0,cacheHit:true}};send(socket,{type:'caption_accepted',id:key,revision:record.revision});for(const p of group)send(p.socket,record);}
   if(m.type==='caption_received')for(const p of group)send(p.socket,{type:'caption_delivered',id:m.id,revision:m.revision,count:1,total:1});
   if(m.type==='signal')errors.push('Unexpected outgoing audio signaling');
  });
 });
 const a=await context.newPage(),b=await context.newPage();for(const p of [a,b]){p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));}
 await a.goto(origin);await a.locator('#microphone:not([disabled])').waitFor();await a.locator('#tab-interpreter').click();const link=await a.locator('#call-invite-link').inputValue();await b.goto(link);await b.locator('#modal-body select').selectOption('es');await b.locator('#modal-body button').filter({hasText:'Join'}).click();await b.locator('#participants .participant').nth(1).waitFor();await a.locator('#participants .participant').nth(1).waitFor();
 // Submit existing text input, then exercise the existing microphone-to-caption path.
 await a.locator('#text-toggle').click();await a.locator('#text-input').fill('明日は学校へ行きます。');await a.locator('#text-form').evaluate(n=>n.requestSubmit());await b.locator('.caption-line>p').filter({hasText:'Mañana voy a la escuela.'}).waitFor();
 await b.locator('#microphone').click();await b.waitForFunction(()=>!!window.testRecognition);await b.evaluate(()=>{const r=[{transcript:'Mañana voy a la escuela.'}];r.isFinal=true;window.testRecognition.onresult({resultIndex:0,results:[r]});});await a.locator('.caption').nth(1).waitFor();await a.locator('.caption').nth(1).locator('.caption-line>p').filter({hasText:'明日は学校へ行きます。'}).waitFor();await b.locator('#microphone').click();
 await b.locator('.caption [data-play]').first().click();await b.waitForFunction(()=>window.testSpoken.length>0);for(const p of [a,b]){assert.equal(await p.evaluate(()=>window.testPeerCalls),0);assert.equal(await p.locator('#tab-interpreter .nav-label').textContent(),'チャット');assert.equal(await p.locator('.participant-connection').filter({hasText:'音声'}).count(),0);}assert.equal(turn,0);results.push({width,height,bidirectionalText:true,syntheticRecognition:true,manualPlayback:true,peerConnections:0,turnRequests:turn});await a.screenshot({path:`checks/text-chat-${width}x${height}.png`});await context.close();
}}finally{await browser.close();await fs.writeFile('checks/text-chat-results.json',JSON.stringify({note:'Synthetic recognition, translation, transport and playback. No physical-device or translation-quality claim.',results,errors},null,2));}
assert.equal(errors.length,0,JSON.stringify(errors));console.log(JSON.stringify({results,errors},null,2));
