import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium,submitDocument} from './document-browser.mjs';
const fixtures=[
 ['日程','説明会は令和9年4月8日です。','説明会の日付を西暦のYYYY-MM-DD形式で教えてください。',/2027-0?4-0?8/u],
 ['ファイルの容量','ファイルの容量は5 MBまでです。','ファイルの上限は何KBですか？',/5,?000\s*(?:KB|キロバイト)/iu],
 ['荷物','荷物の重さは5 kgまでです。','荷物は何グラムまでですか？',/5,?000\s*(?:g|グラム)/iu],
 ['所要時間','体験会の所要時間は2時間です。','体験会の所要時間は何分ですか？',/120\s*分/u],
 ['手数料','窓口交付手数料は二百円です。','窓口交付手数料を数字の円表記で教えてください。',/200\s*円/u],
];
const browser=await chromium.launch(),report={cases:[],deleted:false};let page,guide;
try{page=await browser.newPage();const font=(await fs.readFile('web/ZenMaruGothic-Regular.ttf')).toString('base64');await page.setContent('<style>@font-face{font-family:Test;src:url(data:font/ttf;base64,'+font+')}body{font:22px Test;margin:40px}section+section{break-before:page}</style>'+fixtures.map(([title,text])=>'<section><h1>'+title+'</h1><p>'+text+'</p></section>').join(''));await page.evaluate(()=>document.fonts.ready);const pdf=await page.pdf({format:'A4'});await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();await page.locator('#upload input[type=file]').setInputFiles({name:'fictional-values.pdf',mimeType:'application/pdf',buffer:pdf});guide=await submitDocument(page);
 for(const [index,[,original,question,expected]]of fixtures.entries()){
  const started=performance.now();await page.locator('#question').fill(question);await page.locator('#ask-form button.primary').click();await page.locator('#ask-form button.primary:enabled').waitFor({timeout:60000});const item=page.locator('#messages .answer-item').last(),answer=await item.locator('.answer-text').innerText(),quotes=await item.locator('blockquote').allTextContents(),links=await item.locator('.answer-source a').allTextContents(),row={question,answer,quotes,links,elapsedMs:Math.round(performance.now()-started),passed:false};
  try{assert.match(answer,expected);assert.deepEqual(links,['元のPDF '+(index+1)+'ページ']);assert.ok(quotes.some(quote=>original.replace(/\s/g,'').includes(quote.replace(/\s/g,''))));await item.locator('.answer-source a').click();await page.locator('[data-page="'+(index+1)+'"] .pdf-citation-visible').first().waitFor();row.passed=true;}catch(error){row.error=error.message;}report.cases.push(row);console.log(JSON.stringify(row));
 }
}finally{if(guide){const status=await page.evaluate(async guide=>{const {config}=await import('./web/config.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');return(await fetch(config.api+'/documents/'+new URL(guide).searchParams.get('id')+'/remove',{method:'POST',headers:{Authorization:'Bearer '+await getAuth().currentUser.getIdToken()}})).status;},guide);assert.ok([200,404].includes(status));report.deleted=true;}await fs.writeFile('checks/values-public.json',JSON.stringify(report,null,2));await browser.close();}
assert.equal(report.cases.filter(row=>row.passed).length,fixtures.length);
