import {readFile,appendFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const inventory = process.argv.includes('--inventory');
const zero = process.argv.includes('--zero');
const merged = zero || process.argv.includes('--merged');
const wide = process.argv.includes('--wide');
const fixture = inventory ? 'document-qa-inventory.xlsx' : wide ? 'document-qa-wide.xlsx' : zero ? 'document-qa-zero.xlsx' : merged ? 'document-qa-merged.xlsx' : 'document-qa-tables.xlsx';
const expectedR9Fee = zero ? '0' : merged ? '900円' : '450円';
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
  await page.locator('#upload input[type=file]').setInputFiles({name:'document-qa-tables.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await readFile(new URL('../tests/fixtures/'+fixture,import.meta.url))});
  const sheets=await page.evaluate(async()=>{
    const {officePages}=await import('./web/document-office.js');
    return officePages(document.querySelector('#upload input[type=file]').files[0],{includeMerges:true});
  });
  assert.equal(sheets.length,inventory ? 1 : 4);
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
    assert.equal(await page.locator('#pdf-page option').count(),sheets.length);
    if (inventory) {
      for (const [slot, branch, expected, cell] of [
        ['午前','分館','2台','D3'],
        ['午前','本館','該当セルは空欄です。',null],
        ['午後','本館','3台','C4'],
        ['午後','分館','6台','D4'],
      ]) {
        await page.locator('#question').fill('プロジェクターの'+slot+'の'+branch+'の在庫は？');
        await page.locator('#ask-form button').click();
        const answer = page.locator('#messages .bubble').last();
        await answer.getByText(expected,{exact:true}).waitFor({timeout:30000});
        await page.locator('#ask-form button:enabled').waitFor();
        if (!cell) {
          assert.equal(await answer.locator('.answer-source').count(),0);
          console.log('Blank inventory cell matched without citations');
          continue;
        }
        const addresses = (await answer.locator('.answer-source > div').allTextContents()).flatMap(line=>line.split('、'));
        const expectedCells = ['A3', slot === '午前' ? 'B3' : 'B4', 'C1', branch === '本館' ? 'C2' : 'D2', cell];
        assert.deepEqual(addresses.sort(), expectedCells.sort().map(address=>'貸出備品表 · '+address));
        assert.deepEqual(await answer.locator('.answer-source a').allTextContents(),['元のPDF 1ページ']);
        console.log('Inventory answer and citation matched:',expected,cell,1);
      }
    } else {
    const measurements=[];
    const questions = [
      ['令和9年度の青空高校の特進の入試定員は？','20','R9入試表 · C4'],
      ['令和9年度の会議室の子どもの休日料金は？',expectedR9Fee,wide ? 'R9料金表 · AA4' : merged ? 'R9料金表 · D3' : 'R9料金表 · D4'],
      ['説明会の午後組の開始時刻は？','14:00','R9予定表 · C4'],
      ['会議室の子どもの休日料金は？','令和8年度・令和9年度のうち、どの年度ですか？',null],
      ['R8','400円','R8料金表 · D4'],
      ['大人は？','800円','R8料金表 · D3'],
      ['子どもは？','400円','R8料金表 · D4'],
      ['R9',expectedR9Fee,wide ? 'R9料金表 · AA4' : merged ? 'R9料金表 · D3' : 'R9料金表 · D4'],
      ['説明会の午後組の開始時刻は？','14:00','R9予定表 · C4'],
      ['午前組は？','10:00','R9予定表 · C3'],
    ];
    const reverseOpening = process.argv.includes('--reverse-opening');
    if (reverseOpening) questions.splice(0, 2, questions[1], questions[0]);
    for (const [question,value,source] of questions) {
      if (question==='子どもは？') {
        await page.reload();
        await page.locator('#tab-ask').click();
      }
      await page.locator('#question').fill(question);
      await page.locator('#ask-form').evaluate(form => {
        form.removeAttribute('data-test-submit-at');
        form.addEventListener('submit', () => {
          form.dataset.testSubmitAt = String(Date.now());
        }, {once:true, capture:true});
      });
      const started=performance.now();
      const startedEpoch = Date.now();
      const isQuestionRequest = request =>
        request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ask');
      const requestStarted = page.waitForRequest(isQuestionRequest).then(() => ({monotonic:performance.now(), epoch:Date.now()}));
      const headers = page.waitForResponse(response =>
        isQuestionRequest(response.request()),
      ).then(() => performance.now());
      const bubble=page.locator('#messages .bubble').last();
      const [requestedAt, receivedAt, visibleAt] = await Promise.all([
        requestStarted,
        headers,
        (async () => {
          await page.locator('#ask-form button').click();
          await bubble.getByText(value,{exact:true}).waitFor({timeout:30000});
          return performance.now();
        })(),
      ]);
      await page.locator('#ask-form button:enabled').waitFor();
      const elapsedMs=Math.round(performance.now()-started);
      const submitEpoch = Number(await page.locator('#ask-form').getAttribute('data-test-submit-at'));
      assert.ok(submitEpoch >= startedEpoch && submitEpoch <= requestedAt.epoch, 'Missing or out-of-order submit event');
      const preRequestResources = await page.evaluate(({submitEpoch, requestEpoch}) =>
        performance.getEntriesByType('resource').flatMap(entry => {
          const start = performance.timeOrigin + entry.startTime;
          if (start < submitEpoch || start > requestEpoch) return [];
          const name = new URL(entry.name).pathname.split('/').at(-1);
          if (!['pdf','document-table-lookup.js','document-tagged-table.js','pdf.min.mjs','pdf.worker.min.mjs'].includes(name)) return [];
          return [{name, startMs:Math.round(start - submitEpoch), durationMs:Math.round(entry.duration)}];
        }), {submitEpoch, requestEpoch:requestedAt.epoch});
      assert.ok(!preRequestResources.some(({name}) => name === 'document-table-lookup.js' || name === 'document-tagged-table.js'),
        'Converted Excel questions must use the saved worksheet data without loading local PDF table analysis');
      const clickToSubmitEventMs = submitEpoch - startedEpoch;
      const submitEventToRequestMs = requestedAt.epoch - submitEpoch;
      const submitToRequestMs = Math.round(requestedAt.monotonic - started);
      const requestToHeadersMs = Math.round(receivedAt - requestedAt.monotonic);
      const responseHeadersMs = Math.round(receivedAt - started);
      const responseToVisibleMs = Math.round(visibleAt - receivedAt);
      if (!source) assert.equal(await bubble.locator('.answer-source').count(),0);
      if (source) {
        const sheet = source.split(' · ')[0];
        const addresses = (await bubble.locator('.answer-source > div').allTextContents()).flatMap(line=>line.split('、'));
        const expected = {
          'R9入試表':['A3','B4','C1','C2','C4'],
          'R9料金表':wide ? ['A3','AA2','AA4','B4','Z1'] : ['A3','B4','C1','D2',merged ? 'D3' : 'D4'],
          'R9予定表':source.endsWith('C3') ? ['A3','B3','C1','C2','C3'] : ['A3','B4','C1','C2','C4'],
          'R8料金表':source.endsWith('D3') ? ['A3','B3','C1','D2','D3'] : ['A3','B4','C1','D2','D4'],
        }[sheet];
        assert.deepEqual(addresses.sort(),expected.map(cell=>sheet+' · '+cell),question);
        const pageLabel = '元のPDF '+(['R9入試表','R9料金表','R9予定表','R8料金表'].indexOf(sheet)+1)+'ページ';
        assert.deepEqual(await bubble.locator('.answer-source a').allTextContents(),[pageLabel],question);
        if (source==='R8料金表 · D3') {
          await bubble.getByRole('link',{name:pageLabel,exact:true}).click();
          await page.waitForFunction(()=>document.querySelector('#pdf-page')?.value==='4');
        }
      }
      measurements.push({question,value,source,citationLinks:await bubble.locator('.answer-source a').allTextContents(),
        citationCells:await bubble.locator('.answer-source > div').allTextContents(),elapsedMs,preRequestResources,clickToSubmitEventMs,submitEventToRequestMs,submitToRequestMs,requestToHeadersMs,responseHeadersMs,responseToVisibleMs});

    }
    const blankQuestion = '令和9年度の青空高校の特進の入試日程は？';
    await page.locator('#question').fill(blankQuestion);
    const blankStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const blankBubble = page.locator('#messages .bubble').last();
    const blankAnswer = await blankBubble.textContent();
    assert.equal(await blankBubble.locator('.answer-source').count(),0,blankQuestion);
    assert.match(blankAnswer,/該当セルは空欄です。/);
    assert.doesNotMatch(blankAnswer,/\b(?:20|40)\b/,'A capacity value must not be reused as the admission date');
    measurements.push({question:blankQuestion,value:blankAnswer,source:null,citationLinks:[],citationCells:[],elapsedMs:Math.round(performance.now()-blankStarted)});
    const combinedQuestion = '令和9年度の青空高校と青空星雲高校について、それぞれ特進の入試定員は？';
    await page.locator('#question').fill(combinedQuestion);
    const combinedStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const sections = page.locator('#messages .bubble').last().locator('.answer-item');
    const values = await sections.locator('.answer-text').allTextContents();
    assert.deepEqual(values,['20','この項目の根拠は資料内で確認できませんでした。'],combinedQuestion);
    const citationLinks = await sections.first().locator('.answer-source a').allTextContents();
    const citationCells = await sections.first().locator('.answer-source > div').allTextContents();
    assert.deepEqual(citationLinks,['元のPDF 1ページ'],combinedQuestion);
    assert.ok(citationCells.join('、').split('、').includes('R9入試表 · C4'),combinedQuestion);
    assert.equal(await sections.last().locator('.answer-source').count(),0,combinedQuestion);
    measurements.push({question:combinedQuestion,value:values.join(' ／ '),source:'R9入試表 · C4',
      citationLinks,citationCells,elapsedMs:Math.round(performance.now()-combinedStarted)});
    const scheduleQuestion = '説明会の午前組と午後組について、それぞれ開始時刻は？';
    await page.locator('#question').fill(scheduleQuestion);
    const scheduleStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const scheduleSections = page.locator('#messages .bubble').last().locator('.answer-item');
    assert.deepEqual(await scheduleSections.locator('.answer-text').allTextContents(),['10:00','14:00']);
    const scheduleLinks = await scheduleSections.locator('.answer-source a').allTextContents();
    assert.deepEqual(scheduleLinks,['元のPDF 3ページ','元のPDF 3ページ']);
    const scheduleCells = await scheduleSections.locator('.answer-source > div').allTextContents();
    assert.deepEqual(scheduleCells.map(line=>line.split('、').filter(cell=>/ · C[34]$/.test(cell))),[
      ['R9予定表 · C3'],['R9予定表 · C4'],
    ]);
    measurements.push({question:scheduleQuestion,value:'10:00 ／ 14:00',source:'R9予定表 · C3・C4',
      citationLinks:scheduleLinks,citationCells:scheduleCells,elapsedMs:Math.round(performance.now()-scheduleStarted)});
    if (!merged && !wide) {
      for (const [question, values, cells, sheet, pageNumber] of [
        ['会議室の大人と子どもについて、それぞれ休日料金は？',
          ['令和8年度・令和9年度のうち、どの年度ですか？'],[]],
        ['令和9年度です',['900円','450円'],['D3','D4'],'R9料金表',2],
        ['令和8年度です',['800円','400円'],['D3','D4'],'R8料金表',4],
      ]) {
        await page.locator('#question').fill(question);
        const started = performance.now();
        await page.locator('#ask-form button').click();
        await page.locator('#ask-form button:enabled').waitFor();
        const answers = page.locator('#messages .bubble').last().locator('.answer-item');
        assert.deepEqual(await answers.locator('.answer-text').allTextContents(),values,question);
        const citationLinks = await answers.locator('.answer-source a').allTextContents();
        assert.deepEqual(citationLinks,cells.map(()=> '元のPDF '+pageNumber+'ページ'),question);
        const citationCells = await answers.locator('.answer-source > div').allTextContents();
        assert.deepEqual(citationCells.map(line=>line.split('、').filter(cell=>/ · D[34]$/.test(cell))),
          cells.map(cell=>[sheet+' · '+cell]),question);
        measurements.push({question,value:values.join(' ／ '),source:cells.length ? sheet+' · '+cells.join('・') : null,
          citationLinks,citationCells,elapsedMs:Math.round(performance.now()-started)});
      }
    }
    const releaseResponse = await page.request.get(new URL('./web/release-checks.json',guide).href,{
      headers:{'Cache-Control':'no-cache'},
    });
    assert.ok(releaseResponse.ok(),'Published release metadata is unavailable');
    const release = await releaseResponse.json();
    assert.match(release.commit,/^[0-9a-f]{40}$/);
    if (process.env.GITHUB_SHA) assert.equal(release.commit,process.env.GITHUB_SHA);
    const result = {
      commit:release.commit, measuredAt:new Date().toISOString(),
      platform:process.platform, browserVersion:browser.version(),
      fixture, registrationMs, reverseOpening, questions:measurements,
    };
    console.log(JSON.stringify(result));
    if (process.env.DOCUMENT_QA_REPORT) await writeFile(process.env.DOCUMENT_QA_REPORT,JSON.stringify(result,null,2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = measurements.map(({question,value,source,elapsedMs})=>`| ${question} | ${value} | ${source ?? "なし"} | ${elapsedMs} |`);
      await appendFile(process.env.GITHUB_STEP_SUMMARY,[
        '## 資料QAの速度（合成Excel、1回）',
        '',
        '作成操作から登録URLの表示まで '+registrationMs+' ms',
        '',
        '| 質問 | 確認した表示 | 根拠セル | 表示完了まで (ms) |',
        '| --- | --- | --- | ---: |',
        ...rows,
        '',
      ].join('\n'));
    }
    }
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


