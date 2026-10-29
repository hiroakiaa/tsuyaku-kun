import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from '../web/config.js';
import {encodeWav} from '../web/caption-server.js';
import {validWav,hasSpeechEnergy} from '../server/audio.js';
function canonicalWav(raw){
 if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV fixture');let audio,format;
 for(let at=12;at+8<=raw.length;){const kind=raw.toString('ascii',at,at+4),size=raw.readUInt32LE(at+4),start=at+8;if(start+size>raw.length)throw Error('Truncated WAV fixture');if(kind==='fmt ')format=raw.subarray(start,start+size);if(kind==='data')audio=raw.subarray(start,start+size);at=start+size+(size%2);}
 if(!format||format.length<16||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==1||format.readUInt32LE(4)!==16000||format.readUInt16LE(14)!==16||!audio||audio.length%2)throw Error('Expected 16kHz mono PCM16');
 const samples=new Int16Array(audio.length/2);for(let i=0;i<samples.length;i++)samples[i]=audio.readInt16LE(i*2);const wav=new Uint8Array(encodeWav(samples));if(!validWav(wav)||!hasSpeechEnergy(wav))throw Error('Fixture must contain speech');return wav;
}
if(!process.argv.includes('--live'))throw Error('Explicit --live required; this comparison consumes the existing app recognition budget.');
const root=path.resolve(process.argv.find(x=>x.startsWith('--fixtures='))?.slice(11)||'checks/recognition-probe');
const cases=JSON.parse((await fs.readFile(path.join(root,'cases.json'),'utf8')).replace(/^\uFEFF/,''));
if(!Array.isArray(cases)||cases.length!==4)throw Error('Expected four synthetic fixtures');
const fixtures=await Promise.all(cases.map(async c=>{if(!/^(ja|en)-[a-z]+$/.test(c.id))throw Error('Bad fixture id');const bytes=canonicalWav(await fs.readFile(path.join(root,c.id+'.wav')));if(bytes.length<1000||bytes.length>160044)throw Error('Fixture must be below five seconds');return {...c,bytes};}));
const origin='https://hiroakiaa.github.io',auth=await(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.firebase.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}),signal:AbortSignal.timeout(10000)})).json();if(!auth.idToken)throw Error('Anonymous authentication unavailable');
const results=[];
for(let round=0;round<2;round++)for(const c of fixtures)for(const profile of round?['beam1','baseline']:['baseline','beam1']){
 const started=Date.now(),response=await fetch(config.api+'/transcribe?language=auto&languages=ja,en&profile='+profile,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+auth.idToken,'Content-Type':'audio/wav'},body:c.bytes,signal:AbortSignal.timeout(15000)});let data;try{data=await response.json();}catch{throw Error('Non-JSON recognition response')}
 if(!response.ok)throw Error('Recognition stopped: HTTP '+response.status+' '+(data.aiFailure?.reason||''));
 if(data.recognitionTiming?.profile!==profile)throw Error('Deployed server does not expose the selected comparison profile');
 const passed=data.language===c.language&&data.languageUncertain!==true&&c.patterns.every(p=>new RegExp(p,'iu').test(data.text));const row={round:round+1,fixture:c.id,profile,clientMs:Date.now()-started,providerMs:data.recognitionTiming.providerMs,budgetWaitMs:data.recognitionTiming.budgetWaitMs,serverBuild:data.recognitionTiming.serverBuild,language:data.language,passed,text:data.text};results.push(row);console.log(JSON.stringify(row));
}
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
for(const profile of ['baseline','beam1']){const rows=results.filter(r=>r.profile===profile);console.log(JSON.stringify({profile,samples:rows.length,passed:rows.filter(r=>r.passed).length,medianProviderMs:median(rows.map(r=>r.providerMs)),medianClientMs:median(rows.map(r=>r.clientMs)),maxProviderMs:Math.max(...rows.map(r=>r.providerMs))}));}
await fs.writeFile(path.join(root,'comparison.json'),JSON.stringify({synthetic:true,notRealUserAccuracy:true,results},null,2));
