import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const fixtures = [
  {
    label:'Excel',
    excel:true,
    otherValue:/410\s*円/u,
    questions:[['令和9年度の会議室の子どもの休日料金は？',/470\s*円/u,2,'R9料金表 · AA4'],['会議室の子どもの休日料金は？',null],['令和8年度',/410\s*円/u,1,'R8料金表 · D4',/470\s*円/u]],
  },
  {
    label:'本文PDF',
    otherValue:/5,?300\s*円/u,
    pages:['体験会の参加費は3,500円です。','職員研修の参加費は5,300円です。'],
    questions:[['体験会の参加費はいくら？',/3,?500\s*円/u],['体験会のキャンセル料はいくら？',null]],
  },
  {
    label:'スキャンPDF',
    scan:true,
    otherValue:/800\s*円/u,
    pages:['窓口交付手数料 400円','郵送交付手数料 800円'],
    questions:[['窓口の交付手数料はいくら？',/400\s*円/u],['窓口で使える支払方法は？',null]],
  },
  {
    label:'低解像度スキャンPDF',
    scan:true,
    lowResolution:true,
    otherValue:/780\s*円/u,
    pages:['窓口の発行手数料は260円です。','郵送の発行手数料は780円です。'],
    questions:[['窓口の発行手数料はいくら？',/260\s*円/u],['窓口の支払方法は何ですか？',null]],
  },
];

const total = fixtures.reduce((count,fixture)=>count+fixture.questions.length,0);
const browser = await chromium.launch();
const failures = [];
const measurements = [];
const normalize = text=>text.normalize('NFKC').replace(/[\s、。，,.]/gu,'');
let passed = 0;
try {
  for (const fixture of fixtures) {
    const page = await browser.newPage();
    try {
      if (!fixture.excel) {
        await page.setContent('<meta charset="utf-8">');
        await page.evaluate(({pages,scan,lowResolution})=>{
          for (const [index,line] of pages.entries()) {
            const section = document.createElement('section');
            if (index) section.style.breakBefore = 'page';
            if (scan) {
              const canvas = document.createElement('canvas');
              canvas.width = lowResolution ? 460 : 1100;
              canvas.height = lowResolution ? 100 : 240;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0,0,canvas.width,canvas.height);
              ctx.fillStyle = lowResolution ? '#777' : 'black';
              ctx.font = lowResolution ? '21px sans-serif' : '48px sans-serif';
              ctx.fillText(line,lowResolution ? 15 : 40,lowResolution ? 48 : 110);
              const image = document.createElement('img');
              image.src = lowResolution ? canvas.toDataURL('image/jpeg',0.55) : canvas.toDataURL();
              image.style.width = '600px';
              section.append(image);
            } else section.textContent = line;
            document.body.append(section);
          }
        },fixture);
      }
      const file = fixture.excel ? {
        name:'acceptance.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer:await readFile(new URL('../tests/fixtures/document-qa-acceptance.xlsx',import.meta.url)),
      } : {name:'acceptance.pdf',mimeType:'application/pdf',buffer:await page.pdf()};
      await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
      await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
      await page.locator('#upload input[name=title]').fill('自動受入確認 '+fixture.label);
      await page.locator('#upload input[type=file]').setInputFiles(file);
      if (!fixture.excel) await page.getByText('PDFの文字を確認しました。',{exact:true}).waitFor({timeout:120_000});
      await page.locator('#upload button').click();
      await page.waitForFunction(()=>Boolean(document.querySelector('#guide-url')?.value),null,{timeout:120_000});
      const guide = await page.locator('#guide-url').inputValue();
      try {
        await page.goto(guide);
        await page.locator('#tab-ask').click();
        for (const [question,expected,sourcePage=1,cell,wrong=fixture.otherValue] of fixture.questions) {
          try {
            const answers = page.locator('#messages .answer-item');
            const before = await answers.count();
            await page.locator('#question').fill(question);
            const started = performance.now();
            await page.locator('#ask-form button').click();
            await page.waitForFunction(count=>document.querySelectorAll('#messages .answer-item').length>count,before,{timeout:60_000});
            await page.locator('#ask-form button:enabled').waitFor({timeout:60_000});
            const answer = await answers.last().locator('.answer-text').textContent();
            const source = answers.last().locator('.answer-source');
            const citations = await source.locator('a').allTextContents();
            const quotes = await source.locator('blockquote').allTextContents();
            const elapsedMs = Math.round(performance.now()-started);
            const measurement = {fixture:fixture.label,question,answer,citations,quotes,elapsedMs,passed:false};
            measurements.push(measurement);
            console.log(JSON.stringify({fixture:fixture.label,question,answer,citations,quotes,elapsedMs}));
            if (expected) {
              assert.match(answer,expected,question);
              assert.doesNotMatch(answer,wrong,question);
              assert.deepEqual(citations,['元のPDF '+sourcePage+'ページ'],question);
              if (cell) {
                const addresses = (await source.locator(':scope > div').allTextContents()).flatMap(text=>text.split('、'));
                assert.ok(addresses.includes(cell),question);
                assert.ok(quotes.some(quote=>normalize(quote).startsWith(cell.split(' · ')[1]) && expected.test(normalize(quote))),question);
              } else {
                const original = normalize(fixture.pages[sourcePage-1]);
                const matching = quotes.map(normalize).find(quote=>original.includes(quote) && expected.test(quote));
                assert.ok(matching,question+'の引用が原文に一致しません');
              }
            } else {
              assert.match(answer,fixture.excel ? /令和8年度.*令和9年度.*どの年度/u : /確認できません/u,question);
              assert.deepEqual(citations,[],question);
            }
            measurement.passed = true;
            passed++;
          } catch (error) {
            failures.push(error);
            console.error(fixture.label,question,error);
          }
        }
      } finally {
        const statuses = await page.evaluate(async documentUrl=>{
          const {config} = await import('./web/config.js');
          const {initializeApp} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js');
          const {getAuth} = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
          const auth = getAuth(initializeApp(config.firebase));
          await auth.authStateReady();
          const endpoint = config.api+'/documents/'+new URL(documentUrl).searchParams.get('id');
          const headers = {Authorization:'Bearer '+await auth.currentUser.getIdToken()};
          const removed = await fetch(endpoint+'/remove',{headers,method:'POST'});
          const info = await fetch(endpoint,{headers,cache:'no-store'});
          const pdf = await fetch(endpoint+'/pdf',{headers,cache:'no-store'});
          return [removed.status,info.status,pdf.status];
        },guide);
        assert.deepEqual(statuses,[200,404,404],fixture.label+' cleanup');
        console.log(fixture.label+' cleanup confirmed');
      }
    } catch (error) {
      failures.push(error);
      console.error(fixture.label,error);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log('Acceptance questions passed: '+passed+'/'+total);
if (process.env.DOCUMENT_QA_REPORT) {
  await writeFile(process.env.DOCUMENT_QA_REPORT,JSON.stringify({passed,total,measurements},null,2));
}
if (failures.length) throw new AggregateError(failures,'Document QA acceptance failed');
