import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const [wav,base='https://hiroakiaa.github.io/tsuyaku-kun/']=process.argv.slice(2);
assert.ok(wav,'Supply a Japanese speech WAV');
const sample=(await readFile(wav)).toString('base64');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(let repeat=0;repeat<3;repeat++){
  const modes=(process.env.TSUYAKU_BENCH_MODES||'normal,speed,live').split(',');
  const offset=repeat%modes.length;
  for(const mode of [...modes.slice(offset),...modes.slice(0,offset)]){
   const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],serviceWorkers:'block'});
   try {
    await context.route('**/school-usage',route=>route.abort());
    await context.addInitScript(wav=>{
     const reads=[];
     window.testReads=reads;
     new MutationObserver(()=>{
      const lines=[...document.querySelectorAll('#captions .caption-line-primary p, #captions .caption-line-translation p')];
      const text=lines.filter(p=>p.lang==='en'||p.closest('[data-language="en"]')).map(p=>p.textContent.trim()).filter(Boolean).join(' ');
      if(text&&text!==reads.at(-1)?.text)reads.push({time:performance.now(),text});
     }).observe(document,{subtree:true,childList:true,characterData:true});
     navigator.mediaDevices.getUserMedia=async()=>{
      const audio=new AudioContext();
      await audio.resume();
      const buffer=await audio.decodeAudioData(Uint8Array.from(atob(wav),c=>c.charCodeAt(0)).buffer);
      const pcm=buffer.getChannelData(0);
      let first=-1,last=-1;
      for(let i=0;i<pcm.length;i++){
       if(Math.abs(pcm[i])<0.01)continue;
       if(first<0)first=i;
       last=i;
      }
      if(first<0)throw Error('No speech signal in WAV');
      const source=audio.createBufferSource(),microphone=audio.createMediaStreamDestination();
      source.buffer=buffer;
      source.connect(microphone);
      window.playSpeech=()=>{
       const now=performance.now();
       window.speechTimes=[now+first/buffer.sampleRate*1000,now+last/buffer.sampleRate*1000];
       source.start();
      };
      return microphone.stream;
     };
    },sample);
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const paths=new Set();
    page.on('request',request=>paths.add(new URL(request.url()).pathname));
    page.on('websocket',socket=>paths.add(new URL(socket.url()).pathname));
    await page.goto(base);
    await page.locator('#microphone:not([disabled])').waitFor();
    await page.evaluate(()=>{
     for(const [id,language] of [['face-self-language','ja'],['face-other-language','en']]){
      const input=document.getElementById(id);
      input.value=language;
      input.dispatchEvent(new Event('change',{bubbles:true}));
     }
    });
    const pin=process.env.TSUYAKU_TEST_ADMIN_PIN||'1111';
    if(mode==='speed'||mode==='live'){
     await page.locator('#admin').click();
     await page.locator('#modal input[type=password]').fill(pin);
     await page.locator('#modal button[type=submit]').click();
     await page.locator('#modal').getByRole('tab',{name:'設定・説明'}).click();
    }
    if(mode==='speed'){
     await page.locator('#face-auto-language').check();
     await page.locator('#recognition-speed').click();
     await page.locator('#speed-password').fill(pin);
     await page.getByRole('button',{name:'速度モードにする',exact:true}).click();
    }
    if(mode==='live'){
     await page.locator('#modal').getByLabel('GPT Live翻訳（試験）',{exact:true}).check();
     await page.locator('#modal-close').click();
    }
    await page.locator('#microphone').click();
    await page.waitForFunction(()=>typeof window.playSpeech==='function');
    await page.waitForTimeout(2600);
    await page.evaluate(()=>window.playSpeech());
    await page.waitForFunction(()=>window.testReads.length>0,undefined,{timeout:14000}).catch(()=>{});
    await page.waitForFunction(()=>window.testReads.some(({text})=>
     /\buntil\b.*3:15\s*p\.?\s*m/i.test(text)),undefined,{timeout:6500}).catch(()=>{});
    await page.waitForTimeout(650);
    const result=await page.evaluate(()=>({times:window.speechTimes,reads:window.testReads}));
    console.log(JSON.stringify({mode,repeat,paths:[...paths].filter(p=>/^\/(?:transcribe(?:-stream)?|translate|live-translation)$/.test(p)),...result}));
   }catch(error){console.log(JSON.stringify({mode,repeat,error:error.message.split('\n').slice(0,4).join(' ')}));}
   finally{await context.close();}
  }
 }
}finally{await browser.close();}
