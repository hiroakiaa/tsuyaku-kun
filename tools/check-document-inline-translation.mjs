import {checkPagePinchBlocked,touchPinch} from './gesture-test-helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
const fixture=await createUiFixture(),{browser,setup,origin}=fixture,id='11111111-1111-4111-8111-111111111111';
const producer=await browser.newPage();await producer.setContent('<style>body{font:20px Arial;margin:40px}h1{font-size:28px}p{margin:30px 0}</style><h1>School handbook</h1><p>Please bring your notebook to the school office.</p><p>The library opens at nine and closes at three.</p>');
const pdf=await producer.pdf();await producer.close();let layoutRequests=0;
fixture.setApiHandler(request=>{
 const path=new URL(request.url()).pathname;
 if(path==='/documents/'+id)return {json:{id,title:'Synthetic layout regression',sourceType:'pdf',pageCount:1,items:[],materials:[],canRemove:false,summaryReady:true}};
 if(path==='/documents/'+id+'/pdf')return {body:pdf,contentType:'application/pdf'};
 if(path==='/documents/'+id+'/translate'){
  const input=request.postDataJSON();if(input.section)return {json:{source:[],lines:[]}};
  if(process.env.SPLIT_CACHED_TRANSLATION){layoutRequests++;return {json:{source:['School','handbook','Please bring your notebook to the school office.','The library opens at nine and closes at three.'],lines:['Campus','Guide','Bring your notebook to the school office.','The library is open from nine until three.'],reuse:'cache'}};}
  if(process.env.LONG_TRANSLATION){layoutRequests++;const source=(input.layoutText||'School handbook Please bring your notebook to the school office. The library opens at nine and closes at three.').replace(/\n/g,' ');return {json:{source:[source],lines:[('Bitte bringen Sie Ihr Notizbuch mit und lesen Sie die vollständigen Anweisungen sorgfältig. ').repeat(16)],reuse:'cache'}};}
  layoutRequests++;const source=(input.layoutText||'School handbook Please bring your notebook to the school office. The library opens at nine and closes at three.').replace(/\n/g,' ');
  return {json:{source:[source],lines:['Guide: bring your notebook to the school office. The library is open from nine until three.'],text:'Guide: bring your notebook to the school office. The library is open from nine until three.',reuse:'cache'}};
 }
 if(path.startsWith('/documents/'))return {json:[]};
});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<800,hasTouch:width<800});await setup(context);if(process.env.LIVE_DOCUMENT_LAYOUT)await context.route('https://hiroakiaa.github.io/**',route=>route.continue());
  if(process.env.PDF_GEOMETRY_RECOVERY)await context.route('**/web/document-table-lookup.js*',route=>{if(new URL(route.request().url()).searchParams.has('native'))return route.fallback();return route.fulfill({contentType:'text/javascript',body:"export {lookupTableCell,lookupAlignedTableCell,tableOverviewEntity} from './document-table-lookup.js?native=1';import {readPdfPageText as native} from './document-table-lookup.js?native=1';export async function readPdfPageText(page){const result=await native(page);return {...result,items:result.items.map((item,i)=>i===0?{...item,height:0,transform:[item.transform[0],.0000001,.0000001,item.transform[3],item.transform[4],item.transform[5]]}:item)}}"});});
  if(process.env.SCAN_LAYOUT_RECOVERY){
   await context.route('**/web/document-table-lookup.js*',route=>{if(new URL(route.request().url()).searchParams.has('native'))return route.fallback();return route.fulfill({contentType:'text/javascript',body:"export {lookupTableCell,lookupAlignedTableCell,tableOverviewEntity} from './document-table-lookup.js?native=1';export async function readPdfPageText(){return {items:[]}}"});});
   await context.route('**/web/document-ocr.js*',route=>route.fulfill({contentType:'text/javascript',body:"export async function createPdfOcr(){return {async readLayout(page){window.__ocrAttempt=(window.__ocrAttempt||0)+1;return window.__ocrAttempt<=2?[]:(await page.getTextContent()).items;},async close(){}}}"}));
  }


  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.LIVE_DOCUMENT_LAYOUT?'https://hiroakiaa.github.io/tsuyaku-kun':origin;
  await page.goto(base+'/documents.html?id='+id);
  await page.locator('#pdf-pages canvas').first().waitFor({timeout:30000});
  if(width<800){
   const cdp=await context.newCDPSession(page);await checkPagePinchBlocked(page,cdp,'#ask-form');
   const before=await page.locator('#pdf-pages').evaluate(e=>e.getBoundingClientRect().width);
   await touchPinch(page,cdp,'#pdf-scroll');
   const after=await page.locator('#pdf-pages').evaluate(e=>e.getBoundingClientRect().width);
   assert.ok(after>before*1.3,'PDF magnifies inside its preview');
   assert.equal(await page.evaluate(()=>visualViewport.scale),1,'PDF zoom does not magnify the app');
   await page.locator('#zoom-fit').click();
   const wheelBefore=await page.locator('#pdf-pages').evaluate(e=>e.getBoundingClientRect().width);
   await page.locator('#pdf-scroll').dispatchEvent('wheel',{ctrlKey:true,deltaY:-40,clientX:150,clientY:180});
   assert.ok(await page.locator('#pdf-pages').evaluate(e=>e.getBoundingClientRect().width)>wheelBefore*1.2,'Trackpad pinch zooms the PDF only');
   await page.locator('#zoom-fit').click();
   await touchPinch(page,cdp,'#pdf-scroll',.15);
   const minimum=await page.locator('#pdf-scroll').evaluate(v=>{const p=v.querySelector('.pdf-page-view').getBoundingClientRect();return {w:p.width,h:p.height,vw:v.clientWidth,vh:v.clientHeight};});
   assert.ok(minimum.w<=minimum.vw+2&&minimum.h<=minimum.vh+2,'Smallest PDF fits in both directions');
   assert.ok(Math.min(Math.abs(minimum.w-minimum.vw),Math.abs(minimum.h-minimum.vh))<3,'Smallest PDF touches one inner edge');
   await page.locator('#zoom-fit').click();
  }
  await page.locator('select.document-language:visible').selectOption('en');await page.locator('select.document-language:visible').selectOption('pt');await page.locator('.pdf-inline-translation[data-language="pt"]:visible').waitFor();assert.equal(await page.locator('.pdf-inline-translation[data-language="en"]:visible').count(),0);await page.locator('select.document-language:visible').selectOption('en');
  const frame=page.locator('.pdf-translation-layout[data-page="1"]:visible');await frame.waitFor({timeout:30000});
  assert.ok(await frame.locator('canvas').count()>0,'Original PDF page remains in the translated view');
  assert.ok(await frame.locator('.pdf-layout-line').count()>=3,'Legacy paragraph translation is positioned on physical PDF lines');
  assert.equal(await page.locator('.pdf-inline-text').count(),0,'Never replace the document with a plain text panel');
  const geometry=await frame.locator('.pdf-layout-line').evaluateAll(lines=>lines.every(line=>parseFloat(line.style.left)>=0&&parseFloat(line.style.top)>=0&&line.getBoundingClientRect().height>0));
  assert.ok(geometry);assert.deepEqual(errors,[]);
  if(process.env.LONG_TRANSLATION){
   const small=frame.locator('.pdf-readable-line').first();await small.waitFor();
   assert.ok((await frame.locator('.pdf-layout-line').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)))).every(size=>size>=12),'Every visible translated block respects 12 CSS pixels');
   const full=await small.getAttribute('data-full-translation');assert.ok(full.length>80);
   await small.press('Enter');await page.locator('#read-translation').waitFor();assert.equal(await page.locator('#read-translation-text').textContent(),full,'Overflow text is complete and keyboard accessible');const modalBox=await page.locator('#read-translation').evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight}});assert.ok(Math.abs(modalBox.x+modalBox.w/2-modalBox.vw/2)<2&&Math.abs(modalBox.y+modalBox.h/2-modalBox.vh/2)<2,'Full translation dialog is centered');await page.locator('#read-translation form button').click();
  }
  await fs.mkdir('checks/document-inline',{recursive:true});await page.screenshot({path:'checks/document-inline/'+width+'.png',fullPage:true});
  await page.locator('#pdf-language-toggle button[data-language=""]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.pdf-inline-translation')].every(f=>f.hidden));
  await page.locator('#pdf-language-toggle button[data-language="en"]').click();await frame.waitFor();
  if(process.env.SCAN_LAYOUT_RECOVERY)assert.ok(await page.evaluate(()=>window.__ocrAttempt>=3),'Failed OCR layout was refreshed automatically');
  await page.locator('select.document-language:visible').selectOption('ja');
  await page.waitForFunction(()=>[...document.querySelectorAll('.pdf-inline-translation')].every(frame=>frame.hidden));
  await page.locator('select.document-language:visible').selectOption('en');await frame.waitFor();
  await page.evaluate(id=>{localStorage.setItem('tsuyaku-reading:'+id,JSON.stringify({page:1,translationMode:''}));localStorage.setItem('tsuyaku-document-language','en');},id);
  await page.reload();await page.locator('.pdf-inline-translation[data-language="en"]:visible').waitFor();assert.equal(await page.locator('#pdf-language').inputValue(),'en','Reopening selected language overrides saved original mode');
  console.log((process.env.LIVE_DOCUMENT_LAYOUT?'Published assets':'Local fixture')+': PASS '+width+'px original PDF canvas + positioned translation, original toggle and cached paragraph reuse');
  await context.close();
 }
 assert.ok(layoutRequests>0);
}finally{await browser.close();}
