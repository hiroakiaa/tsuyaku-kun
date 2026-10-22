import {splitRecognizedText} from './session-reliability.js?v=20261022-reliability-20-1';
import {createServerRecognition} from './caption-server.js?v=20261007-free-1';
import {nonSpeechReason} from './speech-filter.js?v=20261007-learning-1';

// The browser may use its vendor's speech service. This is not an offline guarantee.
// Reuse the bounded fragment assembler so dates and their following sentence stay together.
export function createBrowserRecognition({language, Native, onDiagnostic = () => {}, schedule = setTimeout, cancel = clearTimeout}) {
  if (!Native) return null;
  const Base = createServerRecognition({Context:null,Worklet:null});
  return class BrowserRecognition extends Base {
    start() {
      this.abort();this.active=true;
      let native;const finals=new Map();
      try{native=this.native=new Native();}catch{this.fail('service');return;}
      native.lang=language; native.continuous=true; native.interimResults=false; native.maxAlternatives=1;
      const started=()=>{if(!this.active||this.native!==native)return;cancel(this.startWatch);this.startWatch=null;};
      native.onstart=()=>{started();if(this.active&&this.native===native)onDiagnostic({code:'browser_speech_started'});};
      native.onresult=event=>{started();
        if(!this.active||this.native!==native)return;
        for(let i=event.resultIndex;i<event.results.length;i++){
          const result=event.results[i],text=result?.[0]?.transcript?.trim();
          if(!result?.isFinal||!text||finals.get(i)===text)continue;finals.set(i,text);if(finals.size>1000)finals.delete(finals.keys().next().value);
          const rejected=nonSpeechReason({text},language);
          if(rejected){this.breakContinuity=true;this.finishFragment();onDiagnostic({code:'filtered',filterReason:rejected});continue;}
          // Native speech events do not expose PCM timings: leave these unmeasured.
          const chunks=splitRecognizedText(text);if(chunks.length>1)this.finishFragment();for(const chunk of chunks){if(chunks.length>1)this.breakContinuity=true;this.acceptText(chunk,{recognitionReadyAt:Date.now(),boundary:'pause'});if(chunks.length>1)this.finishFragment();}
        }
      };
      native.onerror=event=>{started();
        if(!this.active||this.native!==native)return;
        if(event.error==='aborted'){this.finishFragment();this.active=false;onDiagnostic({code:'browser_speech_ended'});this.onend?.();return;}
        if(event.error==='no-speech'){this.breakContinuity=true;this.finishFragment();onDiagnostic({code:'filtered',filterReason:'empty'});return;}
        const error=['not-allowed','service-not-allowed'].includes(event.error)?'auth':event.error==='audio-capture'?'audio-capture':'service';
        onDiagnostic({code:'browser_speech_error',recognitionCode:event.error});
        this.fail(error);
      };
      native.onend=()=>{started();if(!this.active||this.native!==native)return;this.finishFragment();this.active=false;onDiagnostic({code:'browser_speech_ended'});this.onend?.();};
      this.startWatch=schedule(()=>{if(this.active&&this.native===native){onDiagnostic({code:'browser_speech_error',recognitionCode:'start_timeout'});this.fail('audio-capture');}},8000);
      try{native.start();}catch{this.fail('service');}
    }
    abort(){cancel(this.startWatch);this.startWatch=null;super.abort();if(this.native){this.native.onstart=this.native.onresult=this.native.onerror=this.native.onend=null;try{this.native.abort();}catch{}this.native=null;}}
  };
}
