import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const original=globalThis.fetch,root=new URL('../',import.meta.url),local=await fs.readFile(new URL('index.html',root),'utf8'),build=/web\/app\.js\?v=([^"'&]+)/.exec(local)[1];
let wrongBuild=false,staleModule=false,requests=[];
globalThis.fetch=async input=>{const u=new URL(input);requests.push(u.href);if(u.pathname==='/health')return Response.json({ok:true,build:wrongBuild?'old-build':build});assert.equal(u.hostname,'hiroakiaa.github.io');assert(u.pathname.startsWith('/tsuyaku-kun/'));const path=u.pathname.slice('/tsuyaku-kun/'.length);assert(!path.includes('..'));if(staleModule&&path==="web/analysis-focus.js")return new Response("// stale module");return new Response(await fs.readFile(new URL(path,root)));};
try{
 await import('../tools/verify-release.mjs?test=valid');
 assert(requests.some(u=>u.includes('/health')));assert(requests.some(u=>u.includes('language-picker.js')));assert(requests.some(u=>u.includes('recognition-analysis.js')));
 assert(requests.some(u=>u.endsWith('analysis-focus.js?v='+build)));
 staleModule=true;
 await assert.rejects(import('../tools/verify-release.mjs?test=stale-module'),/Published content differs.*analysis-focus/);
 staleModule=false;
 wrongBuild=true;await assert.rejects(import('../tools/verify-release.mjs?test=mismatch'),/API build differs/);
 assert(!requests.some(u=>/\/translate|\/transcribe|sheets/.test(u)));
}finally{globalThis.fetch=original;}
console.log('PASS release verification includes shared modules and API build; wrong API fails without translation or recognition calls');
