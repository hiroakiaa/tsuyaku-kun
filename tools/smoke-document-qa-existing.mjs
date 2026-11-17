import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const id = process.env.DOCUMENT_QA_EXISTING_FIXTURE;
assert.match(id ?? '', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
  'Set DOCUMENT_QA_EXISTING_FIXTURE to the ID of the existing non-sensitive QA fixture');
const url = new URL('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
url.searchParams.set('id', id);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({locale:'ja-JP'});
  await page.goto(url.href);
  await page.locator('#tab-ask').click();
  const language = page.locator('select.document-language:visible');
  await language.selectOption('ja');
  await page.locator('#question').fill('ルームは何時間で失効しますか？');
  await page.locator('#ask-form button').click();
  const answer = page.locator('#messages .answer-item').filter({hasText:/24\s*時間/});
  const citation = answer.getByRole('link',{name:'元のPDF 2ページ',exact:true});
  await citation.click({timeout:60_000});
  const picker=page.locator('#pdf-page');
  const waitForOriginalMark = () => page.waitForFunction(() =>
    [...document.querySelectorAll('[data-page="2"] .pdf-citation-visible')].some(mark => {
      const fill = getComputedStyle(mark, '::after');
      return mark.getBoundingClientRect().width > 0 && fill.backgroundColor === 'rgb(245, 217, 117)' &&
        fill.transform === 'matrix(1, 0, 0, 1, 0, 0)';
    }), null, {timeout:15_000});
  await waitForOriginalMark();
  assert.equal(await picker.inputValue(),'2');

  await language.selectOption('en');
  const toggle=page.locator('#pdf-language-toggle');
  await toggle.locator('[data-language="en"]').click();
  const translatedMark=page.locator('.pdf-translation-layout[data-page="2"] .pdf-translated-citation:visible')
    .filter({hasText:/24\s*hours/i}).first();
  await translatedMark.waitFor({timeout:65_000});
  assert.equal(await picker.inputValue(),'2');

  await toggle.locator('[data-language=""]').click();
  await page.locator('#pdf-translation').waitFor({state:'hidden'});
  await waitForOriginalMark();
  assert.equal(await picker.inputValue(),'2');
  console.log('Existing PDF: grounded answer, English citation, and original citation restored.');

  let blockFirstPage = true;
  let blockedRequests = 0;
  let secondPageRequests = 0;
  let diagramSourceCheck;
  await page.route(/\/documents\/[^/]+\/translate$/u, async route => {
    const translation = route.request().postDataJSON();
    if (translation.language==='en' && translation.page===5 && translation.diagramText) {
      const source=translation.diagramText.normalize('NFKC').replace(/\s/gu,'');
      diagramSourceCheck={
        speechConversion:source.includes('話した日本語を文章にします'),
        languageChoice:source.includes('生徒が選んだ言葉ごとに訳を作ります'),
      };
    }
    if (translation.language==='es' && translation.page===2) secondPageRequests++;
    if (translation.language==='es' && translation.page===1 && blockFirstPage) {
      blockedRequests++;
      await route.abort('failed');
    } else await route.continue();
  });
  await language.selectOption('es');
  await toggle.locator('[data-language="es"]').click();
  const secondPage = page.locator('.pdf-translation-layout[data-page="2"]');
  await secondPage.waitFor({timeout:65_000});
  const secondPageText = await secondPage.innerText();
  const savedRequestCount = secondPageRequests;
  assert.ok(savedRequestCount>0);

  await picker.selectOption('1');
  const retry = page.locator('#pdf-translation').getByRole('button',{name:'再試行',exact:true});
  await retry.waitFor({timeout:30_000});
  assert.ok(blockedRequests>0);
  assert.equal(await picker.inputValue(),'1');
  blockFirstPage = false;
  await retry.click();
  await page.locator('.pdf-translation-layout[data-page="1"] .pdf-layout-line').first().waitFor({timeout:65_000});
  assert.equal(await picker.inputValue(),'1');
  await picker.selectOption('2');
  await secondPage.waitFor({timeout:65_000});
  assert.equal(await secondPage.innerText(),secondPageText);
  assert.equal(secondPageRequests,savedRequestCount,'Retry must not request an already translated page again');
  console.log('Existing PDF: retry recovered page 1 and preserved the cached page 2.');

  await language.selectOption('en');
  await toggle.locator('[data-language="en"]').click();
  await picker.selectOption('5');
  const translatedDiagram=page.locator('.pdf-translation-layout[data-page="5"] .pdf-layout-line');
  await translatedDiagram.filter({hasText:/teacher speaks/i}).first().waitFor({timeout:65_000});
  const retries=await page.evaluate(()=>performance.getEntriesByName('document-ocr:diagram-line-retry')
    .filter(entry=>entry.detail.page===5).map(({duration,detail})=>({
      milliseconds:Math.round(duration),attempted:detail.attempted,accepted:detail.accepted,
    })));
  assert.ok(retries.length,'Diagram page must record its OCR retry outcome');
  console.log('Existing PDF diagram OCR retries:',JSON.stringify(retries));
  assert.ok(diagramSourceCheck,'Diagram page must submit its recognized text for translation');
  console.log('Existing PDF diagram source matches:',JSON.stringify(diagramSourceCheck));

} finally {
  await browser.close();
}
