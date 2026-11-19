import assert from 'node:assert/strict';
import {createUiFixture} from './browser-fixture.mjs';
const fixture=await createUiFixture(),{browser,setup,origin}=fixture,calls=new Map();
const blocks=['A','B','C'].map((letter,i)=>({id:'b'+i,text:letter.repeat(200),box:{x:.05,y:.1+i*.25,width:.8,height:.18}}));
fixture.setApiHandler(request=>{
 const path=new URL(request.url()).pathname;
 if(path==='/photo/recognize')return {json:{text:blocks.map(b=>b.text).join('\n'),blocks}};
 if(path==='/photo/translate'){
  const body=request.postDataJSON(),text=body.blocks[0].text;calls.set(text,(calls.get(text)||0)+1);
  if(text.startsWith('B')&&((process.env.PHOTO_SERVICE_FAILURE&&text.length>130)||(!process.env.PHOTO_SERVICE_FAILURE&&calls.get(text)===1)))return {status:process.env.PHOTO_SERVICE_FAILURE?502:504,json:{error:process.env.PHOTO_SERVICE_FAILURE?'AIサービスが処理できませんでした。':'翻訳が時間切れになりました。',aiFailure:{reason:'service'}}};
  return {json:{blocks:body.blocks.map(b=>({id:b.id,translations:{[body.targets[0]]:'Translated '+b.text}}))}};
 }
});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await setup(context);if(process.env.PHOTO_SERVICE_FAILURE)await context.addInitScript(()=>{window.__photoSpoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{constructor(text){this.text=text;}}});Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'pt-BR',name:'Portuguese',localService:true}],cancel(){},pause(){},resume(){},speak(u){window.__photoSpoken.push(u.text);queueMicrotask(()=>u.onstart?.());}}});});if(process.env.LIVE_PHOTO_PREVIEW)await context.route('https://hiroakiaa.github.io/**',route=>route.continue());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIVE_PHOTO_PREVIEW?'https://hiroakiaa.github.io/tsuyaku-kun/?resume-check='+Date.now():origin);
 await page.locator('#photo-translate-open').click();
 const sample=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=1200;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,800,1200);return c.toDataURL('image/jpeg').split(',')[1]});
 await page.locator('.photo-simple input[type=file]').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(sample,'base64')});
 await page.locator('.photo-source-viewport').waitFor({state:'visible'});
 await page.locator('.photo-translate-run').click();
 // Another completed group can update the progress label during the retry delay.
 await page.waitForFunction(()=>document.querySelector('.photo-simple')?.getAttribute('aria-busy')==='true'||document.querySelector('.photo-results')?.textContent?.includes('Translated'));
 if(process.env.PHOTO_SERVICE_FAILURE){await page.waitForFunction(()=>document.querySelector('.photo-results')?.textContent.includes('Translated'));await page.locator('.photo-preview-close').click();await page.locator('.photo-text-details summary').click();const play=page.locator('#photo-text-panel-translated [data-play]');assert.equal(await play.isEnabled(),true,'Available partial translation can be played');await play.click();await page.waitForFunction(()=>window.__photoSpoken.length>0);await page.locator('#photo-text-panel-translated [data-stop]').click();}
 await page.waitForFunction(()=>document.querySelector('.photo-simple')?.getAttribute('aria-busy')==='false');
 assert.equal(calls.get('A'.repeat(200)),1);assert.equal(calls.get('B'.repeat(200)),process.env.PHOTO_SERVICE_FAILURE?3:2);assert.equal(calls.get('C'.repeat(200)),1);
 assert.ok((await page.locator('.photo-results').textContent()).includes('C'.repeat(200)));assert.ok((await page.locator('.photo-results').textContent()).includes('B'.repeat(process.env.PHOTO_SERVICE_FAILURE?100:200)));if(process.env.PHOTO_SERVICE_FAILURE)assert.equal(calls.get('B'.repeat(100)),1);assert.equal((await page.locator('.photo-notice').textContent()).includes('AIサービスが処理できませんでした'),false);
 assert.equal(await page.locator('.photo-overlay').isVisible(),true);assert.equal(await page.locator('.photo-preview-dialog').getAttribute('open'),process.env.PHOTO_SERVICE_FAILURE?null:'');assert.equal(await page.locator('.photo-preview-loading').isVisible(),false);assert.deepEqual(errors,[]);
 console.log((process.env.LIVE_PHOTO_PREVIEW?'Published assets':'Local fixture')+': PASS automatic continuation after timeout; no user retry; finished A/C not translated again; image preview remains');
 await context.close();
}finally{await browser.close();}
