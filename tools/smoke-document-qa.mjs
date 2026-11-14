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
  await page.setContent('<p>The library closes at 3 PM.</p>');
  const scan = await page.evaluate(()=>{
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0,0,1100,220);
    ctx.fillStyle = 'black';
    ctx.font = '42px Arial';
    ctx.fillText('The swimming pool opens at 8 AM.',30,100);
    return canvas.toDataURL();
  });
  await page.setContent(`<p>The library closes at 3 PM.</p><div style="break-before:page"><img width="550" src="${scan}"></div>`);
  const pdf = await page.pdf();
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
  await page.getByRole('heading',{name:'資料QAの保管庫'}).waitFor();
  await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'資料チャット作成',exact:true}).count(),0);
  await page.locator('#upload input[name=title]').fill('自動公開確認');
  await page.locator('#upload input[type=file]').setInputFiles({name:'smoke.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.getByText('PDFの文字を確認しました。',{exact:true}).waitFor({timeout:120_000}).catch(async error=>{
    throw new Error('PDF preflight: '+await page.locator('#upload-status').textContent(),{cause:error});
  });
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value));
  const guide = await url.inputValue();
  try {
    assert.deepEqual(externalWrites,[]);
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    await page.locator('#question').fill('When does the library close?');
    await page.locator('#ask-form button').click();
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 1ページ'}).waitFor();
    assert.match(await page.locator('#messages').textContent(),/3\s*(?::00)?\s*PM/i);
    await page.locator('#question').fill('When does the swimming pool open?');
    await page.locator('#ask-form button').click();
    const citation = page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 2ページ'});
    await citation.click({timeout:60_000});
    await page.waitForFunction(()=>document.querySelector('#pdf-page')?.value==='2');
    assert.match(await page.locator('#messages .bubble').last().textContent(),/8\s*(?::00)?\s*AM/i);
    assert.deepEqual(externalWrites,[]);
  } finally {
    const removed = await page.evaluate(async documentUrl=>{
      const {config} = await import('./web/config.js');
      const app = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js');
      const firebase = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
      const auth = firebase.getAuth(app.initializeApp(config.firebase));
      await auth.authStateReady();
      const id = new URL(documentUrl).searchParams.get('id');
      const response = await fetch(config.api+'/documents/'+id+'/remove',{
        method:'POST',headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken()},
      });
      return response.status;
    },guide);
    assert.equal(removed,200);
  }
} finally {
  await browser.close();
}
