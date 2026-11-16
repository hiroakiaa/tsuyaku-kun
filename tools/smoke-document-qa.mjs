import {appendFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const atSizeLimit = process.argv.includes('--size-limit');
const dense = process.argv.includes('--dense');
const atPageLimit = process.argv.includes('--page-limit');
const long = atPageLimit || dense || process.argv.includes('--long');
const groupVisit = process.argv.includes('--long');
const gardenNotes = dense || groupVisit ? 'Planting beds are watered in the early morning. Seed packets are stored in labelled drawers. Volunteers record rainfall and rotate the crops. '.repeat(dense ? 5 : 2) : '';
const padding = long ? Array.from({length:atPageLimit ? 37 : 25},(_,i)=>
  '<p style="break-before:page">School garden notices and planting instructions. Section '+(i+1)+'. '+gardenNotes+(groupVisit && i===3 ? ' Group visits must be booked at least 14 days before the visit.' : groupVisit && i===18 ? ' Group visit cancellations must be received at least 3 days before the visit.' : '')+'</p>').join('') : '';
const scanPage = atPageLimit ? 40 : long ? 28 : 3;
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
  let pdf = await page.pdf();
  if (atSizeLimit) {
    // Preserve PDF offsets and keep the end-of-file marker at the end.
    const marker = pdf.lastIndexOf(Buffer.from('%%EOF'));
    assert.ok(marker > 0);
    pdf = Buffer.concat([pdf.subarray(0,marker),Buffer.alloc(5_000_000-pdf.length,10),pdf.subarray(marker)]);
    assert.equal(pdf.length,5_000_000);
  }
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
  let result;
  try {
    assert.deepEqual(externalWrites,[]);
    await page.goto(guide);
    await page.locator('#tab-ask').click();
    await page.waitForFunction(expected=>document.querySelectorAll('#pdf-page option').length===expected,scanPage);
    const pageCount = await page.locator('#pdf-page option').count();
    await page.locator('#question').fill('When does the library close?');
    const libraryStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 2ページ'}).waitFor();
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 1ページ'}).waitFor();
    assert.match(await page.locator('#messages').textContent(),/3\s*(?::00)?\s*PM/i);
    await page.locator('#ask-form button:enabled').waitFor();
    const libraryMs = Math.round(performance.now()-libraryStarted);
    const answerTimings=async()=>{
      const raw=await page.locator('#messages').getAttribute('data-answer-timings');
      assert.ok(raw,'Answer processing did not record its timings');
      const values=JSON.parse(raw);
      assert.ok(Number.isInteger(values.finished) && values.finished>=0);
      for (const ms of Object.values(values)) assert.ok(Number.isInteger(ms) && ms>=0 && ms<=values.finished);
      return values;
    };
    const libraryStages=await answerTimings();
    assert.ok(Number.isInteger(libraryStages['first-grounded-answer']));
    await page.locator('#messages .answer-source').getByRole('link',{name:'元のPDF 2ページ'}).click();
    const waitForOriginalMarker = () => page.waitForFunction(()=>[...document.querySelectorAll('[data-page="2"] .pdf-citation-visible')].some(mark=>{
      const fill=getComputedStyle(mark,'::after');
      return mark.getBoundingClientRect().width>0 && fill.backgroundColor==='rgb(245, 217, 117)' &&
        fill.transform==='matrix(1, 0, 0, 1, 0, 0)';
    }),null,{timeout:15_000});
    await waitForOriginalMarker();
    let originalMarkerAfterTranslation = null;
    if (!long && !dense && !atPageLimit && !atSizeLimit) {
      const language=page.locator('select.document-language:visible');
      await language.selectOption('en');
      const toggle=page.locator('#pdf-language-toggle');
      await toggle.locator('[data-language="en"]').click();
      await page.locator('.pdf-translation-layout[data-page="2"] .pdf-layout-line').first().waitFor({timeout:65_000});
      assert.equal(await page.locator('#pdf-page').inputValue(),'2');
      await toggle.locator('[data-language=""]').click();
      await page.locator('#pdf-translation').waitFor({state:'hidden'});
      assert.equal(await page.locator('#pdf-page').inputValue(),'2');
      await waitForOriginalMarker();
      originalMarkerAfterTranslation = true;
      await language.selectOption('ja');
    }
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
    for (const item of [librarySource,poolSource]) {
      for (const disclosure of await item.locator('.answer-quote').all()) {
        const quote = disclosure.locator('blockquote').first();
        await quote.waitFor({state:'hidden'});
        await disclosure.locator('summary').click();
        await quote.waitFor({state:'visible'});
        await disclosure.locator('summary').click();
        await quote.waitFor({state:'hidden'});
      }
    }
    const combinedEvidence = await Promise.all([librarySource,poolSource].map(async item=>({
      answer:await item.locator('.answer-text').textContent(),
      sources:await item.locator('.answer-source').evaluateAll(entries=>entries.map(entry=>({
        citation:entry.querySelector('a').textContent.trim(),
        quotes:[...entry.querySelectorAll('blockquote')].map(quote=>quote.textContent),
      }))),
    })));
    const quotesAt = (item,number)=>item.sources.find(source=>source.citation==='元のPDF '+number+'ページ')?.quotes.join(' ') ?? '';
    assert.match(quotesAt(combinedEvidence[0],1),/Closing/i);
    assert.match(quotesAt(combinedEvidence[0],2),/Library[\s\S]*3\s*(?::00)?\s*PM/i);
    assert.match(quotesAt(combinedEvidence[1],scanPage),/swimming pool[\s\S]*8\s*(?::00)?\s*AM/i);
    await page.reload();
    await page.locator('#tab-ask').click();
    assert.deepEqual(await citationNames(librarySource),['元のPDF 1ページ','元のPDF 2ページ']);
    assert.deepEqual(await citationNames(poolSource),[scanCitation]);
    const missingQuestion = 'What is the annual parking permit fee?';
    await page.locator('#question').fill(missingQuestion);
    const missingStarted = performance.now();
    await page.locator('#ask-form button').click();
    const unanswered = page.locator('#messages .bubble').last();
    await unanswered.getByText('この項目の根拠は資料内で確認できませんでした。',{exact:true}).waitFor({timeout:60_000});
    await page.locator('#ask-form button:enabled').waitFor();
    const missingMs = Math.round(performance.now()-missingStarted);
    assert.equal(await unanswered.locator('.answer-source').count(),0);
    const missingStages=await answerTimings();
    assert.equal(missingStages['first-grounded-answer'],undefined);
    const missingEvidence = {
      question:missingQuestion, answer:await unanswered.locator('.answer-text').textContent(),
      sources:await citationNames(unanswered), elapsedMs:missingMs,
    };
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
    let groupVisitEvidence;
    if (groupVisit) {
      await page.locator('#question').fill('For group visits, how many days in advance must I book and cancel? Answer each separately.');
      const started = performance.now();
      await page.locator('#ask-form button').click();
      await page.locator('#ask-form button:enabled').waitFor();
      const answer = page.locator('#messages .bubble').last();
      for (const [days, number, quote] of [[14,6,/booked at least 14 days/i],[3,21,/cancellations must be received at least 3 days/i]]) {
        const item = answer.locator('.answer-item').filter({has:page.locator('.answer-text').filter({hasText:new RegExp('\\b'+days+'\\s+days','i')})});
        assert.equal(await item.count(),1);
        assert.deepEqual(await citationNames(item),['元のPDF '+number+'ページ']);
        assert.match(await item.locator('blockquote').textContent(),quote);
      }
      groupVisitEvidence = {pages:[6,21],elapsedMs:Math.round(performance.now()-started)};
      if (process.argv.includes('--compare-search')) {
        groupVisitEvidence.comparison = await page.evaluate(async () => {
          const {config} = await import('./web/config.js');
          const {getApp} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js');
          const {getAuth} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
          const auth = getAuth(getApp());
          await auth.authStateReady();
          const token = await auth.currentUser.getIdToken();
          const id = new URL(location.href).searchParams.get('id');
          const results = [];
          for (const mode of ['full','search']) {
            const response = await fetch(config.api+'/documents/'+id+'/ask',{
              method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
              body:JSON.stringify({question:'For group visits, how many days in advance must I book and cancel? Answer each separately.',benchmarkMode:mode}),
            });
            if (!response.ok) throw Error('Group visit comparison returned '+response.status);
            const {candidatePages,items,usage,timing} = await response.json();
            results.push({mode,candidatePages,items,usage,timing});
          }
          return results;
        });
        const ratesUSDPerMillion = {input:0.4,cachedInput:0.1,output:1.6};
        groupVisitEvidence.ratesUSDPerMillion = ratesUSDPerMillion;
        for (const measurement of groupVisitEvidence.comparison) {
          const {usage} = measurement;
          const input = usage?.prompt_tokens;
          const cached = usage?.prompt_tokens_details?.cached_tokens;
          const output = usage?.completion_tokens;
          measurement.estimatedGenerationUSD = [input,cached,output].every(Number.isFinite)
            ? ((input-cached)*ratesUSDPerMillion.input+cached*ratesUSDPerMillion.cachedInput+output*ratesUSDPerMillion.output)/1e6
            : null;
        }
        for (const {mode,candidatePages,items} of groupVisitEvidence.comparison) {
          assert.ok([6,21].every(number=>candidatePages.includes(number)),mode+' omitted a required page');
          if (mode==='search') assert.ok(candidatePages.length<pageCount,'Search did not narrow the candidates');
          assert.deepEqual(items.flatMap(item=>item.evidence.map(source=>source.page)).sort((a,b)=>a-b),[6,21],mode);
          for (const [number, days] of [[6,14],[21,3]]) {
            const item = items.find(item=>item.evidence.some(source=>source.page===number));
            assert.match(item.answer,new RegExp('\\b'+days+'\\s+days','i'),mode+' page '+number);
          }
        }
      }
    }
    const releaseUrl = new URL('./web/release-checks.json',guide);
    releaseUrl.searchParams.set('check',String(Date.now()));
    const releaseResponse = await page.request.get(releaseUrl.href);
    assert.ok(releaseResponse.ok(),'Published release metadata is unavailable');
    const {commit} = await releaseResponse.json();
    assert.match(commit,/^[0-9a-f]{40}$/);
    if (process.env.GITHUB_SHA) assert.equal(commit,process.env.GITHUB_SHA);
    result = {
      commit,pageCount,fileBytes:pdf.length,
      fixture:atPageLimit ? '40-page-mixed-pdf' : dense ? '28-page-dense-mixed-pdf' : long ? '28-page-mixed-pdf' : 'mixed-text-and-scan-pdf',preflightMs,registrationMs,libraryMs,poolMs,combinedMs,
      measuredAt:new Date().toISOString(), platform:process.platform,browserVersion:browser.version(),
      combinedEvidence,missingEvidence,groupVisitEvidence,
      answerStages:{library:libraryStages,missingEvidence:missingStages},
      originalMarkerAfterTranslation,
    };
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
  console.log(JSON.stringify(result));
  if (process.env.DOCUMENT_QA_REPORT) await writeFile(process.env.DOCUMENT_QA_REPORT,JSON.stringify(result,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const comparison = result.groupVisitEvidence?.comparison;
    if (comparison) {
      const rows = comparison.map(({mode,candidatePages,usage,timing,estimatedGenerationUSD}) =>
        '| '+[mode,candidatePages.length,usage?.prompt_tokens ?? '—',
          usage?.prompt_tokens_details?.cached_tokens ?? '—',
          timing?.retrievalMs ?? '—',timing?.generationMs ?? '—',
          estimatedGenerationUSD?.toFixed(7) ?? '—'].join(' | ')+' |');
      const comparisonTable = [
        '', '### 団体見学の回答比較', '',
        '| 方式 | 候補ページ数 | 入力トークン | キャッシュ済み | 検索 ms | 生成 ms | 推定生成費 USD |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...rows,'',
      ].join('\n');
      await appendFile(process.env.GITHUB_STEP_SUMMARY,comparisonTable);
      if (process.env.DOCUMENT_QA_REPORT) {
        await writeFile(process.env.DOCUMENT_QA_REPORT.replace(/\.json$/,'-comparison.md'),comparisonTable);
      }
    }
    await appendFile(process.env.GITHUB_STEP_SUMMARY,[
      '',
      '### PDF: '+result.fixture,
      '',
      result.pageCount+' pages, '+result.fileBytes+' bytes. Test document deletion verified.',
      '',
      '| Preflight | Registration | Library | Pool | Combined | No evidence |',
      '| ---: | ---: | ---: | ---: | ---: | ---: |',
      '| '+[result.preflightMs,result.registrationMs,result.libraryMs,result.poolMs,result.combinedMs,result.missingEvidence.elapsedMs].map(ms=>ms+' ms').join(' | ')+' |',
      '',
    ].join('\n'));
  }
} finally {
  await browser.close();
}
