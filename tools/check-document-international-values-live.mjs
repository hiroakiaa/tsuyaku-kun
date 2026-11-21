import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium,submitDocument} from './document-browser.mjs';
const fixtures=[
 ['登録料','Registration fee is GBP 25.','登録料はいくらですか？',/25\s*GBP|(?:GBP|£)\s*25/u],
 ['保証金','Equipment deposit is CHF 30.','備品の保証金はいくらですか？',/30\s*CHF|CHF\s*30/u],
 ['昼食代','Lunch price is CNY 300.','昼食代はいくらですか？',/300\s*CNY|CNY\s*300/u],
 ['会議室','At most 20 people may enter the meeting room.','会議室の入室人数の上限は？',/20\s*人(?:以下|まで)|(?:上限|最大).{0,10}20/u],
 ['申込人数','At least 12 participants are required for the workshop.','講習会の開催に必要な人数は？',/12\s*人以上|(?:最低|少なくとも).{0,5}12|At least 12 participants/u],
 ['荷物','The weight must be less than 5 kg.','荷物の重量条件は？',/5\s*(?:kg|キログラム)未満/u],
];
const browser=await chromium.launch(),report={cases:[],deleted:false};let page,guide;
try{page=await browser.newPage();const font=(await fs.readFile('web/ZenMaruGothic-Regular.ttf')).toString('base64');await page.setContent('<style>@font-face{font-family:Test;src:url(data:font/ttf;base64,'+font+')}body{font:22px Test;margin:40px}section+section{break-before:page}</style>'+fixtures.map(([title,text])=>'<section><h1>'+title+'</h1><p>'+text+'</p></section>').join(''));await page.evaluate(()=>document.fonts.ready);const pdf=await page.pdf({format:'A4'});await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();await page.locator('#upload input[type=file]').setInputFiles({name:'fictional-international-values.pdf',mimeType:'application/pdf',buffer:pdf});guide=await submitDocument(page);
 for(const [index,[title,original,question,expected]]of fixtures.entries()){
  const started=performance.now();await page.locator('#question').fill(question);await page.locator('#ask-form button.primary').click();await page.locator('#ask-form button.primary:enabled').waitFor({timeout:60000});const item=page.locator('#messages .answer-item').last(),answer=await item.locator('.answer-text').innerText(),quotes=await item.locator('blockquote').allTextContents(),links=await item.locator('.answer-source a').allTextContents(),row={question,answer,quotes,links,elapsedMs:Math.round(performance.now()-started),passed:false};
  try{assert.match(answer,expected);assert.deepEqual(links,['元のPDF '+(index+1)+'ページ']);assert.ok(quotes.some(quote=>(title+' '+original).replace(/\s/g,'').includes(quote.replace(/\s/g,''))));await item.locator('.answer-source a').click();await page.locator('[data-page="'+(index+1)+'"] .pdf-citation-visible').first().waitFor();row.passed=true;}catch(error){row.error=error.message;}report.cases.push(row);console.log(JSON.stringify(row));
 }
}finally{if(guide){const status=await page.evaluate(async guide=>{const {config}=await import('./web/config.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');return(await fetch(config.api+'/documents/'+new URL(guide).searchParams.get('id')+'/remove',{method:'POST',headers:{Authorization:'Bearer '+await getAuth().currentUser.getIdToken()}})).status;},guide);assert.ok([200,404].includes(status));report.deleted=true;}await fs.writeFile('checks/next50-international-values-public.json',JSON.stringify(report,null,2));await browser.close();}
assert.equal(report.cases.filter(row=>row.passed).length,fixtures.length);
