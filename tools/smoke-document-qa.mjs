import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<p>The library closes at 3 PM.</p>');
  const pdf = await page.pdf();
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
  await page.getByRole('heading',{name:'資料QAの保管庫'}).waitFor();
  await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'資料チャット作成',exact:true}).count(),0);
  await page.locator('#upload input[name=title]').fill('自動公開確認');
  await page.locator('#upload input[type=file]').setInputFiles({name:'smoke.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.getByText('PDFの文字を確認しました。',{exact:true}).waitFor();
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value));
  const guide = await url.inputValue();
  try {
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    await page.locator('#question').fill('When does the library close?');
    await page.locator('#ask-form button').click();
    await page.locator('#messages .answer-source').first().waitFor();
    assert.match(await page.locator('#messages').textContent(),/3\s*(?::00)?\s*PM/i);
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
