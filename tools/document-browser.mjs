import {createRequire} from 'node:module';
const {chromium:engine}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
export const chromium={launch:options=>engine.launch({...process.env.PLAYWRIGHT_PACKAGE?{channel:'chrome'}:{},...options})};

// Current creation flow: automatic name, then direct navigation to PDF/chat.
// Keep synthetic-fixture smoke checks independent from deprecated result fields.
export async function submitDocument(page,{timeout=120000}={}){
 if(await page.locator('#upload input[name=title]').count())throw Error('Deprecated title field returned');
 await page.evaluate(()=>addEventListener('pagehide',()=>{
  const entries=Object.fromEntries(['initialization','render','recognition','native-recognition','full-recognition','horizontal-recognition','horizontal-initialization','engine-reuse'].map(stage=>[stage,performance.getEntriesByName('document-ocr:'+stage,'measure').map(entry=>Math.round(entry.duration))]));
  sessionStorage.setItem('document-smoke-ocr-stages',JSON.stringify(entries));
 },{once:true}));
 let created;const registrations=[];
 const onResponse=response=>{if(new URL(response.url()).pathname==='/documents'&&response.request().method()==='POST'&&response.ok())registrations.push(response.json().then(data=>{created=data.id;}).catch(()=>{}));};
 page.on('response',onResponse);
 try{
  await page.locator('#upload .create-guide').click();
  await page.waitForURL(url=>/^[a-f0-9-]{36}$/.test(url.searchParams.get('id')??''),{timeout});
  await page.locator('#question').waitFor({state:'visible',timeout});
  return page.url();
 }catch(error){
  await Promise.all(registrations);
  const status=await page.locator('#upload-status').textContent({timeout:1000}).catch(()=>'');
  if(created){
   const removed=await page.evaluate(async id=>{const {config}=await import('./web/config.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');const token=await getAuth().currentUser.getIdToken();return (await fetch(config.api+'/documents/'+id+'/remove',{method:'POST',headers:{Authorization:'Bearer '+token}})).status;},created);
   if(removed!==200)throw Error('Failed registration fixture cleanup: '+removed,{cause:error});
  }
  throw Error('Document creation/navigation: '+status,{cause:error});
 }finally{page.off('response',onResponse);}
}
