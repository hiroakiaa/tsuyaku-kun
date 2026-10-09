import {createServerRecognition} from './caption-server.js?v=20261007-free-1';
import {nonSpeechReason} from './speech-filter.js?v=20261007-learning-1';

// The browser may use its vendor's speech service. This is not an offline guarantee.
// Reuse the bounded fragment assembler so dates and their following sentence stay together.
export function createBrowserRecognition({language, Native, onDiagnostic = () => {}}) {
  if (!Native) return null;
  const Base = createServerRecognition({Context:null,Worklet:null});
  return class BrowserRecognition extends Base {
    start() {
      this.active=true;
      let native;
      try{native=this.native=new Native();}catch{this.fail('service');return;}
      native.lang=language; native.continuous=true; native.interimResults=false; native.maxAlternatives=1;
      native.onresult=event=>{
        if(!this.active)return;
        for(let i=event.resultIndex;i<event.results.length;i++){
          const result=event.results[i],text=result?.[0]?.transcript?.trim();
          if(!result?.isFinal||!text)continue;
          const rejected=nonSpeechReason({text},language);
          if(rejected){this.breakContinuity=true;this.finishFragment();onDiagnostic({code:'filtered',filterReason:rejected});continue;}
          // Native speech events do not expose PCM timings: leave these unmeasured.
          this.acceptText(text,{recognitionReadyAt:Date.now(),boundary:'pause'});
        }
      };
      native.onerror=event=>{
        if(!this.active)return;
        if(event.error==='aborted'){this.finishFragment();this.active=false;onDiagnostic({code:'browser_speech_ended'});this.onend?.();return;}
        if(event.error==='no-speech'){this.breakContinuity=true;this.finishFragment();onDiagnostic({code:'filtered',filterReason:'empty'});return;}
        const error=['not-allowed','service-not-allowed'].includes(event.error)?'auth':event.error==='audio-capture'?'audio-capture':'service';
        onDiagnostic({code:'browser_speech_error',recognitionCode:event.error});
        this.fail(error);
      };
      native.onend=()=>{if(!this.active)return;this.finishFragment();this.active=false;onDiagnostic({code:'browser_speech_ended'});this.onend?.();};
      try{native.start();onDiagnostic({code:'browser_speech_started'});}catch{this.fail('service');}
    }
    abort(){super.abort();if(this.native){this.native.onresult=this.native.onerror=this.native.onend=null;try{this.native.abort();}catch{}this.native=null;}}
  };
}
