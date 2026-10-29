import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {catalog} from '../server/catalog.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function createUiFixture({automaticLanguage=false,realtime=false}={}){
const origin='https://tsuyaku-preview.test',rooms=new Map(),errors=[],results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
let roomCounter=0,readyHistory=[],authFailures=0,catalogGate=null,apiHandler=null;const externalAssets=new Map();
async function setup(context){
 if(!realtime)await context.addInitScript(()=>localStorage.setItem('tsuyaku-recognition-speed-v1','economy'));
 // Existing microphone regressions exercise manual/native recognition; auto has its own integration suite.
 if(!automaticLanguage)await context.addInitScript(()=>localStorage.setItem('tsuyaku-face-auto-language','off'));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(process.env.TRACE)console.log('ASSET',u.pathname);
  if(u.origin===origin){try{const name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));const f=path.resolve(root,name);if(!f.startsWith(root+path.sep))return route.abort();return route.fulfill({body:await fs.readFile(process.env.BASELINE_CONVERSATION_UI&&name==='web/conversation-ui.js'?process.env.BASELINE_CONVERSATION_UI:f),contentType:types[path.extname(f)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Missing test asset'});}}
  if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:u.pathname.includes('firebase-app')?'export function initializeApp(){return {}}':`const user={getIdToken:async()=>"synthetic-test-token"};let failures=${authFailures};const auth={authStateReady:async()=>{},currentUser:failures?null:user};export function getAuth(){return auth}export async function signInAnonymously(a){if(failures-->0)throw Error("Synthetic transient auth failure");a.currentUser=user;}export function onAuthStateChanged(a,f){f(a.currentUser);return ()=>{}}`});
  if(u.hostname==='cdnjs.cloudflare.com'){try{if(!externalAssets.has(u.href))externalAssets.set(u.href,fetch(u,{signal:AbortSignal.timeout(10000)}).then(async r=>({body:Buffer.from(await r.arrayBuffer()),contentType:r.headers.get('content-type')||'application/octet-stream'})));return route.fulfill(await externalAssets.get(u.href));}catch{return route.abort();}}
  if(u.hostname==='tsuyaku-kun-api.allinone-hiroakiaa.workers.dev'){
   if(apiHandler){const output=await apiHandler(route.request());if(output)return route.fulfill(output);}
   let data={};if(u.pathname==='/catalog'){const gate=catalogGate;if(gate)await gate.promise;data=gate?.data||catalog;}
   if(u.pathname==='/rooms'){const payload=route.request().postDataJSON();const id=String(++roomCounter).padStart(32,'0');data={id,key:'a'.repeat(32),mode:payload.mode,code:'1234',unit:'数学',expires:Date.now()+86400000};rooms.set(id,data);}
   if(u.pathname==='/lessons/join'){const id=String(++roomCounter).padStart(32,'0');data={id,key:'a'.repeat(32),mode:'lesson',code:'1234',unit:'数学',expires:Date.now()+86400000};rooms.set(id,{...data,student:true});}
   return route.fulfill({json:data});
  }
  // Display/interaction test only: no live Google, AI, audio or participant requests.
  return route.fulfill({body:'',contentType:u.pathname.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await context.routeWebSocket('**/rooms/*/socket',socket=>{const id=new URL(socket.url()).pathname.split('/')[2],r=rooms.get(id);socket.onMessage(raw=>{const msg=JSON.parse(String(raw));if(msg.type==='auth')socket.send(JSON.stringify({type:'ready',id:'b'.repeat(32),role:r?.student?'student':'teacher',mode:r?.mode||'interpreter',code:'1234',unit:'数学',history:readyHistory,expires:Date.now()+86400000}));if(msg.type==='ping')socket.send(JSON.stringify({type:'pong'}));});});
}
return {browser,setup,origin,root,setHistory:value=>{readyHistory=value;},setAuthFailures:value=>{authFailures=value;},setApiHandler:value=>{apiHandler=value;},deferCatalog:data=>{let release;const promise=new Promise(resolve=>release=resolve);catalogGate={promise,data};return ()=>{catalogGate=null;release();};}};
}
