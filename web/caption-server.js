import {recognitionLanguage,speechTextAllowed} from './two-language.js?v=20261029-communication50-1';
import {nonSpeechReason} from './speech-filter.js?v=20261112-summary-language-1';
import {firstVoicedAt,lastVoicedAt} from './diagnostics.js?v=20261103-audio-offset-1';
import {recognitionMetrics} from './recognition-metrics.js?v=20261103-budget-cleanup-1';
import {trimmedAudioLength} from './audio-trim.js?v=20261029-communication50-1';
import {speechGapAllowsJoin,joinSpeechText,incompleteEnglish,japaneseSpeechTail,japaneseNumericCompletion} from './speech-continuity.js?v=20261112-summary-language-1';
export const capturePauseMs=profile=>profile==='fast'||profile==='responsive'?300:profile==='balanced'?400:500;
// Browser-independent recognition using the call's existing microphone stream.
export function encodeWav(samples,minimumSamples=0) {
  const bytes = new ArrayBuffer(44 + Math.max(minimumSamples,samples.length) * 2), view = new DataView(bytes);
  const word = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return bytes;
}

export function tokenWithAbort(getToken,signal){
 return new Promise((resolve,reject)=>{
  const aborted=()=>reject(new DOMException('Recognition cancelled','AbortError'));
  if(signal.aborted){aborted();return;}
  signal.addEventListener('abort',aborted,{once:true});
  Promise.resolve().then(getToken).then(value=>{signal.removeEventListener('abort',aborted);resolve(value);},error=>{signal.removeEventListener('abort',aborted);reject(error);});
 });
}
const maxQueuedAudioAgeMs=15000;
let recognitionRunCounter=0;
export function createServerRecognition({ endpoint, captureProfile='baseline', oneUtterance=false, manualRelease=false, getStream, getToken, fetcher = fetch, onUsage = () => {}, onDiagnostic = () => {}, canParallel = () => true, acquireSlot = async () => () => {},
  Context = globalThis.AudioContext || globalThis.webkitAudioContext, Worklet = globalThis.AudioWorkletNode }) {
  return class ServerRecognition {
    constructor() { this.recognitionRun=++recognitionRunCounter;this.active = false; this.queue = []; this.sending = false; this.index = 0; this.failures = 0; this.getHints = () => [];const query=new URL(endpoint||'https://invalid.local').searchParams;this.automatic=query.get('language')==='auto';this.candidates=(query.get('languages')||'').split(','); }
    progress(){this.onprogress?.({phase:this.capturing?'capturing':this.sending||this.queue.length?'recognizing':'waiting',pending:this.queue.length+(this.jobs?.size||0),requestStartedAt:this.jobs?.size?Math.min(...[...this.jobs].map(j=>j.startedAt||Date.now())):null});}
    setHints(getHints) { this.getHints = typeof getHints === 'function' ? getHints : () => []; }
    start() {
      this.active = true;
      this.startTimer = setTimeout(() => { if (this.active) this.fail('audio-capture'); }, 8000);
      // Must be called synchronously from the caption/microphone button on iOS.
      try {
        const stream = getStream();
        if (!stream?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled)) throw new Error('microphone');
        this.context = new Context();
        const resumed = this.context.resume();
        void this.prepare(stream, resumed);
      } catch (_) { this.fail('audio-capture'); }
    }
    async prepare(stream, resumed) {
      try {
        await resumed;
        if (!this.active) return;
        await this.context.audioWorklet.addModule(new URL('./caption-pcm.js?v=20261112-summary-language-1', import.meta.url));
        if (!this.active) return;
        this.source = this.context.createMediaStreamSource(stream);
        this.node = new Worklet(this.context, 'caption-pcm',{processorOptions:{pauseMs:capturePauseMs(captureProfile),oneUtterance,manualRelease}});
        this.node.port.onmessage = event => {
          if (!this.active) return;
          if(event.data?.captureFinished){
            if(this.captureFinished||(!this.finishingCapture&&!oneUtterance))return;
            this.finishingCapture=true;
            this.captureFinished=true;
            clearInterval(this.watchdog);
            this.onCaptureFinished?.(event.data.reason);
            clearTimeout(this.finishCaptureTimer);
            this.capturing=false;
            void this.drain();
            return;
          }
          if(event.data?.alive){this.lastAlive=Date.now();clearTimeout(this.startTimer);const {inputFrames,signalFrames}=event.data;if(Number.isFinite(inputFrames)&&Number.isFinite(signalFrames)){this.missingInputs=inputFrames===0?(this.missingInputs||0)+1:0;if(this.missingInputs>=3){onDiagnostic({stage:'asr',operation:'capture',code:'capture_missing',inputFrames,signalFrames});this.fail('audio-capture','マイクから音声データが届いていません。マイクをONにし直してください。');return;}const code=inputFrames===0?'capture_missing':signalFrames===0?'capture_silent':'capture_active';if(code!==this.captureState||Date.now()-(this.captureStateAt||0)>=15000){this.captureState=code;this.captureStateAt=Date.now();onDiagnostic({stage:'asr',operation:'capture',code,inputFrames,signalFrames,trackMuted:(stream.getAudioTracks?.()||[]).some(t=>t.muted===true)});}}return;}
          if(event.data?.activity){clearTimeout(this.startTimer);this.lastAlive=Date.now();this.capturing=event.data.activity==='start';this.progress();return;}
          const samples=event.data?.samples||event.data,boundary=event.data?.boundary==='limit'?'limit':'pause';
          if(!(samples instanceof Int16Array)||samples.length<1||samples.length>48000){onDiagnostic({stage:'asr',operation:'capture',code:'invalid_audio'});return;}
          clearTimeout(this.startTimer);this.lastAlive=Date.now();
          // Commit order detects the missing sequence when it reaches the gap.
          if (this.queue.length >= 2) { this.queue.shift().samples.fill(0); onDiagnostic({stage:'asr',operation:'capture',code:'queue_overflow'}); this.onrecovering?.({reason:'queue_overflow',attempt:1}); }
          const at=Date.now(),sequence=this.captureSequence=(this.captureSequence||0)+1;this.queue.push({samples,boundary,at,sequence,speechStartedAt:firstVoicedAt(samples,at),speechEndedAt:lastVoicedAt(samples,at)});this.progress();
          void this.drain();
        };
        this.node.onprocessorerror=()=>{if(this.active)this.fail('interrupted');};
        this.source.connect(this.node); this.node.connect(this.context.destination);
        this.context.onstatechange = () => {
          if (this.active && this.context.state !== 'running') this.fail('interrupted');
        };
        if (this.context.state !== 'running') { this.fail('interrupted'); return; }
        this.lastAlive=Date.now();this.watchdog=setInterval(()=>{if(this.active&&Date.now()-this.lastAlive>12000){onDiagnostic({stage:'asr',operation:'capture',code:'capture_stalled'});this.fail('interrupted');}},3000);onDiagnostic({stage:'asr',operation:'capture',code:'capture_ready',trackMuted:(stream.getAudioTracks?.()||[]).some(t=>t.muted===true)});this.onstart?.();this.progress();
      } catch (_) { if (this.active) this.fail('audio-capture'); }
    }
    finishCapture() {
      if(!this.active||!this.node||this.finishingCapture)return false;
      this.finishingCapture=true;
      clearInterval(this.watchdog);
      this.finishCaptureTimer=setTimeout(()=>this.fail('interrupted'),1500);
      this.node.port.postMessage('finish');
      return true;
    }
    async drain() {
      this.jobs??=new Set();this.commitTail??=Promise.resolve();
      const started=[];
      // Bound the whole pipeline to three jobs and actual network work to two.
      // A completed response waiting for order must not block the second network lane.
      while(this.active&&this.queue.length&&this.jobs.size<3&&[...this.jobs].filter(j=>!j.networkDone).length<2&&(![...this.jobs].some(j=>!j.networkDone)||canParallel())){
        const chunk=this.queue.shift();
        const queueMs=Date.now()-chunk.at;
        if(queueMs>maxQueuedAudioAgeMs){
          chunk.samples.fill(0);
          onDiagnostic({code:'stale_audio',queueMs,recognitionRun:this.recognitionRun,...(Number.isSafeInteger(chunk.sequence)?{segmentSequence:chunk.sequence}:{})});
          this.onrecovering?.({reason:'stale_audio',attempt:1});
          continue;
        }
        const job={controller:new AbortController(),previous:this.commitTail,startedAt:Date.now()};
        this.commitTail=new Promise(resolve=>job.release=resolve);this.jobs.add(job);this.sending=true;this.progress();
        started.push(this.recognizeChunk(chunk,job));
      }
      if(!started.length)this.progress();
      await Promise.all(started);
      if(this.active&&this.captureFinished&&!this.jobs.size&&!this.queue.length){
        this.finishFragment();
        this.abort();
        this.onend?.();
      }
    }
    async recognizeChunk(chunk,job) {
      const segmentDiagnostic=record=>onDiagnostic({...record,recognitionRun:this.recognitionRun,...(Number.isSafeInteger(chunk.sequence)?{segmentSequence:chunk.sequence}:{})});
      const requestAt=Date.now(), queueMs=Math.max(0,requestAt-chunk.at);
      const controller = job.controller;let phase='auth',body,releaseSlot,clientSlotWaitMs=null,clientAuthMs=null,httpStarted=null,sentSamples=chunk.samples.length;
      const ordered=async()=>{await job.previous;if(!this.active||!this.jobs.has(job)||controller.signal.aborted)return false;if(Number.isFinite(chunk.sequence)){if(Number.isFinite(this.lastSequence)&&chunk.sequence!==this.lastSequence+1)this.breakContinuity=true;this.lastSequence=chunk.sequence;}return true;};
      const stale=()=>Date.now()-chunk.at>maxQueuedAudioAgeMs;
      const timeout = setTimeout(() => controller.abort(), 12000);
      const discardUnsentAudio=async()=>{
        releaseSlot?.();releaseSlot=null;
        clearTimeout(timeout);
        job.networkDone=true;
        void this.drain();
        if(!await ordered())return;
        this.breakContinuity=true;
        segmentDiagnostic({code:'stale_audio',queueMs,clientAuthMs});
        this.onrecovering?.({reason:'stale_audio',attempt:1});
      };
      try {
        if(stale()){await discardUnsentAudio();return;}
        const token = await tokenWithAbort(getToken,controller.signal);clientAuthMs=Date.now()-requestAt;
        if(stale()){await discardUnsentAudio();return;}
        phase='slot';const slotStarted=Date.now();releaseSlot=await acquireSlot(controller.signal);clientSlotWaitMs=Date.now()-slotStarted;
        if (!this.active) return;
        if (controller.signal.aborted) throw new DOMException('Recognition cancelled','AbortError');
        if(stale()){await discardUnsentAudio();return;}
        sentSamples=trimmedAudioLength(chunk.samples,chunk.boundary);body = encodeWav(chunk.samples.subarray(0,sentSamples),8000); chunk.samples.fill(0);
        const uploadedSeconds=(body.byteLength-44)/32000;
        onUsage(uploadedSeconds);
        const hints = [...new Set((this.automatic?[]:(this.getHints() || [])).filter(x => typeof x === 'string')
          .map(x => x.normalize('NFKC').trim()).filter(x => x && x.length <= 40))].slice(0, 30).join(',').slice(0, 300);
        const encodedHints=hints?encodeURIComponent(hints):'';
        phase='request';httpStarted=Date.now();job.cancelDiagnostic=()=>segmentDiagnostic({code:'request_cancelled',clientRequestMs:Date.now()-httpStarted,queueMs});const response = await fetcher(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'audio/wav', Authorization: 'Bearer ' + token,
            ...(encodedHints ? { 'X-Term-Hints': encodedHints } : {}) },
          body, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
        });
        phase='parse';let data,failure,failureData;if(response.ok){data=await response.json();if(!data||typeof data!=='object'||typeof data.text!=='string')throw Error('invalid response');}else{try{failureData=await response.json();failure=failureData.aiFailure;}catch{}}
        const responseReadyAt=Date.now();clearTimeout(timeout);releaseSlot?.();releaseSlot=null;
        const requestMetrics={status:response.status,elapsedMs:responseReadyAt-requestAt,queueMs,clientAuthMs,clientSlotWaitMs,clientRequestMs:responseReadyAt-httpStarted,captureTailMs:Number.isFinite(chunk.speechEndedAt)?Math.max(0,chunk.at-chunk.speechEndedAt):null,audioSeconds:uploadedSeconds,trimmedTailMs:(chunk.samples.length-sentSamples)/16,segmentBoundary:chunk.boundary,...recognitionMetrics((data||failureData)?.recognitionTiming),...(failure?{aiReason:failure.reason,aiCode:failure.code,aiEvidence:failure.evidence,aiModel:failure.model}:{})};
        // Record actual HTTP completion before waiting for an earlier segment. No transcript is retained.
        if(!this.active||!this.jobs.has(job)||controller.signal.aborted)return;
        chunk.samples.fill(0);if(body)new Uint8Array(body).fill(0);
        job.cancelDiagnostic=null;segmentDiagnostic({code:response.ok?'ok':'http_error',...requestMetrics,at:responseReadyAt});
        if(response.ok){job.networkDone=true;void this.drain();}
        if(!await ordered())return;
        requestMetrics.orderWaitMs=Math.max(0,Date.now()-responseReadyAt);if(requestMetrics.orderWaitMs>0)segmentDiagnostic({code:'recognition_order',orderWaitMs:requestMetrics.orderWaitMs});
        if (!response.ok) { const error=failure?.reason|| (response.status === 429 ? 'quota' : [401,403].includes(response.status) ? 'auth' : 'network'); if (['network','service','timeout','overloaded'].includes(error) && (response.status>=500||error==='overloaded')) { this.transientFailure(error); return; } this.fail(error,failure?.message); return; }
        this.failures=0;
        if (!this.active || controller.signal.aborted) return;
        if(stale()){this.breakContinuity=true;segmentDiagnostic({code:'stale_result',queueMs,orderWaitMs:requestMetrics.orderWaitMs});this.onrecovering?.({reason:'stale_result',attempt:1});return;}
        const automatic=this.automatic,candidates=this.candidates;if(['low_confidence','invalid_result','too_long','control_text','model_no_speech'].includes(data.recognitionRejected)){this.breakContinuity=true;this.finishFragment();const reason=data.recognitionRejected==='model_no_speech'?'model_no_speech':'low_confidence';segmentDiagnostic({code:'filtered',filterReason:reason});if(reason==='low_confidence')this.onlanguageuncertain?.({reason:'low_confidence'});return;}if(data.recognitionRejected==='stock_outro'){this.breakContinuity=true;this.finishFragment();segmentDiagnostic({code:'filtered',filterReason:'empty'});this.onlanguageuncertain?.({reason:'stock_outro'});return;}
        if(automatic&&Array.isArray(data.languageCandidates)&&data.languageCandidates.some(c=>typeof c==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(c)&&!candidates.includes(c))){this.breakContinuity=true;this.finishFragment();segmentDiagnostic({code:'filtered',filterReason:'language_uncertain',languageDecision:'candidate_available'});this.onlanguageuncertain?.({reason:'outside_pair',candidates:data.languageCandidates.filter(c=>typeof c==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(c)).slice(0,3)});return;}
        if(automatic&&typeof data.text==='string'&&data.text.trim()&&(data.languageUncertain||!data.language||!candidates.includes(data.language)||!speechTextAllowed(data.text,candidates))){this.breakContinuity=true;this.finishFragment();segmentDiagnostic({code:'filtered',filterReason:'language_uncertain',languageDecision:speechTextAllowed(data.text,candidates)?'uncertain':'outside_pair'});this.onlanguageuncertain?.({reason:speechTextAllowed(data.text,candidates)?'uncertain':'outside_pair'});return;}
        const rejected=nonSpeechReason(data,data.language||new URL(endpoint).searchParams.get('language'));
        if(rejected){this.breakContinuity=true;this.finishFragment();segmentDiagnostic({code:'filtered',filterReason:rejected});return;}
        const text = typeof data.text === 'string' ? data.text.trim().slice(0, 600) : '';
        if (text) {
          // No cumulative transcript list is retained by the recognizer.
          this.acceptText(text,{recognitionRun:this.recognitionRun,segmentSequence:chunk.sequence,speechStartedAt:chunk.speechStartedAt,speechEndedAt:chunk.speechEndedAt,recognitionReadyAt:Date.now(),boundary:chunk.boundary,...(data.language?{language:data.language}:{})});
        }
      } catch (_) {job.cancelDiagnostic=null;releaseSlot?.();releaseSlot=null;clearTimeout(timeout);const code=controller.signal.aborted?'timeout':phase==='parse'?'invalid_response':phase==='auth'?'auth_unavailable':'network_or_cors';if(this.active&&this.jobs.has(job)){segmentDiagnostic({code,queueMs,clientAuthMs,...(httpStarted?{clientRequestMs:Date.now()-httpStarted}:{})});}await job.previous;if(this.active&&this.jobs.has(job)){if(phase==='auth'&&!controller.signal.aborted)this.fail('auth');else this.transientFailure(code,code==='network_or_cors'&&phase==='request');} }
      finally {
        releaseSlot?.();chunk.samples.fill(0);if(body)new Uint8Array(body).fill(0);clearTimeout(timeout);this.jobs.delete(job);job.release();this.sending=this.jobs.size>0;this.progress();
        if (this.active) void this.drain();
      }
    }
    emitText(text,timing,index=this.index++,revision=0,continuing=false) {
      const result=[{transcript:text}];result.isFinal=true;
      this.onresult?.({resultIndex:index,results:{length:index+1,[index]:result},...timing,revision,continuing});
    }
    finishFragment() {
      if(!this.fragment)return;
      const pending=this.fragment;this.fragment=null;clearTimeout(this.fragmentTimer);
      // Metadata-only completion reuses the translation; do not charge for the same text again.
      this.emitText(pending.text,{...pending.timing,metadataOnly:true},pending.index,pending.revision+1,false);
    }
    acceptText(text,timing) {
      const now=Date.now();let joined=false,index,revision=0,chunks=1;
      const anchor=this.tailAnchor;this.tailAnchor=null;clearTimeout(this.tailAnchorTimer);
      const overlaps=previous=>Number.isFinite(previous?.speechEndedAt)&&Number.isFinite(timing.speechStartedAt)&&timing.speechStartedAt<previous.speechEndedAt&&timing.speechStartedAt>=previous.speechEndedAt-1500;
      const numericCompletion=anchor&&overlaps(anchor.timing)?japaneseNumericCompletion(anchor.text,text):null;
      if(anchor&&!this.fragment&&!this.breakContinuity&&recognitionLanguage(timing.language)==='ja'&&recognitionLanguage(anchor.timing.language)==='ja'&&(japaneseSpeechTail(text)||numericCompletion!==null)&&Number.isFinite(anchor.timing.speechEndedAt)&&Number.isFinite(timing.speechStartedAt)&&speechGapAllowsJoin(anchor.timing,timing)&&timing.speechStartedAt-anchor.timing.speechEndedAt<=300&&now-anchor.at<=8000){
        const ending=text.trim().replace(/[。．.!！]$/u,''),base=anchor.text.replace(/[。．.!！]$/u,'');
        if(base.endsWith(ending)){onDiagnostic({code:'filtered',filterReason:'boundary_echo'});return;}
        text=numericCompletion??base+text;index=anchor.index;revision=anchor.revision+1;chunks=anchor.chunks+1;joined=true;timing={...timing,speechStartedAt:anchor.timing.speechStartedAt};
        onDiagnostic({code:'recognition_repair'});
      }
      if(this.fragment){
        const previous=this.fragment;
        if(!this.breakContinuity&&recognitionLanguage(previous.timing.language)===recognitionLanguage(timing.language)&&speechGapAllowsJoin(previous.timing,timing)&&now-previous.at<=previous.waitMs){
          this.fragment=null;clearTimeout(this.fragmentTimer);
          const completion=previous.timing.boundary==='limit'&&recognitionLanguage(timing.language)==='ja'&&overlaps(previous.timing)?japaneseNumericCompletion(previous.text,text):null;
          text=completion??joinSpeechText(previous.text.replace(/[。．.]$/u,''),text,recognitionLanguage(timing.language),previous.timing.boundary);if(completion!==null)onDiagnostic({code:'recognition_repair'});joined=true;
          index=previous.index;revision=previous.revision+1;chunks=(previous.chunks||1)+1;
          timing={...timing,speechStartedAt:previous.timing.speechStartedAt};
        }else this.finishFragment();
      }
      if(!joined&&recognitionLanguage(timing.language)==='ja'&&japaneseSpeechTail(text)){this.breakContinuity=true;onDiagnostic({code:'filtered',filterReason:'isolated_fragment'});this.onlanguageuncertain?.({reason:'fragment'});return;}
      this.breakContinuity=false;
      index??=this.index++;
      // Bound cumulative updates to four chunks and 480 characters.
      const continuing=chunks<4&&(timing.boundary==='limit'&&!/[。.!?！？]\s*$/.test(text)||isIncompleteJapanese(text)||recognitionLanguage(timing.language)==='en'&&incompleteEnglish(text))&&text.length<480;
      this.emitText(text,timing,index,revision,continuing);
      if(!continuing&&timing.boundary==='limit'){this.tailAnchor={text,timing,index,revision,chunks,at:now};this.tailAnchorTimer=setTimeout(()=>{this.tailAnchor=null;},8000);}
      if(continuing){
        this.fragment={text,timing,chunks,index,revision,at:now,waitMs:8000};
        const flush=()=>{
          if(!this.active||!this.fragment)return;
          if((this.capturing||this.sending||this.queue.length)&&Date.now()-this.fragment.at<this.fragment.waitMs){this.fragmentTimer=setTimeout(flush,250);return;}
          this.finishFragment();
        };
        this.fragmentTimer=setTimeout(flush,timing.boundary==='limit'?8000:2500);
      }
    }
    transientFailure(reason='network',connectionIssue=false) {
      // Keep capturing after a brief service/network failure. A later utterance retries; never replay stale speech.
      this.failures++;this.breakContinuity=true;
      this.onrecovering?.({reason,attempt:this.failures});
      if(this.failures>=3)this.fail('network',undefined,connectionIssue);
    }
    fail(error,message,connectionIssue=false) { const notify = this.onerror; this.abort(); notify?.({ error, message,...(connectionIssue?{connectionIssue:true}:{}) }); }
    abort() {
      clearTimeout(this.finishCaptureTimer);clearTimeout(this.startTimer);clearTimeout(this.fragmentTimer);clearTimeout(this.tailAnchorTimer);this.tailAnchor=null;clearInterval(this.watchdog);this.watchdog=null;this.fragment=null;
      this.active = false;this.capturing=false;for(const job of this.jobs||[]){job.cancelDiagnostic?.();job.cancelDiagnostic=null;job.controller.abort();job.release();}this.jobs?.clear();this.sending=false;
      for (const chunk of this.queue) chunk.samples.fill(0); this.queue=[];
      if (this.node) { this.node.onprocessorerror=null;this.node.port.onmessage = null; this.node.port.postMessage('stop'); this.node.disconnect(); }
      this.source?.disconnect();
      if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); }
      // Never call stop() on the shared call microphone tracks.
    }
  };
}

export function isIncompleteJapanese(text){return typeof text==='string'&&text.length<=40&&(/^(?:(?:来週|今週|再来週)の)?(?:[0-9０-９]{1,2}月[0-9０-９]{1,2}日(?:[月火水木金土日]曜日)?|[月火水木金土日]曜日|(?:午前|午後)?[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?)[、。．.!！?？]?$/u.test(text)||/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}0-9０-９\s]+(?:は|が|を|に|から|まで)$/u.test(text));}
