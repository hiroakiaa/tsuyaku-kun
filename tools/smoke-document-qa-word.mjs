import {readFile,appendFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

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
  await page.locator('#upload input[type=file]').setInputFiles({name:'page-break.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await readFile(new URL('../tests/fixtures/document-qa-page-break.docx',import.meta.url))});
  const sheets=await page.evaluate(async()=>{
    const {officePages}=await import('./web/document-office.js');
    return officePages(document.querySelector('#upload input[type=file]').files[0],{includeMerges:true});
  });
  assert.match(sheets[0], /Blue group.*14:00/);
  const registrationStarted = performance.now();
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value),null,{timeout:120000}).catch(async e=>{throw Error(await page.locator('#upload-status').textContent(),{cause:e});});
  const registrationMs = Math.round(performance.now()-registrationStarted);
  const guide = await url.inputValue();
  try {
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
    assert.equal(await page.locator('#pdf-page option').count(),2);
    await page.locator('#question').fill('What is the start time for the Blue group?');
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const bubble=page.locator('#messages .bubble').last();
    assert.match(await bubble.locator('.answer-text').textContent(),/14:00|2\s*(?::00)?\s*p\.?m\.?/i);
    assert.deepEqual(await bubble.locator('.answer-source a').allTextContents(),['元のPDF 2ページ']);
    assert.match(await bubble.locator('.answer-quote').textContent(),/Blue group[\s\S]*14:00/);
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
