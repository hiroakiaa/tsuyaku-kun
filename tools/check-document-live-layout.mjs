import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
const {browser}=await createUiFixture(),id='a7a701f4-031b-4124-bb95-1119dba6e4b2';
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<800,hasTouch:width<800});
  await context.addInitScript(()=>localStorage.setItem('tsuyaku-document-language','ja'));
  const page=await context.newPage();
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html?id='+id+'&layout-check='+Date.now());
  await page.locator('#pdf-pages canvas').first().waitFor({timeout:90000});
  await page.locator('select.document-language:visible').selectOption('en');
  const translated=page.locator('.pdf-translation-layout[data-page="1"]:visible');
  await translated.waitFor({timeout:120000});
  assert.ok(await translated.locator('canvas').count()>0);
  const count=await translated.locator('.pdf-layout-line').count();assert.ok(count>10);
  assert.equal(await page.locator('.pdf-inline-text').count(),0);
  await fs.mkdir('checks/document-live-layout',{recursive:true});await page.screenshot({path:'checks/document-live-layout/'+width+'.png',fullPage:true});
  console.log('LIVE existing shared document, '+width+'px: '+count+' translated positioned spans, original PDF canvas retained, no text-only replacement');
  await page.locator('select.document-language:visible').selectOption('ja');
  await page.waitForFunction(()=>[...document.querySelectorAll('.pdf-inline-translation')].every(frame=>frame.hidden));
  await context.close();
 }
}finally{await browser.close();}
