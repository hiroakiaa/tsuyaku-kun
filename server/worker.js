import {azureConfig,azureLanguages,azureTranslate,azureBudget,azureOperation} from './azure-translator.js';
import {realtimeUpgrade} from './realtime-recognition.js';
import {recognitionDecoding} from './recognition-policy.js';
import {createCatalogCache,exposeCatalog} from './catalog-cache.js';
import {translationInstructions} from './translation-instructions.js';
import {resolveSpeechLanguage,recognitionLanguage} from '../web/two-language.js';
import {isBillingAdministrator,cloudflareBillingReport,googleBillingReport} from './billing-report.js';
import {translatePhotoBlocks} from './photo-translation.js';
import {photoBudget,photoOperation,photoUid,recognizePhoto} from './photo-ocr.js';
import {speechBudget,speechOperation,synthesizeFilipino} from './cloud-speech.js';
import {wordStats,validateWordEvents} from './word-stats.js';
import {inspectTranslations} from '../web/translation-quality.js';
import {guardedAi,budgetOperation} from './ai-budget.js';
import {resourceFailure} from '../web/resource-policy.js';
import {protectUncertainSpeech,restoreUncertainSpeech,schoolContextHints} from './quality.js';
import {safeRecognitionHints,recognitionHints} from '../web/recognition-hints.js';
import {storedTranslations,correctionHints} from './dictionary.js';
const BUILD_ID='20261031-azure-free-1';
const AI_MODELS=new Set(['@cf/google/gemma-4-26b-a4b-it','@cf/openai/whisper-large-v3-turbo','@cf/openai/whisper','@cf/deepgram/nova-3']);
export function aiFailure(error){
 const chain=[],pending=[error];for(let i=0;i<8&&pending.length;i++){const value=pending.shift();if(!value||chain.includes(value))continue;chain.push(value);if(value.cause)pending.push(value.cause);if(Array.isArray(value.errors))pending.push(...value.errors.slice(0,4));}
 const local=chain.find(e=>e.appBudget);if(local)return {reason:local.aiReason==='busy'?'overloaded':'quota',code:null,message:local.message,evidence:'unclassified',scope:'app',limit:local.aiReason==='busy'?'concurrent':'daily',...(AI_MODELS.has(error?.model)?{model:error.model}:{})};
 const text=chain.map(e=>String(e?.message||'')).join(' ');
 const numeric=chain.flatMap(e=>[e?.code,e?.internalCode]).map(Number).find(n=>Number.isInteger(n)&&n>=1000&&n<=9999);
 const match=/\b(3036|3040|5035|5004|5007|3003|3006|3007|3008|3023|3041|3042|5016|5018)\b/.exec(text);const code=numeric??(match?Number(match[1]):null);
 const reason=code===3036?'quota':code===3040?'overloaded':code===5035?'billing':[5004,3003,3006].includes(code)?'input':[5007,3042].includes(code)?'model':[3023,3041,5016,5018].includes(code)?'auth':[3007,3008].includes(code)?'timeout':/daily.*(?:allocation|limit)|quota.*(?:exceed|exhaust)|used up.*neurons/i.test(text)?'quota':/requires.*paid|billing|payment/i.test(text)?'billing':/capacity.*exceed|out of capacity/i.test(text)?'overloaded':/schema|invalid|parameter/i.test(text)?'input':/model.*(?:unavailable|not found|not supported)/i.test(text)?'model':'service';
 const messages={quota:'Cloudflare AIが無料枠の上限を報告しています。管理画面の残量との一致は未確認です。',billing:'このAIモデルは有料プランが必要です。',overloaded:'AIサービスが混雑しています。',input:'AIへの音声・文章の形式を確認する必要があります。',model:'AIモデルを利用できません。',auth:'AIサービスがこのアカウントの利用を拒否しています。',timeout:'AIサービスの処理が時間切れになりました。',service:'AIサービスが処理できませんでした。'};
 return {reason,code,message:messages[reason],evidence:code?'provider_code':reason!=='service'?'provider_message':'unclassified',...(AI_MODELS.has(error?.model)?{model:error.model}:{})};
}
export async function runAi(env,model,input){
 try{if(env.executionValid&&!await env.executionValid())throw Error('処理の有効期限が切れました。');return await guardedAi(env,model,input,async()=>{if(env.executionValid&&!await env.executionValid())throw Error('処理の有効期限が切れました。');const providerStarted=Date.now();let result;try{result=await env.AI.run(model,input);}finally{if(env.translationTiming)env.translationTiming.providerMs=(env.translationTiming.providerMs||0)+Date.now()-providerStarted;}if(result?.success===false||result?.errors?.length){const error=Error('AI response error');error.errors=result.errors;throw error;}return result;});}catch(error){const wrapped=Error(error?.message||'AI request failed',{cause:error});wrapped.model=model;throw wrapped;}
}
export function translationBudget(text,targetCount){return Math.min(4096,Math.max(128,Math.ceil(text.length*2.5+40)*targetCount));}
export function requestExecutionValid(request,started,now=Date.now()){return !request.signal?.aborted&&now<started+25000;}
const phraseKey=text=>String(text||'').normalize('NFC').trim().replace(/。$/,'');
export async function recognizeAudio(env,bytes,language,termHints=[],candidates=[]){
 language=spokenLanguage(language);
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        const hints=[...new Set([...termHints,...(candidates.length?[]:recognitionHints(catalog,language))])].slice(0,30).join('、').slice(0,400);
        let result;try{result=await runAi(env,'@cf/openai/whisper-large-v3-turbo',{audio:btoa(binary),...(candidates.length?{}:{language:recognitionLanguage(language)}),task:'transcribe',...(candidates.length?{}:{initial_prompt:hints}),vad_filter:true,beam_size:recognitionDecoding(env.recognitionProfile).beamSize,condition_on_previous_text:false,no_speech_threshold:.35,compression_ratio_threshold:2.4,log_prob_threshold:-1,hallucination_silence_threshold:.6});}catch(firstError){if(candidates.length||!['input','model'].includes(aiFailure(firstError).reason))throw firstError;try{result=await runAi(env,'@cf/openai/whisper',{audio:Array.from(bytes)});}catch(secondError){throw secondError;}}

 return result;
}
import {LessonCodes,ROOM_TTL} from './lesson-codes.js';
import {captionParticipant,spokenLanguage,withEasyJapanese} from '../web/core.js';
import {verifyToken} from './auth.js';
import {catalog} from './catalog.js';
import {validWav,hasSpeechEnergy,cleanRecognition} from './audio.js';
import {glossaryFor,translationField,parseTranslation,validateCaption} from '../web/core.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const error=(text,status=400)=>json({error:text},status);
const rid=/^[a-f0-9]{32}$/;
async function body(request,max=32768){const reader=request.body?.getReader();if(!reader)throw Error('データがありません。');let s='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw Error('データが大きすぎます。');}s+=decoder.decode(r.value,{stream:true});}s+=decoder.decode();return JSON.parse(s);}finally{reader.releaseLock();}}
async function bridge(env,token,action,extra={}){if(!env.SHEETS_BRIDGE)return null;const r=await fetch(env.SHEETS_BRIDGE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,idToken:token,...extra}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('辞書との接続を確認してください。');const result=await r.json();if(result.error)throw Error(result.error);return result;}
const sharedCatalogCache=createCatalogCache(catalog);
async function loadSharedCatalog(env,token){return sharedCatalogCache.refresh(env.SHEETS_BRIDGE,()=>bridge(env,token,'tsuyakuCatalog'));}
export function catalogForTranslation(env,token,ctx){const snapshot=sharedCatalogCache.peek(env.SHEETS_BRIDGE);if(env.SHEETS_BRIDGE&&ctx?.waitUntil&&!snapshot.fresh)ctx.waitUntil(loadSharedCatalog(env,token));return snapshot;}
export async function translateText(env,text,source,targets,context=[],unit='',data=catalog,onUsage=()=>{}){
  const knownCatalog=data._catalog,metadata=env.catalogMetadata||{catalogSource:data===catalog?'bundled':['spreadsheet','bundled'].includes(knownCatalog?.source)?knownCatalog.source:'unmeasured',...(/^c1-[a-f0-9]{8}$/.test(knownCatalog?.revision||'')?{catalogRevision:knownCatalog.revision}:{})};const timing={...metadata,serverBuild:BUILD_ID,dictionaryMs:null,aiTotalMs:null,providerMs:null,budgetWaitMs:null,budgetSettleMs:null,parseMs:null,authMs:env.authMs??null};let scenario;const reportUsage=onUsage;onUsage=u=>reportUsage({...u,translationTiming:timing,...(scenario?{translationScenario:scenario}:{})});env={...env,translationTiming:timing};
  source=spokenLanguage(source);
  const unique=[...new Set(targets)].filter(c=>c!==source);scenario={version:1,source,targets:[...unique].sort(),aiTargets:[],characters:[...text].length};
  const out={[source]:text};if(!unique.length){onUsage({inputTokens:0,outputTokens:0,cacheHit:true});return out;}
  const dictionaryStarted=Date.now();const stored=storedTranslations(text,source,unique,data,unit==='数学'||unit.includes('方程式')?'math':unit);
  timing.dictionaryMs=Date.now()-dictionaryStarted;Object.assign(out,stored.translations);
  const missing=unique.filter(c=>!out[c]);scenario.aiTargets=[...missing].sort();
  if(!missing.length){onUsage({inputTokens:0,outputTokens:0,cacheHit:true,cacheSource:stored.builtin?'builtin':'spreadsheet',bankKeys:stored.keys});return out;}
  if(env.translationEconomy&&env.AZURE_TRANSLATOR_F0&&azureLanguages(source,missing)){const start=Date.now();try{return {...out,...await azureTranslate(env,text,source,missing,onUsage)};}finally{timing.providerMs=Date.now()-start;timing.aiTotalMs=timing.providerMs;}}
  const terms=glossaryFor(text,data.glossary||[]);
  const protectedSpeech=protectUncertainSpeech(text);
  const messages=[{role:'system',content:translationInstructions(missing,protectedSpeech.spans.length>0)},{role:'user',content:JSON.stringify({source,targets:missing,...(schoolContextHints(text,source).length?{schoolMeanings:schoolContextHints(text,source)}:{}),correctionHints:correctionHints(text,data.corrections,unit==='数学'||unit.includes('方程式')?'math':unit),unit:unit.slice(0,160),glossary:terms,context:context.slice(-3),speech:protectedSpeech.speech})}];
  onUsage({inputTokens:Math.ceil(messages.map(m=>m.content).join('').length/2),outputTokens:0,estimated:true,unknown:true});
  const aiStarted=Date.now();let result;try{result=await runAi(env,'@cf/google/gemma-4-26b-a4b-it',{messages,temperature:0,max_completion_tokens:translationBudget(text,missing.length),store:false,chat_template_kwargs:{enable_thinking:false}});}finally{timing.aiTotalMs=Date.now()-aiStarted;}
  const raw=result.response||result.choices?.[0]?.message?.content||'';const u=result.usage;const measured=Number.isFinite(u?.prompt_tokens)&&Number.isFinite(u?.completion_tokens);onUsage({inputTokens:measured?u.prompt_tokens:Math.ceil(messages.map(m=>m.content).join('').length/2),outputTokens:measured?u.completion_tokens:Math.ceil(raw.length/2),estimated:!measured,unknown:false});
  const parseStarted=Date.now();try{return {...out,...restoreUncertainSpeech(parseTranslation(result.response||result.choices?.[0]?.message?.content||'',missing),text,protectedSpeech.spans)};}finally{timing.parseMs=Date.now()-parseStarted;}
}
export default {async fetch(request,env,ctx){
  const requestStarted=Date.now(),origin=request.headers.get('Origin'),url=new URL(request.url);
  const allowed=origin===env.ALLOWED_ORIGIN||origin==='http://localhost:8787';
  const cors=response=>{const h=new Headers(response.headers);if(allowed){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Headers','Content-Type, Authorization, X-Term-Hints');h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');h.set('Vary','Origin');}return new Response(response.body,{status:response.status,headers:h});};
  if(request.method==='OPTIONS')return allowed?cors(new Response(null,{status:204})):error('接続元を確認してください。',403);
  if(url.pathname==='/health')return cors(json({ok:true,app:'通訳君',version:'0.6.9',build:BUILD_ID,safety:'20261008-lifecycle-1',sheets:!!env.SHEETS_BRIDGE}));
  if(!allowed)return error('接続元を確認してください。',403);
  try{

    const match=url.pathname.match(/^\/rooms\/([a-f0-9]{32})(\/socket)?$/);
    if(match){if(env.REQUEST_LIMIT&&!((await env.REQUEST_LIMIT.limit({key:'socket:'+(request.headers.get('CF-Connecting-IP')||'local')})).success))return cors(error('少し待ってから再試行してください。',429));const room=env.ROOMS.get(env.ROOMS.idFromName(match[1]));const r=await room.fetch(request);return r.status===101?r:cors(r);}
    if(url.pathname==='/transcribe-stream')return realtimeUpgrade(request,env,{verifyToken,aiFailure,ctx});
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');const authStarted=Date.now(),auth=await verifyToken(token,env.FIREBASE_PROJECT,url.pathname.startsWith('/billing/'));env={...env,authMs:Date.now()-authStarted,budgetUid:auth.uid,executionValid:()=>requestExecutionValid(request,requestStarted)};if(env.REQUEST_LIMIT&&!((await env.REQUEST_LIMIT.limit({key:'user:'+auth.uid})).success))return cors(error('少し待ってから再試行してください。',429));
    if(url.pathname.startsWith('/billing/')){
      if(!await isBillingAdministrator(auth,env.BILLING_ADMIN_EMAIL_HASH))return cors(error('請求データは管理者本人のGoogle認証が必要です。',403));
      if(request.method!=='GET')return cors(error('読取だけ利用できます。',405));
      if(url.pathname==='/billing/access')return cors(json({readMethod:'tabledata.list',paidQueries:false}));
      if(url.pathname==='/billing/google')return cors(json(await googleBillingReport(env)));
      if(url.pathname==='/billing/cloudflare')return cors(json(await cloudflareBillingReport(env)));
      return cors(error('請求の操作を確認してください。',404));
    }
    if(url.pathname.startsWith('/photo/')){try{
      if(url.pathname==='/photo/status'&&request.method==='GET')return cors(json({enabled:!!env.GOOGLE_VISION_API_KEY,...await photoOperation(env,{action:'status',uid:await photoUid(auth.uid)})}));
      if(url.pathname==='/photo/recognize'&&request.method==='POST')return cors(json(await recognizePhoto(env,await body(request,2810000))));
      if(url.pathname==='/photo/translate'&&request.method==='POST'){
       try{return cors(json(await translatePhotoBlocks(await body(request,24000),catalog,input=>runAi(env,'@cf/google/gemma-4-26b-a4b-it',input))));}
       catch(e){if(e.status)throw e;const failure=aiFailure(e);return cors(json({error:failure.message,aiFailure:failure},failure.reason==='quota'?429:502));}
      }
      return cors(error('写真の操作を確認してください。',404));
    }catch(e){return cors(error(e.message||'写真を読み取れませんでした。',e.status||502));}}
    if(url.pathname==='/translation/free-status'&&request.method==='GET'){let config;try{config=azureConfig(env);}catch{return cors(json({enabled:false,expired:true}));}return cors(json(config?{enabled:true,expiresAt:config.expiresAt,...await azureOperation(env,{action:'status',uid:await photoUid(auth.uid)})}:{enabled:false}));}
    if(url.pathname==='/speech/status'&&request.method==='GET')return cors(json({enabled:!!env.GOOGLE_TTS_API_KEY,voice:'fil-PH-Wavenet-A',...await speechOperation(env,{action:'status',uid:await photoUid(auth.uid)})}));
    if(url.pathname==='/speech/synthesize'&&request.method==='POST'){try{return cors(new Response(JSON.stringify(await synthesizeFilipino(env,await body(request,16000))),{headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}}));}catch(e){return cors(error(e.message||'音声を準備できませんでした。',e.status||502));}}
    if(['/usage/budget','/usage/monthly'].includes(url.pathname)&&request.method==='GET'){
      const budget=env.ROOMS.get(env.ROOMS.idFromName('__ai_budget_v1__'));
      const response=await budget.fetch(new Request('https://budget/budget',{method:'POST',body:JSON.stringify({action:url.pathname==='/usage/monthly'?'monthly':'status',uid:auth.uid})}));
      const result=cors(json(await response.json(),response.status));result.headers.set('Cache-Control','no-store');return result;
    }
    if(url.pathname==='/transcribe'&&request.method==='POST'){
      const language=url.searchParams.get('language')||'ja',automatic=language==='auto',candidates=automatic?[...new Set((url.searchParams.get('languages')||'').split(','))]:[];if(automatic?(!candidates.length||candidates.length>2||candidates.some(code=>!catalog.languages.some(l=>l.code===code))):!catalog.languages.some(l=>l.code===language))return cors(error('言語を確認してください。'));
      const recognitionProfile=url.searchParams.get('profile')||'baseline';try{recognitionDecoding(recognitionProfile);}catch{return cors(error('認識方式を確認してください。'));}
      if(request.headers.get('Content-Type')!=='audio/wav')return cors(error('音声形式を確認してください。',415));
      const recognitionTiming={profile:recognitionProfile,serverBuild:BUILD_ID,authMs:env.authMs??null,uploadMs:null,preprocessMs:null,providerMs:null,budgetWaitMs:null,budgetSettleMs:null,totalMs:null,aiCalled:false},uploadStarted=Date.now();
      const timed=data=>{recognitionTiming.totalMs=Date.now()-requestStarted;return {...data,recognitionTiming};};
      const reader=request.body.getReader(),chunks=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>512044){await reader.cancel();return cors(error('音声が長すぎます。',413));}chunks.push(r.value);}}finally{reader.releaseLock();}
      recognitionTiming.uploadMs=Date.now()-uploadStarted;const preprocessStarted=Date.now();
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;c.fill(0);}
      try{if(!validWav(bytes))return cors(error('音声形式を確認してください。',415));if(!hasSpeechEnergy(bytes)){recognitionTiming.preprocessMs=Date.now()-preprocessStarted;return cors(json(timed({text:''})));}
        recognitionTiming.preprocessMs=Date.now()-preprocessStarted;recognitionTiming.aiCalled=true;
        const result=await recognizeAudio({...env,recognitionProfile,translationTiming:recognitionTiming},bytes,automatic?candidates[0]:language,safeRecognitionHints(request.headers.get('X-Term-Hints')),candidates);
        const detected=automatic?resolveSpeechLanguage(result,candidates):language;const text=cleanRecognition(result,detected||'');if(text===null)return cors(error('音声を認識できませんでした。',502));return cors(json(timed({text,...(automatic?{language:detected,languageUncertain:!!text&&!detected}:{})})));
      }catch(e){const failure=aiFailure(e);return cors(json(timed({error:failure.message,aiFailure:failure,recognitionCode:failure.reason}),failure.reason==='quota'?429:['billing','auth'].includes(failure.reason)?403:502));}finally{bytes.fill(0);}
    }
    if(url.pathname==='/translate'&&request.method==='POST'){
      const data=await body(request,16000),text=String(data.text||'').trim(),source=String(data.source||'');
      const targets=[...new Set(Array.isArray(data.targets)?data.targets:[])];
      if(!text||text.length>1200||!catalog.languages.some(l=>l.code===source)||!targets.length||targets.length>4||targets.some(c=>!catalog.languages.some(l=>l.code===c)))return cors(error('ことばと言語を確認してください。'));
      const context=(Array.isArray(data.context)?data.context:[]).slice(-3).filter(x=>typeof x==='string').map(x=>x.slice(0,480));
      let usage={},started=Date.now();
      const dictionary=catalogForTranslation(env,token,ctx),clientRevision=/^c1-[a-f0-9]{8}$/.test(data.catalogRevision||'')?data.catalogRevision:null;const catalogMetadata={catalogSource:dictionary.source,catalogRevision:dictionary.revision,catalogAgeMs:dictionary.ageMs,catalogFresh:dictionary.fresh,catalogMatch:clientRevision?clientRevision===dictionary.revision:null};
      try{const translations=await translateText({...env,catalogMetadata,translationEconomy:data.translationMode==='economy'},text,source,targets,context,String(data.unit||'').slice(0,160),dictionary.data,u=>{usage=u;});return cors(json({translations,quality:inspectTranslations(text,source,targets,translations),usage,latencyMs:Date.now()-started}));}
      catch(e){const failure=e.azureFailure||aiFailure(e);return cors(json({error:failure.message,aiFailure:failure,usage},failure.reason==='quota'?429:['billing','auth'].includes(failure.reason)?403:502));}
    }
    if(url.pathname==='/ui-labels'&&request.method==='GET'){const result=await bridge(env,token,'tsuyakuUiLabels');if(!result?.labels)return cors(error('画面表記を取得できませんでした。',503));return cors(json({labels:result.labels,updatedAt:result.updatedAt}));}
    if(url.pathname==='/catalog'&&request.method==='GET')return cors(json(exposeCatalog(await loadSharedCatalog(env,token))));
    if(url.pathname==='/dictionary/translate'&&request.method==='POST'){
      const data=await body(request,4096),text=String(data.text||'').trim(),language=String(data.language||'');
      if(!text||text.length>1500||!catalog.languages.some(l=>l.code===language))return cors(error('ことばと言語を確認してください。'));
      const dictionary=await loadSharedCatalog(env,token),dataCatalog=dictionary.data;
      const stored=storedTranslations(text,'ja',[language],dataCatalog,String(data.subject||''));const term=(dataCatalog.terms||[]).find(row=>row.ja===text);
      const translation=stored.translations[language]||term?.[translationField(language)]||(language==='en'?term?.en:language==='ja'?text:null);
      if(typeof translation!=='string'||!translation.trim()||/^[#=]/.test(translation))return cors(error('この言語の訳はまだ辞書にありません。スプレッドシートの訳を追加してください。',404));
      return cors(json({translation,usage:{inputTokens:0,outputTokens:0,cacheHit:true},latencyMs:0,source:'spreadsheet'}));
    }
        if(url.pathname==='/lessons/join'&&request.method==='POST'){const data=await body(request);const directory=env.ROOMS.get(env.ROOMS.idFromName('__lesson_codes_v1__'));const response=await directory.fetch(new Request('https://room/codes/find',{method:'POST',body:JSON.stringify({code:data.code})}));const found=await response.json();if(!response.ok)return cors(json({error:found.error,errorCode:found.errorCode||'lesson_unavailable'},response.status));const live=await env.ROOMS.get(env.ROOMS.idFromName(found.id)).fetch(new Request('https://room/status'));const info=await live.json();if(!live.ok||info.ended)return cors(json({error:'この授業は終了しました。先生に新しいルームIDを確認してください。',errorCode:'lesson_ended'},410));return cors(json({...found,unit:info.unit}));}
    if(url.pathname==='/rooms'&&request.method==='POST'){
      const data=await body(request);if(!['interpreter','lesson','face'].includes(data.mode))return cors(error('モードを選んでください。'));

      const id=crypto.randomUUID().replaceAll('-',''),key=crypto.randomUUID().replaceAll('-','');
      const directory=env.ROOMS.get(env.ROOMS.idFromName('__lesson_codes_v1__'));let reservation;if(data.mode==='lesson'){const response=await directory.fetch(new Request('https://room/codes/allocate',{method:'POST',body:JSON.stringify({id,key})}));reservation=await response.json();if(!response.ok)throw Error(reservation.error);}const expires=reservation?.expires||Date.now()+ROOM_TTL;const result=await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request('https://room/init',{method:'POST',body:JSON.stringify({id,key,owner:auth.uid,mode:data.mode,groupChat:data.mode==='interpreter'&&data.groupChat===true,code:reservation?.code,unit:String(data.unit||'数学').slice(0,160),expires})}));
      if(!result.ok){if(reservation)await directory.fetch(new Request('https://room/codes/release',{method:'POST',body:JSON.stringify({code:reservation.code,id})}));return cors(result);}return cors(json({id,key,mode:data.mode,code:reservation?.code,expires}));
    }
    if(url.pathname==='/dictionary/stats'&&['GET','POST'].includes(request.method)){const data=request.method==='POST'?{events:validateWordEvents((await body(request,12000)).events)}:null;const stats=env.ROOMS.get(env.ROOMS.idFromName('__dictionary_stats_v1__'));return cors(await stats.fetch(new Request('https://room/word-stats',{method:data?'POST':'GET',...(data?{body:JSON.stringify(data)}:{})})));}
    if(url.pathname==='/dictionary/usage'&&request.method==='POST'){const data=await body(request,4096);return cors(json(await bridge(env,token,'tsuyakuUsage',{kind:data.kind,id:data.id})||{ok:false}));}
    if(url.pathname==='/dictionary/phrase'&&request.method==='POST'){const data=await body(request,16000);return cors(json(await bridge(env,token,'tsuyakuPhrase',{text:data.text,translations:data.translations})||{ok:false}));}
    if(url.pathname==='/dictionary/candidate'&&request.method==='POST'){

      const data=await body(request);const term=String(data.term||'').trim(),translation=String(data.translation||'').trim();
      if(!term||term.length>80||translation.length>500)return cors(error('ことばと訳を確認してください。'));
      let result;try{result=await bridge(env,token,'tsuyakuCandidate',{term,translation,language:String(data.language||'en'),subject:'math'});}catch{return cors(error('辞書への追記接続を確認してください。候補はまだ登録されていません。',503));}
      return cors(result?json(result):error('辞書の追記接続がまだ設定されていません。',503));
    }
    return cors(error('ページが見つかりません。',404));
  }catch(e){const failure=resourceFailure(e);if(failure)return cors(json({error:failure.message,resourceFailure:{reason:failure.reason,retryable:false}},failure.status));return cors(error(e.message||'接続を確認してください。',400));}
}};
export class TranslationRoom {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.jobs=new Map();this.queuedCaptions=new Map();this.cachedCatalog=catalog;this.catalogUntil=0;this.activeTranslations=0;this.aiBlockedUntil=0;if(ctx.setWebSocketAutoResponse&&typeof WebSocketRequestResponsePair!=='undefined')ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}','{"type":"pong"}'));}
  async scheduleAlarm(room){
    room??=await this.info();if(!room)return;
    let next=room.expires;
    for(const ws of this.ctx.getWebSockets()){
      const a=ws.deserializeAttachment();if(a?.left||ws.readyState!==undefined&&ws.readyState!==1)continue;
      const deadline=a?.uid?Math.min(a.expires,a.pending?a.requestUntil:Infinity):(a?.opened||Date.now())+10000;
      if(Number.isFinite(deadline))next=Math.min(next,deadline);
    }
    next=Math.max(Date.now()+1,next);
    if(await this.ctx.storage.getAlarm()!==next)await this.ctx.storage.setAlarm(next);
  }
  async info(){return this.ctx.storage.get('room');}
  participants(){return this.ctx.getWebSockets().map(ws=>({ws,a:ws.deserializeAttachment()})).filter(x=>x.a?.uid&&!x.a.left&&!x.a.pending&&(x.ws.readyState===undefined||x.ws.readyState===1));}
  send(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
  broadcast(data){for(const {ws,a} of this.participants())if(this.visibleTo(a,data))this.send(ws,data);}
  visibleTo(a,data){return !['caption','caption_pending','translation'].includes(data.type)||a.chatAfter===undefined||data.id?.startsWith(a.id+'_')||Number.isInteger(data.sequence)&&data.sequence>a.chatAfter;}
  admission(fn){const work=(this.admissionTail||Promise.resolve()).then(fn);this.admissionTail=work.catch(()=>{});return work;}
  waiting(){return this.ctx.getWebSockets().map(ws=>({ws,a:ws.deserializeAttachment()})).filter(p=>p.a?.pending&&!p.a.left&&p.a.requestUntil>Date.now()&&(p.ws.readyState===undefined||p.ws.readyState===1));}
  requests(){const ownerPresent=this.participants().some(({a})=>a.role==='teacher');for(const {ws,a}of this.waiting())this.send(ws,{type:'join_waiting',expires:a.requestUntil,ownerPresent});const requests=this.waiting().map(({a})=>({id:a.id,name:a.name,language:a.language}));for(const {ws,a}of this.participants())if(a.role==='teacher'&&a.chatAfter!==undefined)this.send(ws,{type:'chat_requests',requests});}
  async readyParticipant(ws,room){const a=ws.deserializeAttachment();const history=[...(await this.ctx.storage.list({prefix:'caption:',limit:3000})).values()].filter(r=>this.visibleTo(a,{type:'translation',...r})).sort((x,y)=>(x.sequence??x.at)-(y.sequence??y.at));this.send(ws,{type:'ready',id:a.id,role:a.role,mode:room.mode,groupChat:room.groupChat===true,unit:room.unit,code:room.code,expires:room.expires,ended:!!room.ended,history});this.roster();}
  async admitChat(ws,data){const room=await this.info(),a=ws.deserializeAttachment();if(!room?.groupChat||room.ended||a.left||a.pending||a.uid!==room.owner)throw Error('参加の承認は作成者だけができます。');const target=this.waiting().find(p=>p.a.id===data.to);if(!target)throw Error('この参加リクエストは終了しました。');if(data.allow!==true){this.send(target.ws,{type:'join_declined',text:'作成者が参加を見送りました。'});await this.webSocketClose(target.ws);return;}if(this.participants().length>=5)throw Error('チャットは5人までです。退室後に承認してください。');const count=await this.ctx.storage.get('memberCount')||0;if(count>=30)throw Error('この部屋の参加履歴が上限に達しました。新しい部屋を作ってください。');const member={after:await this.ctx.storage.get('captionCount')||0,name:target.a.customName?target.a.name:'参加者'+(count+1)};await this.ctx.storage.put('member:'+target.a.uid,member);await this.ctx.storage.put('memberCount',count+1);target.ws.serializeAttachment({...target.a,pending:false,chatAfter:member.after,name:member.name});await this.readyParticipant(target.ws,room);await this.scheduleAlarm(room);}

  roster(){this.broadcast({type:'participants',participants:this.participants().map(({a})=>({id:a.id,name:a.name,language:a.language,viewLanguage:a.viewLanguage,role:a.role}))});this.requests();}
  async fetch(request){
    const path=new URL(request.url).pathname;if(path==='/azure-budget'){try{return json(await azureBudget(this.ctx.storage,await body(request,2048)));}catch(e){return json({error:e.message,reason:e.azureFailure?.reason||'service'},e.status||503);}}if(path==='/photo-budget'){try{return json(await photoBudget(this.ctx.storage,await body(request,4096)));}catch(e){return error(e.message,e.status||400);}}if(path==='/speech-budget'){try{return json(await speechBudget(this.ctx.storage,await body(request,2048)));}catch(e){return error(e.message,e.status||400);}}if(path==='/word-stats'){try{return json(await wordStats(this.ctx.storage,request.method==='POST'?(await body(request,12000)).events:null));}catch(e){return error(e.message,400);}}if(path==='/budget'){try{return json(await budgetOperation(this.ctx.storage,await body(request,2048)));}catch(e){return json({reason:e.aiReason||'budget'},429);}}
    if(path.startsWith('/codes/')){try{const codes=new LessonCodes(this.ctx.storage),data=await body(request);if(path==='/codes/allocate')return json(await codes.allocate(data));if(path==='/codes/find')return json(await codes.lookup(data.code));if(path==='/codes/release'){await codes.release(data.code,data.id);return json({ok:true});}return error('操作を確認してください。');}catch(e){return json({error:e.message,...(e.errorCode?{errorCode:e.errorCode}:{})},400);}}
    if(path==='/init'){if(await this.info())return error('ルームは作成済みです。',409);const data=await body(request);await this.ctx.storage.put('room',data);await this.ctx.storage.setAlarm(data.expires);return json({ok:true});}
    const room=await this.info();if(!room||room.expires<=Date.now())return error('このルームは終了しました。',410);
    if(path==='/status')return json({unit:room.unit,ended:!!room.ended});
    if(!path.endsWith('/socket')||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return error('接続方法を確認してください。',426);
    // Unauthenticated sockets occupy a bounded slot and must authenticate within 10 seconds.
    if(this.ctx.getWebSockets().length>=100)return error('ルームが満員です。',429);
    const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({opened:Date.now(),id:crypto.randomUUID(),window:Date.now(),count:0});
    const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>Date.now()+10000)await this.ctx.storage.setAlarm(Date.now()+10000);
    return new Response(null,{status:101,webSocket:pair[0]});
  }
  async webSocketMessage(ws,message){
    try{
      if(typeof message!=='string'||message.length>32768)throw Error('データが大きすぎます。');
      const data=JSON.parse(message),a=ws.deserializeAttachment(),room=await this.info();
      if(!room||room.expires<=Date.now())throw Error('ルームが終了しました。');
      if(!a.uid){
        if(data.type!=='auth'||Date.now()-a.opened>10000)throw Error('ログインし直してください。');
        const auth=await verifyToken(data.token,this.env.FIREBASE_PROJECT);
        if(data.key!==room.key&&auth.uid!==room.owner)throw Error('招待リンクを確認してください。');
        const lang=String(data.language||'ja');if(!catalog.languages.some(l=>l.code===lang))throw Error('言語を確認してください。');
        if(room.mode==='face'&&auth.uid!==room.owner)throw Error('対面は作成した端末で使います。');const role=auth.uid===room.owner?'teacher':'guest';
        return await this.admission(async()=>{
        if(this.ctx.getWebSockets().some(p=>{const value=p.deserializeAttachment();return value?.uid===auth.uid&&!value.left&&(p.readyState===undefined||p.readyState===1);}))throw Object.assign(Error('別のタブで参加中です。先に開いた通訳君のタブを使うか、そちらを閉じてから再接続してください。'),{code:'duplicate_tab'});
        if(room.mode==='interpreter'&&this.participants().length>=(room.groupChat?5:2))throw Error(room.groupChat?'チャットは5人まで参加できます。':'チャットは2人まで参加できます。');
        if(room.groupChat&&data.chatProtocol!==1)throw Error('ページを更新してから参加してください。');
        const stableId=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.uid)))].slice(0,16).map(x=>x.toString(16).padStart(2,'0')).join('');
        const viewLanguage=room.mode==='interpreter'?lang:String(data.viewLanguage||lang);if(!catalog.languages.some(l=>l.code===viewLanguage))throw Error('表示言語を確認してください。');
        let member=room.groupChat?await this.ctx.storage.get('member:'+auth.uid):null;
        if(room.groupChat&&role==='teacher'&&!member){member={after:0,name:'参加者1'};await this.ctx.storage.put('member:'+auth.uid,member);await this.ctx.storage.put('memberCount',Math.max(1,await this.ctx.storage.get('memberCount')||0));}
        if(room.groupChat&&!member&&this.waiting().length>=5)throw Error('参加の確認が混み合っています。しばらくしてから参加してください。');
        ws.serializeAttachment({...a,...auth,...(room.groupChat?{pending:!member,customName:!!String(data.displayName||'').trim(),requestUntil:Date.now()+120000,chatAfter:member?.after}:{}),id:stableId,token:data.token,name:room.groupChat?(member?.name||String(data.displayName||'').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,20)||'参加希望者'):String(data.name||'参加者').slice(0,40),language:role==='teacher'&&room.mode==='lesson'?'ja':lang,viewLanguage,role});
        await this.scheduleAlarm(room);if(ws.deserializeAttachment().pending){this.send(ws,{type:'join_waiting',ownerPresent:this.participants().some(({a})=>a.role==='teacher'),expires:Date.now()+120000});this.requests();return;}await this.readyParticipant(ws,room);
        if(this.env.SHEETS_BRIDGE&&Date.now()>this.catalogUntil){this.catalogUntil=Date.now()+300000;this.ctx.waitUntil(loadSharedCatalog(this.env,data.token).then(snapshot=>{this.cachedCatalog=exposeCatalog(snapshot);}).catch(()=>{}));}return;});
      }
      if(a.left)return;
      if(data.type==='leave'){await this.webSocketClose(ws);return;}
      if(a.expires<=Date.now())throw Error('ログインし直してください。');
      if(data.type==='reauth'){const auth=await verifyToken(data.token,this.env.FIREBASE_PROJECT);if(auth.uid!==a.uid)throw Error('ログインし直してください。');ws.serializeAttachment({...ws.deserializeAttachment(),...auth,token:data.token});await this.scheduleAlarm(room);return;}
      if(Date.now()-a.window>60000){a.window=Date.now();a.count=0;}if(++a.count>400)throw Error('操作が多すぎます。');ws.serializeAttachment(a);
      if(data.type==='ping'){this.send(ws,{type:'pong'});return;}
      if(a.pending){if(a.requestUntil<=Date.now()){this.send(ws,{type:'join_declined',text:'参加の確認が時間切れになりました。招待リンクから入り直してください。'});await this.webSocketClose(ws);}else this.send(ws,{type:'join_waiting',ownerPresent:this.participants().some(({a})=>a.role==='teacher'),expires:a.requestUntil});return;}
      if(data.type==='chat_admit'){await this.admission(()=>this.admitChat(ws,data));return;}
      if(data.type==='chat_name'&&room.groupChat){const name=String(data.name||'').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,20);if(!name)throw Error('表示名を入力してください。');const member=await this.ctx.storage.get('member:'+a.uid);if(!member)return;await this.ctx.storage.put('member:'+a.uid,{...member,name});ws.serializeAttachment({...ws.deserializeAttachment(),name});this.roster();return;}
      if(data.type==='lesson_unit'&&room.mode==='lesson'){
        if(room.ended)throw Error('この授業は終了しました。');
        if(a.role!=='teacher')throw Error('授業のテーマは先生だけが変更できます。');
        const unit=String(data.unit||'').trim().slice(0,160)||'数学';
        if(unit!==room.unit){await this.ctx.storage.put('room',{...room,unit});this.broadcast({type:'unit_changed',unit});}return;
      }
      if(data.type==='participant_language'&&room.mode==='lesson'){
        if(room.ended)throw Error('この授業は終了しました。');
        const language=String(data.language||''),target=this.participants().find(p=>p.a.id===data.to);
        if(!catalog.languages.some(l=>l.code===language))throw Error('言語を確認してください。');
        if(!target)throw Error('参加者が退室しました。');
        if(target.a.role==='teacher'||a.role!=='teacher'&&target.a.id!==a.id)throw Error('他の生徒の言語は先生だけが変更できます。');
        target.ws.serializeAttachment({...target.a,language,viewLanguage:language});
        this.send(target.ws,{type:'language_changed',language});this.roster();return;
      }
      if(data.type==='language'&&room.mode==='interpreter'){const language=String(data.language||'');if(!catalog.languages.some(l=>l.code===language))throw Error('言語を確認してください。');ws.serializeAttachment({...a,language,viewLanguage:language,name:room.groupChat?a.name:(catalog.languages.find(l=>l.code===language)?.labelJa||'ことば')+'の参加者'});this.roster();return;}
      if(data.type==='caption_received'){return await this.admission(async()=>{
        if(!/^[a-f0-9]{32}_[A-Za-z0-9_-]{1,100}$/.test(String(data.id||''))||!Number.isInteger(data.revision)||data.revision<0)return;
        const saved=await this.ctx.storage.get('caption:'+data.id);if(!saved||!this.visibleTo(a,{type:'translation',...saved})||saved.id.startsWith(a.id+'_')||!['ready','failed'].includes(saved.status)||(saved.revision||0)!==data.revision)return;
        const receipts=saved.receipts||{};if(receipts[a.id]!==data.revision){receipts[a.id]=data.revision;await this.ctx.storage.put('caption:'+data.id,{...saved,receipts});}
        const others=this.participants().filter(p=>!saved.id.startsWith(p.a.id+'_')&&this.visibleTo(p.a,{type:'translation',...saved})),count=others.filter(p=>receipts[p.a.id]===data.revision).length,owner=this.participants().find(p=>saved.id.startsWith(p.a.id+'_'));
        if(owner)this.send(owner.ws,{type:'caption_delivered',id:saved.id,revision:data.revision,count,total:others.length});return;});
      }
      if(data.type==='caption_sync'){
        if(!Array.isArray(data.ids)||data.ids.length>12)return;
        for(const id of new Set(data.ids)){if(typeof id!=='string'||!id.startsWith(a.id+'_')||id.length>140)continue;const saved=await this.ctx.storage.get('caption:'+id);if(!saved)continue;this.send(ws,{type:'caption_accepted',id,revision:saved.revision||0});if(['ready','failed'].includes(saved.status))this.broadcast({type:'translation',...saved});else this.send(ws,{type:'caption_pending',...saved});}return;
      }
      // Ignore audio signaling from older clients: every room delivers text only.
      if(data.type==='signal')return;
      if(data.type==='end'){
        if(a.role!=='teacher')throw Error('先生だけが終了できます。');await this.ctx.storage.put('room',{...room,ended:true});await this.scheduleAlarm(room);this.broadcast({type:'ended'});return;
      }
      if(room.ended)throw Error('この授業は終了しました。');
      if(data.type!=='caption')return;
      if(room.mode==='lesson'&&a.role!=='teacher'&&(data.kind!=='text'||data.final!==true||data.continuing||data.metadataOnly))throw Error('生徒は文字入力で伝えてください。');
      const admission=(this.admissionTail||Promise.resolve()).then(()=>this.acceptCaption(ws,a,room,data));
      this.admissionTail=admission.catch(()=>{});await admission;
    }catch(e){this.send(ws,{type:'error',error:e.message||'接続を確認してください。',...(e.code==='duplicate_tab'?{errorCode:e.code}:{})});if(!ws.deserializeAttachment()?.uid)ws.close(1008,'auth');}
  }
  async acceptCaption(ws,a,room,data){
      const cap=validateCaption(data),id=a.id+'_'+cap.id;
      if(!await this.captionIsLive(ws,room))return;
      if(!cap.final){if(room.groupChat)return;this.broadcast({type:'caption',id,speaker:captionParticipant(room,a,data).name,source:captionParticipant(room,a,data).language,text:cap.text,final:false,revision:cap.revision,continuing:cap.continuing,at:Date.now()});return;}
      const existing=await this.ctx.storage.get('caption:'+id);if(existing?.text===cap.text&&cap.revision<=(existing.revision||0)&&cap.continuing===!!existing.continuing){
        this.send(ws,{type:'caption_accepted',id,revision:existing.revision||0});
        if(['ready','failed'].includes(existing.status))this.broadcast({type:'translation',...existing});
        else if(this.jobs.has(id))this.ctx.waitUntil(this.jobs.get(id).then(async()=>{const saved=await this.ctx.storage.get('caption:'+id);if(['ready','failed'].includes(saved?.status)&&await this.captionIsLive(ws,room))this.send(ws,{type:'translation',...saved});}));
        else if(!this.queuedCaptions.has(id)){const interrupted={...existing,status:'failed',error:'前の翻訳処理の完了を確認できません。必要なら再試行してください。',aiFailure:{reason:'service',evidence:'unclassified'}};await this.ctx.storage.put('caption:'+id,interrupted);this.send(ws,{type:'translation',...interrupted});}
        return;
      }
      if(existing&&cap.revision<(existing.revision||0))return;
      const queued=this.queuedCaptions.get(id);
      if(queued&&cap.revision<queued.cap.revision)return;
      if(data.revision!==undefined&&existing&&cap.revision===(existing.revision||0)&&existing.text!==cap.text)return;
      if(this.queuedCaptions.size>=24&&!this.queuedCaptions.has(id)){await this.rejectCaption(ws,id,cap,'翻訳待ちが増えています。短く区切ってください。');return;}
      if(!existing&&(await this.ctx.storage.get('captionCount')||0)>=3000)throw Error('この授業は3000文に達しました。新しいルームを作ってください。');
      const sequence=existing?.sequence??(await this.ctx.storage.get('captionCount')||0)+1,at=existing?.at??Date.now();
      if(!existing){await this.ctx.storage.put('captionCount',sequence);await this.ctx.storage.put('caption:'+id,{id,sequence,source:captionParticipant(room,a,data).language,speaker:captionParticipant(room,a,data).name,text:cap.text,revision:cap.revision,continuing:cap.continuing,final:true,at,status:'queued'});}
      this.queuedCaptions.set(id,{ws,a:captionParticipant(room,a,data),room,cap,queuedAt:Date.now()});
      this.send(ws,{type:'caption_accepted',id,revision:cap.revision||0});
      this.broadcast({type:'caption_pending',id,sequence,source:captionParticipant(room,a,data).language,speaker:captionParticipant(room,a,data).name,text:cap.text,final:true,revision:cap.revision||0,status:'translating',at});
      if(this.jobs.has(id))return;
      this.startCaptionJob(id);
  }
  async rejectCaption(ws,id,cap,error){const saved=await this.ctx.storage.get('caption:'+id);if(saved?.status==='queued'&&(saved.revision||0)<=(cap.revision||0)){const failed={...saved,status:'failed',error,usage:{inputTokens:0,outputTokens:0,cacheHit:true},usageId:'rejected-'+id};await this.ctx.storage.put('caption:'+id,failed);const room=await this.info();if(room&&!room.ended&&room.expires>Date.now())this.broadcast({type:'translation',...failed});}if(!ws.deserializeAttachment()?.left)this.send(ws,{type:'caption_rejected',id,revision:cap.revision||0,error});}
  startCaptionJob(id){
    // Keep waiting work in the bounded queue; never create a timer per waiting caption.
    if(this.jobs.has(id)||this.jobs.size>=2||!this.queuedCaptions.has(id))return;
    const task=Promise.resolve().then(async()=>{
      while(this.queuedCaptions.has(id)){
        const next=this.queuedCaptions.get(id);this.queuedCaptions.delete(id);
        if(!await this.captionIsLive(next.ws,next.room,next.queuedAt)){await this.rejectCaption(next.ws,id,next.cap,'翻訳待ちの期限が切れました。もう一度伝えてください。');continue;}
        const saved=await this.ctx.storage.get('caption:'+id);
        if(saved?.text===next.cap.text&&(saved.status==='ready'||next.cap.metadataOnly&&saved.status==='failed')){
          const updated={...saved,revision:next.cap.revision,continuing:next.cap.continuing};
          if(!await this.captionIsLive(next.ws,next.room,next.queuedAt))continue;
          await this.ctx.storage.put('caption:'+id,updated);this.broadcast({type:'translation',...updated});
        }else{this.activeTranslations++;try{await this.translate(next.ws,next.a,next.room,id,next.cap.text,next.cap,next.queuedAt);}finally{this.activeTranslations--;}}
      }
    }).finally(()=>{this.jobs.delete(id);for(const key of this.queuedCaptions.keys()){if(this.jobs.size>=2)break;this.startCaptionJob(key);}});
    this.jobs.set(id,task);this.ctx.waitUntil(task);
  }
  async captionIsLive(ws,room,queuedAt=Date.now()){
    const current=await this.info(),participant=ws.deserializeAttachment();
    return !!current&&!current.ended&&current.expires>Date.now()&&room.expires>Date.now()&&Date.now()-queuedAt<15000&&!participant?.left&&participant?.expires>Date.now()&&this.participants().some(p=>p.ws===ws);
  }
  async translate(ws,a,room,id,text,update={},queuedAt=Date.now()){
    const start=Date.now();if(!await this.captionIsLive(ws,room,queuedAt))return;let usage;const saved=await this.ctx.storage.get('caption:'+id);const record={id,sequence:saved?.sequence,speaker:a.name,source:spokenLanguage(a.language),text,final:true,revision:update.revision??0,continuing:update.continuing===true,usageId:crypto.randomUUID(),at:saved?.at??start,status:'translating'};
    await this.ctx.storage.put('caption:'+id,record);
    try{
      const languages=this.participants().map(p=>p.a.language);const targets=room.mode==='interpreter'?[...new Set([...languages,...(languages.some(code=>code!=='en')?['en']:[])])]:[...new Set(['ja','en',...this.participants().flatMap(p=>[p.a.language,p.a.viewLanguage])])];
      if(this.env.SHEETS_BRIDGE&&Date.now()>this.catalogUntil){this.catalogUntil=Date.now()+300000;this.ctx.waitUntil(loadSharedCatalog(this.env,a.token).then(snapshot=>{this.cachedCatalog=exposeCatalog(snapshot);}).catch(()=>{}));}
    const all=this.cachedCatalog;
      const floor=room.groupChat?Math.max(0,...this.participants().map(p=>p.a.chatAfter||0)):null;const past=(await this.ctx.storage.get('recent')||[]).filter(r=>floor===null||Number.isInteger(r.sequence)&&r.sequence>floor).map(r=>r.text);
      if(!await this.captionIsLive(ws,room,queuedAt))return;if(Date.now()<this.aiBlockedUntil)throw Object.assign(Error('quota'),{code:3036});const translations=await translateText({...this.env,budgetUid:a.uid,executionValid:()=>this.captionIsLive(ws,room,queuedAt)},text,a.language,targets,past,room.unit,all,u=>{usage=u;if(u.translationTiming)u.translationTiming.queueMs=Math.max(0,start-queuedAt);});
      if(!(await this.info())||room.expires<=Date.now())return;const currentRoom=await this.info(),publish=!!currentRoom&&!currentRoom.ended&&currentRoom.expires>Date.now();const quality=inspectTranslations(text,record.source,targets,translations);const done={...record,translations,quality,usage,status:'ready',latencyMs:Date.now()-start};await this.ctx.storage.put('caption:'+id,done);const recent=await this.ctx.storage.get('recent')||[];await this.ctx.storage.put('recent',[...recent.filter(r=>r.id!==id),{id,sequence:record.sequence,at:record.at,text}].sort((a,b)=>a.at-b.at).slice(-3));if(publish)this.broadcast({type:'translation',...done});if(publish&&!quality.warnings.length&&!quality.unmeasuredLanguages.length&&a.language==='ja'&&!usage?.cacheHit&&((all.learnableTexts||[]).includes(text)||(all.phrases||[]).some(p=>p.jaText===text)))this.ctx.waitUntil(bridge(this.env,a.token,'tsuyakuLearn',{text,translations}).catch(()=>{}));
    }catch(e){if(['quota','billing','auth'].includes(aiFailure(e).reason))this.aiBlockedUntil=Math.floor(Date.now()/86400000)*86400000+86400000;if(!(await this.info())||room.expires<=Date.now())return;const currentRoom=await this.info(),publish=!!currentRoom&&!currentRoom.ended&&currentRoom.expires>Date.now(),failure=aiFailure(e),failed={...record,usage,status:'failed',latencyMs:Date.now()-start,error:failure.message,aiFailure:failure};await this.ctx.storage.put('caption:'+id,failed);if(publish)this.broadcast({type:'translation',...failed});}
  }
  async webSocketClose(ws){for(const [id,job]of this.queuedCaptions)if(job.ws===ws){this.queuedCaptions.delete(id);await this.rejectCaption(ws,id,job.cap,'発言側の接続が切れたため、この文の翻訳は開始していません。');}const a=ws.deserializeAttachment();if(a?.left)return;ws.serializeAttachment({...a,left:true});try{ws.close(1000,'left');}catch{}if(a?.uid&&!a.pending)this.broadcast({type:'notice',text:a.name+'さんが退室しました。'});this.roster();await this.scheduleAlarm();}
  async webSocketError(ws){await this.webSocketClose(ws);}
  async alarm(){
    if(await this.ctx.storage.get('codesDirectory')){await new LessonCodes(this.ctx.storage).cleanup();return;}
    const room=await this.info();
    if(!room||room.expires<=Date.now()){for(const ws of this.ctx.getWebSockets()){try{ws.close(1000,'expired');}catch{}}await this.ctx.storage.deleteAll();return;}
    for(const ws of this.ctx.getWebSockets()){
      const a=ws.deserializeAttachment();if(a?.left)continue;
      if(a?.pending&&a.requestUntil<=Date.now()){this.send(ws,{type:'join_declined',text:'参加の確認が時間切れになりました。招待リンクから入り直してください。'});await this.webSocketClose(ws);continue;}
      if(!a?.uid&&Date.now()-(a?.opened||0)>=10000||a?.uid&&a.expires<=Date.now()){
        ws.serializeAttachment({...a,left:true});try{ws.close(1008,'auth');}catch{}
      }
    }
    console.log(JSON.stringify({event:'room_alarm',activeSockets:this.participants().length}));await this.scheduleAlarm(room);
  }
}
