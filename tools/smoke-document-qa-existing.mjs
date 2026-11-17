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
} finally {
  await browser.close();
}
