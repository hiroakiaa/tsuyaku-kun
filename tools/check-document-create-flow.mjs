import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
import {config} from '../web/config.js';
const live=Boolean(process.env.LIVE_DOCUMENT_CREATE),fixture=await createUiFixture(),{browser,setup,origin}=fixture;let id='11111111-1111-4111-8111-111111111111',title='',created=false,auth,createdTitle;
if(live){auth=await(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.firebase.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})})).json();if(!auth.idToken)throw Error('Test authentication unavailable');}
const producer=await browser.newPage();const font=(await fs.readFile('web/ZenMaruGothic-Regular.ttf')).toString('base64');await producer.setContent('<style>@font-face{font-family:Test;src:url(data:font/ttf;base64,'+font+')}body{font:20px Test}</style><h1>入学説明会</h1><p>参加費は1200円です。説明会は4月8日に開催します。ノートと筆記用具を持参してください。欠席の場合は前日までに学校へ連絡してください。</p>');await producer.evaluate(()=>document.fonts.ready);const pdf=await producer.pdf();await producer.close();
fixture.setApiHandler(async request=>{const path=new URL(request.url()).pathname;if(!path.startsWith('/documents'))return;
 if(live){const response=await fetch(config.api+path,{method:request.method(),headers:{Authorization:'Bearer '+auth.idToken,Origin:'https://hiroakiaa.github.io',...(request.headers()['content-type']?{'Content-Type':request.headers()['content-type']}:{})},body:request.postDataBuffer()||undefined,signal:AbortSignal.timeout(90000)});
 if(path.endsWith('/pdf')||response.headers.get('content-type')?.includes('text/event-stream'))return {status:response.status,body:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get('content-type')};
 const data=await response.json();if(path.endsWith('/ask'))console.log('Live question response:',JSON.stringify(data));if(path==='/documents'&&response.ok){id=data.id;created=true;}return {status:response.status,json:data};}
 if(path==='/documents'&&request.method()==='POST'){const form=await new Response(request.postDataBuffer(),{headers:{'Content-Type':request.headers()['content-type']}}).formData();title=createdTitle=form.get('title');assert.match(title,/^\d{8}_入学説明会$/);return {status:201,json:{id,createdAt:Date.now()}};}
 if(path==='/documents/'+id)return {json:{id,title,sourceType:'pdf',pageCount:1,items:[],materials:[],canRemove:true,summaryReady:true}};
 if(path.endsWith('/pdf'))return {body:pdf,contentType:'application/pdf'};
 if(path.endsWith('/title')){title=request.postDataJSON().title;return {json:{title}};}
 if(path.endsWith('/text'))return {json:['School welcome guide. Bring a notebook on April 8. Fee 1200 yen.']};return {json:[]};
});
try{
 for(const width of live?[390]:[390,1280]){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<800,hasTouch:width<800});await setup(context);if(live)await context.route('https://hiroakiaa.github.io/**',r=>r.continue());await context.addInitScript(()=>localStorage.setItem('tsuyaku-document-language','ja'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto((live?'https://hiroakiaa.github.io/tsuyaku-kun':origin)+'/documents.html?create=1&check='+Date.now());await page.locator('#upload').waitFor();
 assert.equal(await page.locator('#upload [name=title]').count(),0);const order=await page.locator('#upload input,#upload select').evaluateAll(nodes=>nodes.map(n=>n.name));assert.deepEqual(order,['pdf','visibility']);
 await page.locator('#upload [name=pdf]').setInputFiles({name:'入学説明会.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('#upload .create-guide').click();
 await page.locator('#ask-dialog[open]').waitFor({timeout:90000});await page.locator('#pdf-pages canvas').first().waitFor({timeout:90000});assert.equal(await page.locator('#question').isVisible(),true);assert.equal(await page.locator('#question').isEnabled(),true);assert.equal(await page.locator('#upload').count(),0);
 const heading=page.locator('#pdf-heading');assert.match(await heading.textContent(),/^\d{8}_入学説明会$/);createdTitle=await heading.textContent();assert.ok(page.url().includes('id='));
 const colors=await page.locator('#pdf-scroll').evaluate(e=>({background:getComputedStyle(e).backgroundColor,app:getComputedStyle(document.body).backgroundColor}));assert.equal(colors.background,colors.app);
 await page.locator('#zoom-in').click();await page.locator('#zoom-fit').waitFor();const fit=await page.locator('#zoom-fit').boundingBox(),zoom=await page.locator('#zoom-in').boundingBox();assert.ok(fit.y<zoom.y);await page.locator('#zoom-fit').click();
 await heading.click();const editor=page.locator('#document-title-editor');await editor.locator('input').fill('編集後の入学説明会');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(await heading.textContent(),'編集後の入学説明会');if(live){await page.locator('#question').fill('参加費はいくらですか？');await page.locator('#ask-form button.primary').click();await page.waitForFunction(()=>/1[, ]?200|１２００|千二百/.test(document.querySelector('#messages')?.textContent||''),{},{timeout:45000}).catch(async error=>{console.log('Question UI:',await page.locator('#messages').textContent(),await page.locator('#answer-status').textContent());throw error;});}assert.deepEqual(errors,[]);
 await fs.mkdir('checks/document-create',{recursive:true});await page.screenshot({path:'checks/document-create/'+(live?'public-':'local-')+width+'.png'});await context.close();
 }
 console.log(JSON.stringify({result:'PASS file/storage order, automatic title, direct question screen, theme background, fit above zoom and saved rename',live,createdTitle}));
}finally{if(live&&created){const response=await fetch(config.api+'/documents/'+id+'/remove',{method:'POST',headers:{Authorization:'Bearer '+auth.idToken,Origin:'https://hiroakiaa.github.io'}});assert.ok(response.ok,'Remove synthetic test document');console.log('Synthetic test document removed');}await browser.close();}
