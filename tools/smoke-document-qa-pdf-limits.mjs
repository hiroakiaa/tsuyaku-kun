import assert from 'node:assert/strict';
import {chromium,submitDocument} from './document-browser.mjs';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(Array.from({length:41},(_,index)=>'<p style="break-after:page">Page '+(index+1)+'</p>').join(''));
  const pdf = await page.pdf();
  await page.setContent('<p>One-page size limit fixture</p>');
  const singlePage = await page.pdf();
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');
  await page.getByRole('heading',{name:'資料QAの保管庫'}).waitFor();
  await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'資料チャット作成',exact:true}).count(),0);
  const oversized = Buffer.concat([singlePage, Buffer.alloc(5_000_001-singlePage.length,32)]);
  const input = page.locator('#upload input[type=file]');
  const status = page.locator('#upload-status');
  let uploads = 0;
  await page.route('**/documents',async route=>{
    const request = route.request();
    if (request.method()!=='POST') return route.continue();
    uploads++;
    await route.abort();
  });
  await input.setInputFiles({name:'41-pages.pdf',mimeType:'application/pdf',buffer:pdf});
  await status.getByText('40ページ以内のPDFを選んでください。',{exact:true}).waitFor();
  await page.locator('#upload button').click();
  await status.getByText('40ページ以内のPDFを選んでください。',{exact:true}).waitFor();
  await input.setInputFiles({name:'oversized.pdf',mimeType:'application/pdf',buffer:oversized});
  await page.locator('#upload button').click();
  await status.getByText('PDFは5 MBまでです。',{exact:true}).waitFor();
  assert.equal(uploads,0);
  console.log('PASS 41 pages and 5000001 bytes rejected before upload');
} finally {
  await browser.close();
}

