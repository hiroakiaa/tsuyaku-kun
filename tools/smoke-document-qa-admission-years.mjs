import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const checks = [];
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
  await page.locator('#upload input[type=file]').setInputFiles(fileURLToPath(new URL('../tests/fixtures/document-qa-admission-years.xlsx',import.meta.url)));
  const sheets=await page.evaluate(async()=>{
    const {officePages}=await import('./web/document-office.js');
    return officePages(document.querySelector('#upload input[type=file]').files[0],{includeMerges:true});
  });
  assert.equal(sheets.length,2);
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value),null,{timeout:120000}).catch(async e=>{throw Error(await page.locator('#upload-status').textContent(),{cause:e});});
  const guide = await url.inputValue();
  try {
    assert.deepEqual(externalWrites,[]);
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    const answers = page.locator('#messages .bubble:not(.user)');
    async function ask(question) {
      const index = await answers.count();
      await page.locator('#question').fill(question);
      const started = performance.now();
      await page.locator('#ask-form button').click();
      const bubble = answers.nth(index);
      await bubble.locator('.answer-text').waitFor();
      await page.locator('#ask-form button:enabled').waitFor();
      return {bubble, elapsedMs:Math.round(performance.now()-started)};
    }

    const clarification = await ask('青空高校の一般入試の基準は？');
    assert.match(await clarification.bubble.locator('.answer-text').textContent(),/令和8年度.*令和9年度.*どの年度/);
    assert.equal(await clarification.bubble.locator('.answer-source').count(),0);
    checks.push({kind:'clarification',elapsedMs:clarification.elapsedMs});
    console.log('clarification matched');
    for (const year of [9,8]) {
      const school = '青空';
      const cell = 'J2';
      const expectedPage = year - 7;
      const normalize = value => value.normalize('NFKC').replace(/\s+/g,'');
      const candidates = sheets.filter(sheet => normalize(sheet.text.split('\n')[0]).includes('R'+year)).flatMap(sheet => sheet.text.split('\n').filter(line=>normalize(line).includes(school)).flatMap(line=>line.split(' | '))).filter(entry=>entry.startsWith(cell+' '));
      assert.equal(candidates.length,1,'Source row must resolve uniquely for '+year+' '+school);
      const {bubble,elapsedMs} = await ask(year===9 ? 'R9' : '令和'+year+'年度の'+school+'の一般入試の基準は？');
      const displayed = (await bubble.locator('.answer-text').allTextContents()).map(normalize);
      assert.deepEqual(displayed,[normalize(candidates[0].slice(cell.length + 1))]);
      const sources = bubble.locator('.answer-source');
      assert.deepEqual(await sources.locator('a').allTextContents(),['元のPDF '+expectedPage+'ページ']);
      const quotes = await sources.locator('blockquote').allTextContents();
      assert.ok(quotes.some(quote=>normalize(quote)===normalize(candidates[0])),'Missing full quote for '+year+' '+school+' '+cell);
      await sources.getByRole('link',{name:'元のPDF '+expectedPage+'ページ',exact:true}).click();
      await page.waitForFunction(expected =>
        document.querySelector('#pdf-page')?.value===String(expected),expectedPage);
      checks.push({kind:'answer',year,cell,page:expectedPage,elapsedMs,citationNavigation:true});
      console.log(year,school,cell,expectedPage,'full answer matched');
    }
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
  if (process.env.DOCUMENT_QA_REPORT) {
    await writeFile(process.env.DOCUMENT_QA_REPORT, JSON.stringify({checks, browserVersion:browser.version()}, null, 2));
  }
} finally {
  await browser.close();
}
