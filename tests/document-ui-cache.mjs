import assert from 'node:assert/strict';
import {documentStorage} from '../server/documents.js';
import {documentUiLabels} from '../web/document-ui-locale.js';
const data=new Map([['/document/ui-locale/English:v4',{lines:['obsolete']}]]),storage={get:async key=>data.get(key),put:async(key,value)=>data.set(key,value)};
const saved=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({lines:documentUiLabels.map(row=>row[1])})}}]});};
try{
 const run=()=>documentStorage(new Request('https://room/document/ui-locale/English',{method:'POST',body:JSON.stringify({language:'English'})}),storage,{OPENAI_DOCUMENT_QA_KEY:'test'});
 const results=await Promise.all([run(),run()]);for(const r of results)assert.equal((await r.json()).lines.length,documentUiLabels.length);
 assert.equal(calls,1,'Concurrent identical UI translations are coalesced');
 await run();assert.equal(calls,1,'Unchanged labels reuse the cache');
 const [key]=[...data.keys()].filter(key=>!key.endsWith(':v4'));data.set(key,{lines:['broken']});await run();assert.equal(calls,2,'Invalid same-version cache repairs itself');
 console.log('PASS UI cache follows label contents, repairs incomplete data and coalesces concurrent work');
}finally{globalThis.fetch=saved;}
