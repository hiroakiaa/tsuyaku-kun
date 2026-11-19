import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createUiFixture} from './browser-fixture.mjs';
const fixture=await createUiFixture(),{browser,setup,origin}=fixture;
let ocrCalls=0,translationCalls=0;
fixture.setApiHandler(request=>{
 const path=new URL(request.url()).pathname;
 if(path==='/photo/recognize'){ocrCalls++;return {json:{text:'提出日は10月20日です。',blocks:[{id:'b0',text:'提出日は10月20日です。',box:{x:.04,y:.17,width:.8,height:.08}}]}};}
 if(path==='/photo/translate'){translationCalls++;const body=request.postDataJSON();return {json:{reuse:process.env.PHOTO_REUSE_UI_TEST?'cache':'generated',blocks:body.blocks.map(b=>({id:b.id,translations:{[body.targets[0]]:'Due October 20.'}}))}};}
});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await setup(context);if(process.env.LIVE_PHOTO_PREVIEW)await context.route('https://hiroakiaa.github.io/**',route=>route.continue());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIVE_PHOTO_PREVIEW?'https://hiroakiaa.github.io/tsuyaku-kun/?photo-pinch-check='+Date.now():origin);await page.locator('#photo-translate-open').click();
 const sample=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=2400;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';g.font='42px sans-serif';g.fillText('提出日は10月20日です。',56,245);g.strokeStyle='#ddd';g.strokeRect(40,180,1300,120);return c.toDataURL('image/jpeg').split(',')[1];});
 await page.locator('.photo-simple input[type=file]').setInputFiles({name:'synthetic-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(sample,'base64')});
 const source=page.locator('.photo-source-viewport');await source.waitFor({state:'visible'});
 const full=await source.evaluate(v=>({width:v.clientWidth,height:v.clientHeight,ratio:v.querySelector('canvas').height/v.querySelector('canvas').width}));
 assert.ok(full.height<=230,'The form only shows a compact thumbnail');
 await source.click();await page.locator('.photo-preview-dialog[open]').waitFor();await page.locator('.photo-preview-close').click();
 await page.locator('.photo-translate-run').click();
 if(process.env.PHOTO_REUSE_UI_TEST){await page.waitForFunction(()=>document.querySelector('.photo-simple')?.getAttribute('aria-busy')==='false');assert.ok((await page.locator('.photo-notice').textContent()).includes('再利用'));}
 await page.locator('.photo-open-preview').click();
 const viewport=page.locator('.photo-preview-dialog .photo-overlay-viewport');await viewport.waitFor({state:'visible'});
 const fitBox=await viewport.evaluate(v=>{const c=v.querySelector('canvas').getBoundingClientRect();return {imageWidth:c.width,imageHeight:c.height,width:v.clientWidth,height:v.clientHeight};});
 assert.ok(fitBox.imageWidth<=fitBox.width+2 && fitBox.imageHeight<=fitBox.height+2,'Dedicated preview initially fits the whole image');
 const cdp=await context.newCDPSession(page);
 async function metrics(){return viewport.evaluate(v=>({left:v.scrollLeft,top:v.scrollTop,width:v.clientWidth,height:v.clientHeight,scale:Number(v.querySelector('canvas').style.transform.match(/scale\(([^)]+)/)[1])}));}
 async function pinch(from,to){
  await viewport.scrollIntoViewIfNeeded();const r=await viewport.boundingBox();
  const mid={x:r.x+r.width*.55,y:(Math.max(r.y,100)+Math.min(r.y+r.height,800))/2};
  const points=d=>[{x:mid.x-d/2,y:mid.y,id:1},{x:mid.x+d/2,y:mid.y,id:2}];
  const before=await metrics();const anchor={x:mid.x-r.x-1,y:mid.y-r.y-1};
  const originalBox=await viewport.locator('canvas').boundingBox();
  const imagePoint={x:(mid.x-originalBox.x)/before.scale,y:(mid.y-originalBox.y)/before.scale};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(from)});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(from+(to-from)*i/8)});await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await metrics();assert.ok(Math.abs(after.scale-before.scale*to/from)<.08,'Pinch scale follows fingers');
  const afterBox=await viewport.locator('canvas').boundingBox();
  assert.ok(Math.abs((mid.x-afterBox.x)/after.scale-imagePoint.x)<3,'Horizontal point under fingers stays fixed');
  assert.ok(Math.abs((mid.y-afterBox.y)/after.scale-imagePoint.y)<3,'Vertical point under fingers stays fixed');
  return after;
 }
 await pinch(60,120);
 await viewport.evaluate(v=>{v.scrollLeft+=25;v.scrollTop+=30;});
 await pinch(60,90);
 const before=await metrics();await page.locator('.photo-preview-modes button').nth(0).click();
 const after=await metrics();assert.deepEqual(after,before,'Switching original keeps zoom and position');
 await page.locator('.photo-preview-modes button').nth(1).click();
 assert.deepEqual(await metrics(),before);assert.equal(ocrCalls,1);assert.equal(translationCalls,1,'Pinch and toggles never call AI again');
 await pinch(100,60);
 await fs.mkdir('checks/photo-pinch',{recursive:true});
 await page.screenshot({path:'checks/photo-pinch/mobile-translated.png',fullPage:true});
 
 await page.locator('.photo-display-settings input[type=range]').fill('1');
 assert.equal((await metrics()).scale,1);
 const compact=await page.locator('.photo-preview-dialog').evaluate(d=>({header:d.querySelector('.photo-preview-heading').getBoundingClientRect().height,footer:d.querySelector('.photo-display-settings').getBoundingClientRect().height,unused:d.querySelector('.photo-overlay-viewport').clientHeight-d.querySelector('.photo-overlay-viewport canvas').getBoundingClientRect().height}));
 assert.equal(compact.header,64,'Header spacing matches the other app modes');assert.equal(compact.footer,64,'Footer spacing matches the other app modes');
 const touch=await page.locator('.photo-preview-dialog button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=48));assert.ok(touch,'All buttons have comfortable 48px touch targets');
 const screen=await page.locator('.photo-preview-dialog').evaluate(d=>{const b=d.getBoundingClientRect(),v=d.querySelector('.photo-overlay-viewport').getBoundingClientRect(),c=d.querySelector('.photo-overlay-viewport canvas').getBoundingClientRect();return {top:b.top,bottom:innerHeight-b.bottom,topGap:c.top-v.top,bottomGap:v.bottom-c.bottom};});
 assert.ok(Math.abs(screen.top)<1&&Math.abs(screen.bottom)<1,'No unused area outside the preview');
 assert.ok(Math.abs(screen.topGap-screen.bottomGap)<3,'Image aspect-ratio space is balanced in the viewport');
 const placement=await page.locator('.photo-preview-dialog').evaluate(d=>{
  const bounds=d.getBoundingClientRect(),header=d.querySelector('.photo-preview-heading').getBoundingClientRect(),modes=d.querySelector('.photo-preview-modes').getBoundingClientRect();
  const buttons=[...d.querySelector('.photo-display-settings').querySelectorAll('button')].map(b=>b.getBoundingClientRect());
  const close=d.querySelector('.photo-preview-close').getBoundingClientRect();
  return {headerContainsClose:close.right<=bounds.right&&close.left>=bounds.left,footerGap:bounds.bottom-Math.max(...buttons.map(b=>b.bottom)),headerContainsModes:modes.top>=header.top&&modes.bottom<=header.bottom,titleVisible:d.querySelector('h2').getBoundingClientRect().width>30};
 });
 if(process.env.PHOTO_STYLE_DEBUG)console.log('close',await page.locator('.photo-preview-close').evaluate(e=>({html:e.outerHTML,color:getComputedStyle(e).color,font:getComputedStyle(e).fontSize,before:getComputedStyle(e,'::before').backgroundImage,beforeContent:getComputedStyle(e,'::before').content,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility})));
 if(process.env.PHOTO_STYLE_DEBUG)console.log('placement',placement,await page.locator('.photo-preview-heading').evaluate(h=>[...h.children].map(e=>({tag:e.tagName,width:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x,margin:getComputedStyle(e).margin,flex:getComputedStyle(e).flex}))));
 assert.ok(placement.headerContainsClose,'Close button stays inside the header');
 assert.ok(placement.footerGap<=8,'Buttons end at the modal bottom without a home-indicator spacer');
 assert.ok(placement.headerContainsModes&&placement.titleVisible,'Title and original/translation controls share the header');
 const noticeGap=await page.locator('.photo-preview-dialog').evaluate(d=>{
  const note=d.querySelector('.photo-help');note.textContent='補足がある場合も操作ボタンは最下段です。';note.hidden=false;
  const bottom=Math.max(...[...d.querySelector('.photo-display-settings').querySelectorAll('button')].map(b=>b.getBoundingClientRect().bottom));
  const gap=d.getBoundingClientRect().bottom-bottom;note.hidden=true;return gap;
 });
 assert.ok(noticeGap<=8,'Even with a translation notice, no panel is reserved below the buttons');
 await page.screenshot({path:'checks/photo-pinch/mobile-fit.png',fullPage:true});
 if(process.env.PHOTO_STYLE_DEBUG)console.log(await page.evaluate(()=>({body:document.body.className,heading:document.querySelector('.modal-heading')?.outerHTML,styles:[document.querySelector('.modal-heading'),document.querySelector('#modal-body')].map(e=>({background:getComputedStyle(e).backgroundColor,z:getComputedStyle(e).zIndex,position:getComputedStyle(e).position}))})));
 await page.locator('.photo-preview-close').click();
 assert.equal(await page.locator('#modal').getAttribute('open'),'');
 await page.locator('.photo-text-details summary').click();await page.locator('.photo-results').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.photo-preview-dialog').getAttribute('open'),null,'Only the preview closes');
 assert.equal(await page.locator('.photo-simple .photo-overlay-viewport').count(),0,'Form has no nested image scroller');
 await page.setViewportSize({width:390,height:568});
 await page.locator('#modal').evaluate(d=>{d.scrollTop=0;});
 await page.locator('.photo-open-preview').hover();
 const scrollBefore=await page.locator('#modal').evaluate(d=>d.scrollTop);
 await page.mouse.wheel(0,700);
 await page.waitForFunction(before=>document.querySelector('#modal').scrollTop>before,scrollBefore);
 assert.deepEqual(errors,[]);
 console.log((process.env.LIVE_PHOTO_PREVIEW?'Published assets (synthetic OCR/translation responses): ':'Local fixture: ')+'PASS mobile touch pinch: focus point, continued zoom after scroll, original toggle, zoom slider, no added API calls; dedicated preview closes back to scrollable form');
 await context.close();
}finally{await browser.close();}
