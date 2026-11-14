import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const format = process.argv[2] ?? 'png';
if (!['png','jpeg','webp'].includes(format)) throw new Error('Expected png, jpeg or webp');
const language = process.argv[3] ?? 'en';
if (!['en','ja'].includes(language)) throw new Error('Expected en or ja');
const japanese = language==='ja';
const mimeType = 'image/'+format;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const externalWrites = [];
  page.on('request',request=>{
    const url = new URL(request.url());
    const body = request.postDataBuffer();
    if (!body?.length) return;
    if (url.hostname==='cdn.jsdelivr.net') externalWrites.push('OCR asset host');
    if (url.pathname.endsWith('/ask') && /data:image\//i.test(body.toString())) externalWrites.push('page image in question request');
  });
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
  await page.getByRole('heading',{name:'資料QAの保管庫'}).waitFor();
  await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'資料チャット作成',exact:true}).count(),0);
  await page.locator('#upload input[name=title]').fill('自動公開確認');
  const image = await page.evaluate(({type,label})=>{
    const canvas=document.createElement('canvas');
    canvas.width=1000;
    canvas.height=300;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';
    ctx.fillRect(0,0,1000,300);
    ctx.fillStyle='black';
    ctx.font='42px Arial';
    ctx.fillText(label,40,140);
    const fetchOriginal=window.fetch;
    window.fetch=function(input,init) {
      if (init?.body instanceof FormData && new URL(input,location.href).pathname.endsWith('/documents')) {
        window.qaUpload={
          files:[...init.body.values()].filter(value=>value instanceof File).map(file=>file.type),
          originalImage:init.body.has('ocrImage'),
          pages:init.body.get('pages'),
        };
      }
      return fetchOriginal.apply(this,arguments);
    };
    return canvas.toDataURL(type);
  },{type:mimeType,label:japanese ? '青組の開始時刻は14:00です。' : 'The Blue group starts at 14:00.'});
  assert.ok(image.startsWith('data:'+mimeType+';base64,'));
  await page.locator('#upload input[type=file]').setInputFiles({name:'fixture.'+format,mimeType,buffer:Buffer.from(image.split(',')[1],'base64')});
  const registrationStarted = performance.now();
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value),null,{timeout:120000}).catch(async e=>{throw Error(await page.locator('#upload-status').textContent(),{cause:e});});
  const registrationMs = Math.round(performance.now()-registrationStarted);
  const guide = await url.inputValue();
  try {
    const upload=await page.evaluate(()=>window.qaUpload);
    assert.deepEqual(upload.files,['application/pdf']);
    assert.equal(upload.originalImage,false);
    assert.match(upload.pages,japanese ? /14\s*[:：]\s*00/ : /Blue group starts at 14:00/i);
    assert.deepEqual(externalWrites,[]);
    const viewer = await browser.newPage();
    try {
      await viewer.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
      const access = await viewer.evaluate(async documentUrl=>{
        const {config} = await import('./web/config.js');
        const {initializeApp} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js');
        const {getAuth,signInAnonymously} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
        const auth = getAuth(initializeApp(config.firebase));
        await auth.authStateReady();
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
        const id = new URL(documentUrl).searchParams.get('id');
        const headers = {Authorization:'Bearer '+await user.getIdToken()};
        return Promise.all(['','/pdf'].map(async suffix=>{
          const response = await fetch(config.api+'/documents/'+id+suffix,{headers,cache:'no-store'});
          return response.status;
        }));
      },guide);
      assert.deepEqual(access,[404,404]);
    } finally {
      await viewer.close();
    }
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    assert.equal(await page.locator('#pdf-page option').count(),1);
    await page.locator('#question').fill(japanese ? '青組の開始時刻は？' : 'What is the start time for the Blue group?');
    const questionStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const answerMs = Math.round(performance.now()-questionStarted);
    const bubble=page.locator('#messages .bubble').last();
    assert.match(await bubble.locator('.answer-text').textContent(),japanese ? /14:00|午後\s*2\s*時/ : /14:00|2\s*(?::00)?\s*p\.?m\.?/i);
    assert.deepEqual(await bubble.locator('.answer-source a').allTextContents(),['元のPDF 1ページ']);
    assert.match(await bubble.locator('.answer-quote').textContent(),japanese ? /14\s*[:：]\s*00/ : /Blue group[\s\S]*14:00/);
    if (process.argv.includes('--append')) {
      const extra = await page.evaluate(()=>{
        const canvas=document.createElement('canvas');
        canvas.width=1000;
        canvas.height=240;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='white';
        ctx.fillRect(0,0,1000,240);
        ctx.fillStyle='black';
        ctx.font='42px Arial';
        ctx.fillText('The Green group starts at 16:30.',40,130);
        return canvas.toDataURL('image/png');
      });
      await page.locator('#ask .open-material').click();
      await page.locator('#add-material input[type=file]').setInputFiles({
        name:'green-schedule.png',mimeType:'image/png',buffer:Buffer.from(extra.split(',')[1],'base64'),
      });
      await page.evaluate(()=>{
        const send=window.fetch;
        window.fetch=function(url,options){
          if (options?.body instanceof FormData && new URL(url,location.href).pathname.endsWith('/material')) {
            const file=options.body.get('file');
            window.qaMaterial={name:file.name,type:file.type,pages:options.body.get('pages')};
          }
          return send.apply(this,arguments);
        };
      });
      await page.locator('#add-material button').click();
      await page.getByText('追加しました。質問に使用できます。').waitFor();
      const attachment=await page.evaluate(()=>window.qaMaterial);
      assert.equal(attachment.name,'green-schedule.pdf');
      assert.equal(attachment.type,'application/pdf');
      assert.match(attachment.pages,/Green group starts at 16:30/i);
      await page.keyboard.press('Escape');
      await page.locator('#question').fill('What is the start time for the Green group?');
      await page.locator('#ask-form button').click();
      await page.locator('#ask-form button:enabled').waitFor();
      assert.match(await bubble.locator('.answer-text').textContent(),/16:30|4:30\s*p\.?m\.?/i);
      assert.match(await bubble.locator('.answer-source').textContent(),/green-schedule\.pdf\s*·\s*1/);
      assert.match(await bubble.locator('.answer-quote').textContent(),/Green group[\s\S]*16:30/i);
      assert.deepEqual(externalWrites,[]);
    }
    console.log(JSON.stringify({fixture:format+'-browser-ocr',language,registrationMs,answerMs}));
  } finally {
    const removed = await page.evaluate(async documentUrl=>{
      const {config} = await import('./web/config.js');
      const app = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js');
      const firebase = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
      const auth = firebase.getAuth(app.initializeApp(config.firebase));
      await auth.authStateReady();
      const id = new URL(documentUrl).searchParams.get('id');
      const endpoint = config.api+'/documents/'+id;
      const headers = {Authorization:'Bearer '+await auth.currentUser.getIdToken()};
      const response = await fetch(endpoint+'/remove',{
        method:'POST',headers,
      });
      const reopened = await fetch(endpoint,{headers,cache:'no-store'});
      const pdf = await fetch(endpoint+'/pdf',{headers,cache:'no-store'});
      return {removeStatus:response.status,reopenStatus:reopened.status,pdfStatus:pdf.status};
    },guide);
    assert.deepEqual(removed,{removeStatus:200,reopenStatus:404,pdfStatus:404}); console.log('cleanup confirmed');
  }
} finally {
  await browser.close();
}
