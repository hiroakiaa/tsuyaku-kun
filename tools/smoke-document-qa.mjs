import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const dense = process.argv.includes('--dense');
const long = dense || process.argv.includes('--long');
const gardenNotes = dense ? 'Planting beds are watered in the early morning. Seed packets are stored in labelled drawers. Volunteers record rainfall and rotate the crops. '.repeat(5) : '';
const padding = long ? Array.from({length:25},(_,i)=>
  '<p style="break-before:page">School garden notices and planting instructions. Section '+(i+1)+'. '+gardenNotes+'</p>').join('') : '';
const scanPage = long ? 28 : 3;
const scanCitation = '元のPDF '+scanPage+'ページ';
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
  await page.setContent(`<table style="width:600px;text-align:left"><tr><th rowspan="2">Facility</th><th colspan="2">Hours</th></tr><tr><th>Opening</th><th>Closing</th></tr></table><table style="break-before:page;width:600px"><tr><td>Library</td><td>9 AM</td><td>3 PM</td></tr><tr><td>Museum</td><td>10 AM</td><td>5 PM</td></tr></table>${padding}<div style="break-before:page"><img width="550" src="${scan}"></div>`);
  const pdf = await page.pdf();
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
  await page.getByRole('heading',{name:'資料QAの保管庫'}).waitFor();
  await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'資料チャット作成',exact:true}).count(),0);
  await page.locator('#upload input[name=title]').fill('自動公開確認');
  const preflightStarted = performance.now();
  await page.locator('#upload input[type=file]').setInputFiles({name:'smoke.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.getByText('PDFの文字を確認しました。',{exact:true}).waitFor({timeout:120_000}).catch(async error=>{
    throw new Error('PDF preflight: '+await page.locator('#upload-status').textContent(),{cause:error});
  });
  const preflightMs = Math.round(performance.now()-preflightStarted);
  const registrationStarted = performance.now();
  await page.locator('#upload button').click();
  const url = page.locator('#guide-url');
  await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value));
  const registrationMs = Math.round(performance.now()-registrationStarted);
  const guide = await url.inputValue();
  try {
    assert.deepEqual(externalWrites,[]);
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    await page.locator('#question').fill('When does the library close?');
    const libraryStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 2ページ'}).waitFor();
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 1ページ'}).waitFor();
    assert.match(await page.locator('#messages').textContent(),/3\s*(?::00)?\s*PM/i);
    await page.locator('#ask-form button:enabled').waitFor();
    const libraryMs = Math.round(performance.now()-libraryStarted);
    await page.locator('#question').fill('When does the swimming pool open?');
    const poolStarted = performance.now();
    await page.locator('#ask-form button').click();
    const citation = page.locator('#messages .answer-source').getByRole('link',{name:scanCitation});
    await citation.waitFor({timeout:60_000});
    await page.locator('#ask-form button:enabled').waitFor();
    const poolMs = Math.round(performance.now()-poolStarted);
    await citation.click();
    await page.waitForFunction(expected=>document.querySelector('#pdf-page')?.value===String(expected),scanPage);
    assert.match(await page.locator('#messages .bubble').last().textContent(),/8\s*(?::00)?\s*AM/i);
    await page.locator('#question').fill('When does the library close and when does the swimming pool open? Give both facts separately.');
    const combinedStarted = performance.now();
    await page.locator('#ask-form button').click();
    const combined = page.locator('#messages .bubble').last();
    const librarySource = combined.locator('.answer-item').filter({hasText:/3\s*(?::00)?\s*PM/i});
    const poolSource = combined.locator('.answer-item').filter({hasText:/8\s*(?::00)?\s*AM/i});
    await librarySource.getByRole('link',{name:'元のPDF 2ページ'}).waitFor();
    await librarySource.getByRole('link',{name:'元のPDF 1ページ'}).waitFor();
    await poolSource.getByRole('link',{name:scanCitation}).waitFor();
    await page.locator('#ask-form button:enabled').waitFor();
    const citationNames = async item => (await item.locator('.answer-source a').allTextContents())
      .map(label=>label.trim()).sort();
    assert.deepEqual(await citationNames(librarySource),['元のPDF 1ページ','元のPDF 2ページ']);
    const combinedMs = Math.round(performance.now()-combinedStarted);
    assert.deepEqual(await citationNames(poolSource),[scanCitation]);
    for (const [item,number] of [[librarySource,1],[librarySource,2],[poolSource,scanPage]]) {
      await item.getByRole('link',{name:'元のPDF '+number+'ページ',exact:true}).click();
      await page.waitForFunction(expected=>document.querySelector('#pdf-page')?.value===String(expected),number);
    }
    assert.deepEqual(externalWrites,[]);
    const combinedEvidence =await Promise.all([librarySource,poolSource].map(async item=>({
        answer:await item.locator('.answer-text').textContent(), citations:await citationNames(item),
      })));
    await page.locator('#question').fill('What is the annual parking permit fee?');
    await page.locator('#ask-form button').click();
    const unanswered = page.locator('#messages .bubble').last();
    await unanswered.getByText('この項目の根拠は資料内で確認できませんでした。',{exact:true}).waitFor({timeout:60_000});
    await page.locator('#ask-form button:enabled').waitFor();
    assert.equal(await unanswered.locator('.answer-source').count(),0);
    await page.locator('#question').fill('When does the library close, and what is the annual parking permit fee? Answer each separately.');
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const mixed = page.locator('#messages .bubble').last();
    const supported = mixed.locator('.answer-item').filter({hasText:/3\s*(?::00)?\s*PM/i});
    const unsupported = mixed.locator('.answer-item').filter({hasText:'この項目の根拠は資料内で確認できませんでした。'});
    assert.deepEqual(await citationNames(supported),['元のPDF 1ページ','元のPDF 2ページ']);
    assert.equal(await unsupported.count(),1);
    assert.deepEqual(await citationNames(unsupported),[]);
    await page.locator('#question').fill('図書館は何時に閉まりますか？ 年間駐車許可料はいくらですか？ 項目ごとに答えてください。');
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const translated = page.locator('#messages .bubble').last();
    const closing = translated.locator('.answer-item').filter({hasText:/午後\s*3\s*時|15:00/});
    const missingFee = translated.locator('.answer-item').filter({hasText:'この項目の根拠は資料内で確認できませんでした。'});
    assert.deepEqual(await citationNames(closing),['元のPDF 1ページ','元のPDF 2ページ']);
    assert.equal(await missingFee.count(),1);
    assert.deepEqual(await citationNames(missingFee),[]);
    const releaseUrl = new URL('./web/release-checks.json',guide);
    releaseUrl.searchParams.set('check',String(Date.now()));
    const releaseResponse = await page.request.get(releaseUrl.href);
    assert.ok(releaseResponse.ok(),'Published release metadata is unavailable');
    const {commit} = await releaseResponse.json();
    assert.match(commit,/^[0-9a-f]{40}$/);
    if (process.env.GITHUB_SHA) assert.equal(commit,process.env.GITHUB_SHA);
    const result = {
      commit,
      fixture:dense ? '28-page-dense-mixed-pdf' : long ? '28-page-mixed-pdf' : 'mixed-text-and-scan-pdf',preflightMs,registrationMs,libraryMs,poolMs,combinedMs,
      measuredAt:new Date().toISOString(), platform:process.platform,browserVersion:browser.version(),
      combinedEvidence,
    };
    console.log(JSON.stringify(result));
    if (process.env.DOCUMENT_QA_REPORT) await writeFile(process.env.DOCUMENT_QA_REPORT,JSON.stringify(result,null,2));
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
    assert.deepEqual(removed,{removeStatus:200,reopenStatus:404,pdfStatus:404});
  }
} finally {
  await browser.close();
}
