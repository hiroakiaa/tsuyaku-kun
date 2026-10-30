import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {lastVoicedAt} from '../web/diagnostics.js';
import {config} from '../web/config.js';
if(!process.argv.includes('--live'))throw Error('Explicit --live required: synthetic audio consumes the existing recognition budget.');
const require=createRequire(import.meta.url),{ws:Socket}=require(process.env.PLAYWRIGHT_UTILS||'playwright-core/lib/utilsBundle.js');
const root=path.resolve('checks/recognition-probe'),cases=JSON.parse((await fs.readFile(path.join(root,'cases.json'),'utf8')).replace(/^\uFEFF/,''));
const auth=await(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.firebase.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}),signal:AbortSignal.timeout(10000)})).json();if(!auth.idToken)throw Error('Anonymous authentication unavailable');
const rows=[];
for(const c of cases){
 const raw=await fs.readFile(path.join(root,c.id+'.wav'));let pcm;for(let at=12;at+8<=raw.length;){const size=raw.readUInt32LE(at+4);if(raw.toString('ascii',at,at+4)==='data')pcm=raw.subarray(at+8,at+8+size);at+=8+size+(size%2);}if(!pcm||pcm.length>160000)throw Error('Invalid bounded fixture');
 const row={fixture:c.id,synthetic:true},start=Date.now();let endedAt,resultAt,lastSpeechAt=null,closed=false,ready,resolveResult,rejectResult;
 const readyPromise=new Promise((resolve,reject)=>ready={resolve,reject}),resultPromise=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});resultPromise.catch(()=>{});readyPromise.catch(()=>{});
 const socket=new Socket(config.api.replace(/^http/,'ws')+'/transcribe-stream?languages=ja,en',{headers:{Origin:'https://hiroakiaa.github.io'}});
 const timeout=setTimeout(()=>{ready.reject(Error('timeout'));rejectResult(Error('timeout'));socket.close();},18000);
 socket.on('open',()=>socket.send(JSON.stringify({type:'auth',token:auth.idToken})));
 socket.on('message',raw=>{const data=JSON.parse(String(raw));if(data.type==='ready'){row.openMs=Date.now()-start;ready.resolve();}if(data.type==='error'){row.failure=data.code;ready.reject(Error(data.code));rejectResult(Error(data.code));}if(data.type==='uncertain'){row.failure='uncertain';rejectResult(Error('uncertain'));}if(data.type==='result'){resultAt=Date.now();row.text=data.text;row.language=data.language;row.segmentCount=data.segmentCount;resolveResult(data);}});
 socket.on('error',()=>{row.failure='network';ready.reject(Error('network'));rejectResult(Error('network'));});socket.on('close',()=>{closed=true;if(!resultAt){ready.reject(Error('closed'));rejectResult(Error('closed'));}});
 try{await readyPromise;for(let at=0;at<pcm.length;at+=3200){if(closed)throw Error('closed');const packet=Buffer.alloc(3200);pcm.copy(packet,0,at,Math.min(at+3200,pcm.length));const voice=lastVoicedAt(new Int16Array(packet.buffer,packet.byteOffset,1600),Date.now()+100);if(voice!==null)lastSpeechAt=voice;socket.send(packet);await new Promise(r=>setTimeout(r,100));}endedAt=Date.now();let silence=0;const ticker=setInterval(()=>{if(!closed&&silence++<50)socket.send(Buffer.alloc(3200));},100);try{await resultPromise;}finally{clearInterval(ticker);}row.afterAudioMs=resultAt-endedAt;row.afterSpeechMs=lastSpeechAt===null?null:resultAt-lastSpeechAt;row.passed=row.language===c.language&&c.patterns.every(p=>new RegExp(p,'iu').test(row.text));}
 catch(e){row.failure??=e.message;row.passed=false;}
 finally{clearTimeout(timeout);if(!closed){socket.send(JSON.stringify({type:'stop'}));socket.close();}}
 rows.push(row);console.log(JSON.stringify(row));await fs.writeFile(path.join(root,'realtime.json'),JSON.stringify({notRealUserAccuracy:true,rows},null,2));if(['auth','quota','billing','model','network'].includes(row.failure))break;
}
