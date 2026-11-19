import assert from 'node:assert/strict';
import {createUiFixture} from './browser-fixture.mjs';
import {touchPinch,checkPagePinchBlocked} from './gesture-test-helpers.mjs';
const {browser,setup,origin}=await createUiFixture();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await setup(context);
 if(process.env.LIVE_PHOTO_PREVIEW)await context.route('https://hiroakiaa.github.io/**',route=>route.continue());
 const page=await context.newPage();await page.goto(process.env.LIVE_PHOTO_PREVIEW?'https://hiroakiaa.github.io/tsuyaku-kun/?qr-gesture-check='+Date.now():origin);
 await page.locator('#photo-translate-open').waitFor();
 await page.evaluate(async()=>{
  const {drawQr}=await import(new URL('web/qr.js?v=20261119-preview-only',location.href).href);
  const d=document.createElement('dialog');d.id='qr-gesture-fixture';const heading=document.createElement('h2');heading.textContent='QRプレビュー';const canvas=document.createElement('canvas');canvas.className='chat-qr-large';d.append(heading,canvas);document.body.append(d);d.showModal();drawQr(canvas,'https://example.invalid/test-invite');
 });
 await page.waitForFunction(()=>document.querySelector('.qr-preview-viewport canvas')?.style.transform.includes('scale'));
 const cdp=await context.newCDPSession(page);await checkPagePinchBlocked(page,cdp,'#qr-gesture-fixture h2');
 const before=await page.locator('.qr-preview-viewport canvas').evaluate(e=>e.getBoundingClientRect().width);
 await touchPinch(page,cdp,'.qr-preview-viewport');
 const after=await page.locator('.qr-preview-viewport canvas').evaluate(e=>e.getBoundingClientRect().width);
 assert.ok(after>before*1.3);assert.equal(await page.evaluate(()=>visualViewport.scale),1);
 await page.evaluate(()=>document.querySelector('#qr-gesture-fixture').close());
 console.log((process.env.LIVE_PHOTO_PREVIEW?'Published assets':'Local fixture')+': PASS QR preview zooms internally while the app stays at scale 1');
 await context.close();
}finally{await browser.close();}
