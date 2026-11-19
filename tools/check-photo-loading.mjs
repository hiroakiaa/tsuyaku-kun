import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
const {browser,setup,origin,setApiHandler}=await createUiFixture();
let read,translate,readGate,translateGate;
function reset(){readGate=new Promise(r=>{read=r});translateGate=new Promise(r=>{translate=r});}
reset();
setApiHandler(async request=>{
 const path=new URL(request.url()).pathname;
 if(path==='/photo/recognize'){await readGate;return {json:{text:'検証用の文章です。',sourceLanguage:'ja',blocks:[{id:'b0',text:'検証用の文章です。',box:{x:.1,y:.1,width:.8,height:.1}}]}};}
 if(path==='/photo/translate'){await translateGate;const b=request.postDataJSON();assert.equal(b.source,'ja');return {json:{blocks:b.blocks.map(part=>({id:part.id,translations:{[b.targets[0]]:'Test translation.'}}))}};}
});
try{
 for(const leaveEarly of [false,true]){
  reset();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await setup(context);
  if(process.env.LIVE_PHOTO_PREVIEW)await context.route('https://hiroakiaa.github.io/**',route=>route.continue());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.LIVE_PHOTO_PREVIEW?'https://hiroakiaa.github.io/tsuyaku-kun/?photo-loading-check='+Date.now():origin);await page.locator('#photo-translate-open').click();
  assert.equal(await page.locator('.photo-languages').isVisible(),false);
  assert.equal(await page.locator('.photo-translate-run').isVisible(),false);
  assert.equal(await page.locator('.photo-selection').isVisible(),false);
  const sample=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=700;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,700,1000);ctx.fillStyle='#111';ctx.font='28px sans-serif';ctx.fillText('検証用の文章です。',70,140);return c.toDataURL('image/jpeg').split(',')[1]});
  await page.locator('.photo-simple input[type=file]').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(sample,'base64')});
  await page.locator('.photo-source-viewport').waitFor({state:'visible'});
  assert.equal(await page.locator('.photo-languages select').count(),1,'Only the target language is selected');
  assert.equal(await page.locator('.photo-languages').isVisible(),true);
  await page.locator('.photo-selection-remove').click();
  assert.equal(await page.locator('.photo-languages').isVisible(),false);
  assert.equal(await page.locator('.photo-translate-run').isVisible(),false);
  assert.equal(await page.locator('.photo-selection').isVisible(),false);
  await page.locator('.photo-simple input[type=file]').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(sample,'base64')});
  await page.locator('.photo-source-viewport').waitFor({state:'visible'});
  await page.locator('.photo-selection,.photo-languages,.photo-translate-run').evaluateAll(nodes=>Promise.all(nodes.flatMap(n=>n.getAnimations()).map(a=>a.finished.catch(()=>{}))));await fs.mkdir('checks/photo-loading',{recursive:true});await page.screenshot({path:'checks/photo-loading/selected.png'});
  await page.locator('.photo-translate-run').click();
  await page.locator('.photo-preview-dialog[open]').waitFor({timeout:2000});
  const loading=page.locator('.photo-preview-loading');await loading.waitFor({state:'visible'});
  await page.locator('.photo-preview-dialog').evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
  assert.equal(await loading.locator('button').isVisible(),false,'Retry is hidden while translation is still working');
  assert.match(await loading.textContent(),/読み取|準備/);
  assert.ok(await page.locator('.photo-preview-dialog canvas').evaluate(c=>c.width>0),'Original image is available while reading');
  read();await page.waitForFunction(()=>document.querySelector('.photo-preview-loading')?.textContent.includes('翻訳しています'));
  if(leaveEarly)await page.locator('.photo-preview-close').click();
  else{await fs.mkdir('checks/photo-loading',{recursive:true});await page.screenshot({path:'checks/photo-loading/working.png'});}
  translate();await page.waitForFunction(()=>document.querySelector('.photo-simple')?.getAttribute('aria-busy')==='false');
  assert.equal(await loading.isVisible(),false,'Loading disappears when finished');
  assert.equal(await page.locator('.photo-preview-dialog').getAttribute('open'),leaveEarly?null:'','Completion never reopens a preview the user dismissed');
  if(!leaveEarly){assert.ok((await page.locator('.photo-results').textContent()).includes('Test translation'));await page.screenshot({path:'checks/photo-loading/complete.png'});}
  if(!leaveEarly)await page.locator('.photo-preview-close').click();
  await page.locator('.photo-text-details summary').click();
  assert.equal(await page.locator('.photo-text-details textarea').count(),0,'Duplicate editable OCR field removed');
  const tabs=page.locator('.photo-text-tabs [role=tab]');assert.equal(await tabs.count(),2);
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#photo-text-panel-translated').isVisible(),true);
  assert.equal(await page.locator('#photo-text-panel-original').isVisible(),false);
  for(const index of [0,1]){await tabs.nth(index).click();const panel=page.locator(index?'#photo-text-panel-translated':'#photo-text-panel-original');assert.equal(await panel.isVisible(),true);const play=panel.locator('[data-play]');assert.equal(await play.isVisible(),true);const tb=await tabs.nth(index).boundingBox(),pb=await play.boundingBox();assert.ok(Math.abs(tb.y-pb.y)<12,'Playback sits beside the tabs');}
  await fs.mkdir('checks/photo-text-tabs',{recursive:true});await page.screenshot({path:'checks/photo-text-tabs/translated.png'});
  await tabs.nth(0).click();await page.screenshot({path:'checks/photo-text-tabs/original.png'});
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log((process.env.LIVE_PHOTO_PREVIEW?'Published assets':'Local fixture')+': PASS direct preview transition, OCR/translation loading, completion without another click and user-dismissal preservation');
}finally{await browser.close();}
