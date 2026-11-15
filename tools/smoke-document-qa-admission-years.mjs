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
    const clarification = page.waitForResponse(r=>r.url().endsWith('/ask')&&r.request().method()==='POST');
    await page.locator('#question').fill('青空高校の一般入試の基準は？');
    const started = performance.now();
    await page.locator('#ask-form button').click();
    const clarificationEvents=(await (await clarification).text()).trim().split('\n').map(JSON.parse);
    const clarificationItems=clarificationEvents.flatMap(event=>event.item?[event.item]:event.replaceItems??[]);
    assert.match(clarificationItems.map(item=>item.answer).join(' '),/令和8年度.*令和9年度.*どの年度/);
    assert.equal(clarificationItems.flatMap(item=>item.evidence??[]).length,0);
    await page.waitForFunction(()=>!document.querySelector('#ask-form button').disabled);
    const bubble = page.locator('#messages .bubble').last();
    await bubble.getByText(/令和8年度.*令和9年度.*どの年度/).waitFor();
    checks.push({kind:'clarification', elapsedMs:Math.round(performance.now()-started)});
    console.log('clarification matched');
    for(const [year,school,cell] of [[9,'青空','J2'],[8,'青空','J2']]){
      const response=page.waitForResponse(r=>r.url().endsWith('/ask')&&r.request().method()==='POST',{timeout:30000});
      await page.locator('#question').fill(year===9 ? 'R9' : '令和'+year+'年度の'+school+'の一般入試の基準は？');
      const started = performance.now();
      await page.locator('#ask-form button').click();
      const events=(await (await response).text()).trim().split('\n').map(JSON.parse);
      const cited=events.flatMap(event=>event.item?.evidence??[]).find(e=>e.quote.startsWith(cell+' '));
      assert.ok(cited,'Missing '+year+' '+school+' '+cell);
      assert.doesNotMatch(cited.quote,/ヒツヨウ$|バアイカ$/);
      const normalize = value => value.normalize('NFKC').replace(/\s+/g,'');
      const expectedPage = year - 7;
      assert.equal(cited.page,expectedPage);
      const candidates = sheets.filter(sheet => normalize(sheet.text.split('\n')[0]).includes('R'+year)).flatMap(sheet => sheet.text.split('\n').filter(line=>normalize(line).includes(school)).flatMap(line=>line.split(' | '))).filter(entry=>entry.startsWith(cell+' '));
      assert.equal(candidates.length,1,'Source row must resolve uniquely for '+year+' '+school);
      assert.ok(normalize(candidates[0]).includes(normalize(cited.quote)),'Quote mismatch for '+year+' '+school);
      const answers = events.flatMap(event=>event.item?[event.item]:event.replaceItems??[]).map(item=>normalize(item.answer));
      assert.deepEqual(answers,[normalize(candidates[0].slice(cell.length + 1))],'Answer differs from full source cell for '+year+' '+school);
      await page.locator('#messages .bubble').last().getByText(events.flatMap(event=>event.item?[event.item]:event.replaceItems??[])[0].answer,{exact:true}).waitFor();
      checks.push({kind:'answer', year, cell, page:cited.page, elapsedMs:Math.round(performance.now()-started)});
      console.log(year,school,cell,cited.page,'full answer matched');
      await page.waitForFunction(()=>!document.querySelector('#ask-form button').disabled);
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
