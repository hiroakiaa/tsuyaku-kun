import {readFile,appendFile,writeFile} from 'node:fs/promises';
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
  await page.locator('#upload input[type=file]').setInputFiles({name:'document-qa-tables.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await readFile(new URL('../tests/fixtures/document-qa-tables.xlsx',import.meta.url))});
  const sheets=await page.evaluate(async()=>{
    const {officePages}=await import('./web/document-office.js');
    return officePages(document.querySelector('#upload input[type=file]').files[0],{includeMerges:true});
  });
  assert.equal(sheets.length,4);
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
    const measurements=[];
    for(const [question,value,source] of [
      ['令和9年度の青空高校の特進の入試定員は？','20','R9入試表 · C4'],
      ['令和9年度の会議室の子どもの休日料金は？','450円','R9料金表 · D4'],
      ['説明会の午後組の開始時刻は？','14:00','R9予定表 · C4'],
      ['会議室の子どもの休日料金は？','令和8年度・令和9年度のうち、どの年度ですか？',null],
      ['R8','400円','R8料金表 · D4'],
      ['令和8年度の会議室の大人の休日料金は？','800円','R8料金表 · D3'],
      ['令和9年度の会議室の子どもの休日料金は？','450円','R9料金表 · D4'],
    ]){
      await page.locator('#question').fill(question);
      const started=performance.now();
      await page.locator('#ask-form button').click();
      const bubble=page.locator('#messages .bubble').last();
      await bubble.getByText(value,{exact:true}).waitFor({timeout:30000});
      if(source) {
        await bubble.getByText(source,{exact:false}).waitFor({timeout:5000});
        const expectedPage=['R9入試表','R9料金表','R9予定表','R8料金表'].indexOf(source.split(' · ')[0])+1;
        assert.ok(await bubble.getByRole('link',{name:'元のPDF '+expectedPage+'ページ',exact:true}).count());
      } else assert.equal(await bubble.locator('.answer-source').count(),0);
      await page.waitForFunction(()=>!document.querySelector('#ask-form button').disabled);
      if (source) {
        const sheet = source.split(' · ')[0];
        const addresses = (await bubble.locator('.answer-source > div').allTextContents()).flatMap(line=>line.split('、'));
        const expected = {
          'R9入試表':['A3','B4','C1','C2','C4'],
          'R9料金表':['A3','B4','C1','D2','D4'],
          'R9予定表':['A3','B4','C1','C2','C4'],
          'R8料金表':source.endsWith('D3') ? ['A3','B3','C1','D2','D3'] : ['A3','B4','C1','D2','D4'],
        }[sheet];
        assert.deepEqual(addresses.sort(),expected.map(cell=>sheet+' · '+cell),question);
        const pageLabel = '元のPDF '+(['R9入試表','R9料金表','R9予定表','R8料金表'].indexOf(sheet)+1)+'ページ';
        assert.deepEqual(await bubble.locator('.answer-source a').allTextContents(),[pageLabel],question);
      }
      measurements.push({question,value,source,citationLinks:await bubble.locator('.answer-source a').allTextContents(),
        citationCells:await bubble.locator('.answer-source > div').allTextContents(),elapsedMs:Math.round(performance.now()-started)});
    }
    const blankQuestion = '令和9年度の青空高校の特進の入試日程は？';
    await page.locator('#question').fill(blankQuestion);
    const blankStarted = performance.now();
    await page.locator('#ask-form button').click();
    await page.locator('#ask-form button:enabled').waitFor();
    const blankBubble = page.locator('#messages .bubble').last();
    const blankAnswer = await blankBubble.textContent();
    assert.equal(await blankBubble.locator('.answer-source').count(),0,blankQuestion);
    assert.match(blankAnswer,/空欄|記載(?:が)?(?:ありません|されていません)|根拠(?:を|は資料内で)確認できません/);
    assert.doesNotMatch(blankAnswer,/\b(?:20|40)\b/,'A capacity value must not be reused as the admission date');
    measurements.push({question:blankQuestion,value:blankAnswer,source:null,citationLinks:[],citationCells:[],elapsedMs:Math.round(performance.now()-blankStarted)});
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
      registrationMs, questions:measurements,
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


