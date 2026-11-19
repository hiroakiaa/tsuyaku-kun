import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {config} from '../web/config.js';
const auth=await(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.firebase.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})})).json();
if(!auth.idToken)throw Error('Anonymous authentication unavailable');
const headers={Authorization:'Bearer '+auth.idToken,Origin:'https://hiroakiaa.github.io','Content-Type':'application/json'};
async function api(path,body){const r=await fetch(config.api+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const data=await r.json();if(!r.ok)throw Error(path+' HTTP '+r.status+': '+data.error);return data;}
const input={source:'auto',targets:['en'],blocks:[{id:'b0',text:'図書室の窓辺にある青い箱へ、読み終えた冊子を戻してください。'}]};
const first=await api('/photo/translate',input),second=await api('/photo/translate',{...input,blocks:[{...input.blocks[0],id:'b99'}]});
assert.ok(first.blocks[0].translations.en);console.log('Automatic source translation:',first.blocks[0].translations.en);assert.equal(second.reuse,'cache');assert.equal(second.blocks[0].id,'b99');assert.equal(second.usage.inputTokens,0);assert.equal(second.usage.outputTokens,0);
const before=await api('/photo/status'),image=(await fs.readFile('checks/photo-test/synthetic-clear.jpg')).toString('base64');
const ocrFirst=await api('/photo/recognize',{image,id:crypto.randomUUID()}),ocrSecond=await api('/photo/recognize',{image,id:crypto.randomUUID()});
assert.ok(ocrFirst.text);assert.equal(ocrSecond.reuse,'cache');assert.equal(ocrFirst.text,ocrSecond.text);
const after=await api('/photo/status');assert.equal(after.userUsed-before.userUsed,1,'Repeat image recognition consumes only one OCR call');
const result={translation:{first:first.reuse,firstInputTokens:first.usage.inputTokens,firstOutputTokens:first.usage.outputTokens,second:second.reuse,secondInputTokens:second.usage.inputTokens,secondOutputTokens:second.usage.outputTokens},ocr:{first:ocrFirst.reuse,second:ocrSecond.reuse,providerCalls:after.userUsed-before.userUsed}};
await fs.mkdir('checks/photo-reuse',{recursive:true});await fs.writeFile('checks/photo-reuse/live-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
