import assert from 'node:assert/strict';
import {speechInput,speechBudget,synthesizeFilipino} from '../server/cloud-speech.js';
import {CloudSpeechPlayer,createSpeechCache} from '../web/cloud-speech-player.js';
function storage(){const rows=new Map();let chain=Promise.resolve();return {rows,transaction(fn){const run=chain.then(()=>fn({get:async key=>structuredClone(rows.get(key)),put:async(key,value)=>rows.set(key,structuredClone(value))}));chain=run.catch(()=>{});return run;}};}
assert.equal(speechInput({language:'tl',text:' Magandang umaga. '}).text,'Magandang umaga.');
assert.throws(()=>speechInput({language:'en',text:'Hello'}));assert.throws(()=>speechInput({language:'fil',text:'a'.repeat(1201)}));
const db=storage(),now=Date.UTC(2026,9,20);
const first=await speechBudget(db,{action:'reserve',uid:'user',characters:100},now);await speechBudget(db,{action:'release',id:first.id},now);
assert.equal((await speechBudget(db,{action:'status'},now)).usedCharacters,100);
assert.equal(JSON.stringify(db.rows.get('speech-budget')).includes('Magandang'),false);
db.rows.get('speech-budget').used=499900;
const raced=await Promise.allSettled(['a','b'].map(uid=>speechBudget(db,{action:'reserve',uid,characters:100},now)));
assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);assert.equal((await speechBudget(db,{action:'status'},now)).usedCharacters,500000);
assert.equal((await speechBudget(db,{action:'status'},Date.UTC(2026,10,1))).usedCharacters,0);
const synthesisDb=storage();
const env={GOOGLE_TTS_API_KEY:'test-only',budgetUid:'user',ROOMS:{
 idFromName:n=>n,
 get:()=>({fetch:async request=>{
  try{return Response.json(await speechBudget(synthesisDb,await request.json(),now));}
  catch(e){return Response.json({error:e.message},{status:e.status});}
 }})
}};
let called=0;await assert.rejects(()=>synthesizeFilipino(env,{language:'fil',text:'Kumusta?'},async()=>{called++;return new Response('failed',{status:500});}));
assert.equal(called,1);assert.equal((await speechBudget(synthesisDb,{action:'status'},now)).usedCharacters,8);
const result=await synthesizeFilipino(env,{language:'tl',text:'Salamat.'},async(url,options)=>{assert.equal(url,'https://texttospeech.googleapis.com/v1/text:synthesize');assert.equal(options.headers['X-Goog-Api-Key'],'test-only');const body=JSON.parse(options.body);assert.equal(body.voice.name,'fil-PH-Wavenet-A');assert.equal(body.input.text,'Salamat.');assert.equal(body.input.ssml,undefined);return Response.json({audioContent:'aGVsbG8='});});assert.equal(result.voice,'fil-PH-Wavenet-A');
let loads=0;const cache=createSpeechCache(async()=>{loads++;return {audioContent:'aGVsbG8='};},{maxEntries:1});await cache('A','fil');await cache('A','fil');assert.equal(loads,1);await cache('B','fil');await cache('A','fil');assert.equal(loads,3);
const audios=[],errors=[];let resolveLoad;class Audio{constructor(){audios.push(this);this.duration=2;this.currentTime=0;}play(){return Promise.resolve();}pause(){}removeAttribute(){}load(){}}
const p=new CloudSpeechPlayer({engine:{getVoices:()=>[],cancel(){}},Utterance:class{},cloud:{enabled:()=>true,Audio,load:()=>new Promise(resolve=>{resolveLoad=resolve;})},onError:e=>errors.push(e)});
p.toggle('old','Kumusta?','fil');assert.equal(p.loading,true);p.stop();resolveLoad({audioContent:'aGVsbG8='});await new Promise(resolve=>setImmediate(resolve));assert.equal(p.key,null);assert.equal(audios[0].onended,null);
p.toggle('new','Salamat.','fil');resolveLoad({audioContent:'aGVsbG8='});await new Promise(resolve=>setImmediate(resolve));const current=audios.at(-1);current.onplaying();assert.equal(p.loading,false);p.toggle('new','Salamat.','fil');assert.equal(p.paused,true);current.onended();assert.equal(p.key,null);assert.deepEqual(errors,[]);
console.log('Cloud speech: Filipino-only synthesis, atomic monthly caps, conservative failures, cache and stale playback passed');
