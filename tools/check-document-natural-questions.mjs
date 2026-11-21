import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,submitDocument} from './document-browser.mjs';

const pages=[
  ['初年度の費用','入学費は8000円で、初年度のみ必要です。学年費は月1500円を12か月徴収します。保険料は年間1200円です。写真代は任意で、上記には含めません。'],
  ['身だしなみ','頭髪は清潔に保ちます。染色と脱色は禁止です。肩にかかる長さの髪は結んでください。'],
  ['教科の取組','数学の重点目標は、数量の関係を筋道立てて説明することです。表とグラフで二つの解法を比較します。理科では観察の結果を根拠に結論を述べ、実験記録を班で共有します。'],
  ['下校','下校完了時刻は、7月は16時40分、8月は16時20分、9月は16時50分です。'],
  ['入試','架空の青葉調理専門学校の推薦基準は、評定平均3.0以上、欠席10日以内です。一般入試には評定平均の条件はありません。'],
  ['施設料金','基本入館料は1200円です。中学生は基本入館料が半額になります。休日は300円を追加します。休日加算は割引の対象外です。'],
  ['会場の比較','A館の高校生の入館料は500円、B館の高校生の入館料は400円です。'],
];
const cases=[
  ['1年間にかかるお金の合計は？',/27,?200\s*円/u,[1]],
  ['学年費は？',/1,?500\s*円/u,[1]],
  ['髪のルールは？',/染色|脱色/u,[2]],
  ['数学って何勉強するの？',/数量|解法|グラフ/u,[3]],
  ['8月は何時に帰るの？',/16\s*時\s*20\s*分/u,[4]],
  ['青葉調理のすいせんきじゅんは？',/3\.0/u,[5]],
  ['休日に中学生が入館すると合計いくら？',/900\s*円/u,[6]],
  ['A館とB館は高校生ならどちらが安い？',/B館/u,[7]],
  ['頭髪',/染色|脱色/u,[2]],
  ['8月のバスの運賃は？',/確認できません/u,[]],
];
const browser=await chromium.launch(),report={measuredAt:new Date().toISOString(),cases:[],deleted:false};let page,guide;
try{
  page=await browser.newPage();const font=(await fs.readFile('web/ZenMaruGothic-Regular.ttf')).toString('base64');
  await page.setContent('<style>@font-face{font-family:Test;src:url(data:font/ttf;base64,'+font+')}body{font:20px Test;line-height:1.8;padding:30px}section+section{break-before:page}</style>'+pages.map(([title,text])=>'<section><h1>'+title+'</h1><p>'+text+'</p></section>').join(''));
  await page.evaluate(()=>document.fonts.ready);const pdf=await page.pdf({format:'A4'});
  await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html');await page.getByRole('link',{name:'資料チャット作成',exact:true}).click();
  await page.locator('#upload input[type=file]').setInputFiles({name:'fictional-natural-questions.pdf',mimeType:'application/pdf',buffer:pdf});guide=await submitDocument(page);
  for(const [question,expected,sourcePages] of cases){
    const before=await page.locator('#messages .answer-item').count();const started=performance.now();await page.locator('#question').fill(question);await page.locator('#ask-form button.primary').click();await page.locator('#ask-form button.primary:enabled').waitFor({timeout:90000});
    const answers=(await page.locator('#messages .answer-item').all()).slice(before),answer=answers[0],text=(await Promise.all(answers.map(item=>item.locator('.answer-text').innerText()))).join('\n'),links=[...new Set((await Promise.all(answers.map(item=>item.locator('.answer-source a').allTextContents()))).flat())],quotes=(await Promise.all(answers.map(item=>item.locator('blockquote').allTextContents()))).flat();
    const row={question,text,links,quotes,elapsedMs:Math.round(performance.now()-started),passed:false};
    try{assert.match(text,expected);assert.deepEqual(links,sourcePages.map(number=>'元のPDF '+number+'ページ'));for(const quote of quotes)assert.ok(sourcePages.some(number=>(pages[number-1].join('')).replace(/\s/g,'').includes(quote.replace(/\s/g,''))),'Quote must be in cited original page');if(links.length){await answer.locator('.answer-source a').first().click();await page.locator('[data-page="'+sourcePages[0]+'"] .pdf-citation-visible').first().waitFor({timeout:30000});}row.passed=true;}catch(error){row.error=error.message;}
    if(!row.passed)row.diagnostic=await page.evaluate(async({guide,question})=>{const {config}=await import('./web/config.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');const response=await fetch(config.api+'/documents/'+new URL(guide).searchParams.get('id')+'/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getAuth().currentUser.getIdToken()},body:JSON.stringify({question,benchmarkMode:'full'})});return response.json();},{guide,question});
    report.cases.push(row);console.log(JSON.stringify(row));
  }
}finally{
  if(guide){const status=await page.evaluate(async url=>{const {config}=await import('./web/config.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');return(await fetch(config.api+'/documents/'+new URL(url).searchParams.get('id')+'/remove',{method:'POST',headers:{Authorization:'Bearer '+await getAuth().currentUser.getIdToken()}})).status;},guide);assert.ok([200,404].includes(status));report.deleted=true;}
  report.passed=report.cases.filter(row=>row.passed).length;report.total=cases.length;await fs.writeFile('checks/natural-questions-'+(process.env.REPORT_LABEL||'public')+'.json',JSON.stringify(report,null,2));await browser.close();
}
assert.equal(report.passed,report.total,JSON.stringify(report.cases.filter(row=>!row.passed)));
