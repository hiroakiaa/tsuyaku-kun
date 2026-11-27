import assert from 'node:assert/strict';
import {chromium} from './document-browser.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1});
 await page.goto('https://hiroakiaa.github.io/tsuyaku-kun/documents.html?v=299');
 const href=await page.locator('link[href*="documents.css"]').getAttribute('href');
 assert.match(href,/v=116$/);
 const css=await (await page.request.get(new URL(href,page.url()).href)).text();
 const backgrounds=[['White','#ffffff','#161616'],['Yellow','#ffdc28','#161616'],['Cream','#f5d975','#161616'],['Dark','#191919','#ffffff'],['Blue','#356aa0','#ffffff'],['Gray','#999999','#161616']];
 await page.setContent('<style>'+css+'</style><style>body{padding:24px;background:#e5e7eb;color:#111}h1{font:24px sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}.sample{padding:18px;border-radius:8px}h2{font:18px sans-serif;margin:0 0 16px}.row{position:relative;font:20px/36px sans-serif;height:44px}.pdf-citation-mark{left:0;top:3px;width:320px;height:30px}.translated{font:18px/34px sans-serif;margin-top:12px}</style><h1>Published marker contrast / CSS v116</h1><main>'+backgrounds.map(([name,bg,fg])=>'<section class="sample" style="background:'+bg+';color:'+fg+'"><h2>'+name+'</h2><div class="row">Meeting starts at 10:00 AM<span class="pdf-citation-mark pdf-citation-visible"></span></div><div class="translated"><span class="pdf-translated-citation">Translated citation at 10:00 AM</span></div></section>').join('')+'</main>');
 for(const selector of ['.pdf-citation-mark','.pdf-translated-citation']){
  const values=await page.locator(selector).evaluateAll((nodes,isMark)=>nodes.map(n=>{const s=getComputedStyle(n,isMark?'::after':null);return {shadow:s.boxShadow,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height};}),selector==='.pdf-citation-mark');
  assert.equal(values.length,6);for(const v of values){assert.ok(v.width>0&&v.height>0);assert.equal(v.shadow,'none');}
 }
 await page.screenshot({path:'document-marker-contrast.png',fullPage:true});
 console.log('PASS public CSS v116: frameless highlighter on white/yellow/cream/dark/blue/gray, original and translated text');
}finally{await browser.close();}
