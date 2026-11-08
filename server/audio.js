const MAX_BYTES=512044;
export function validWav(bytes) {
  if (bytes.length < 44 + 16000 || bytes.length > MAX_BYTES || bytes.length % 2) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (at, size) => new TextDecoder().decode(bytes.subarray(at, at + size));
  return word(0,4) === 'RIFF' && word(8,4) === 'WAVE' && word(12,4) === 'fmt ' && word(36,4) === 'data' &&
    view.getUint32(4,true) === bytes.length - 8 && view.getUint32(16,true) === 16 && view.getUint16(20,true) === 1 &&
    view.getUint16(22,true) === 1 && view.getUint32(24,true) === 16000 && view.getUint32(28,true) === 32000 &&
    view.getUint16(32,true) === 2 && view.getUint16(34,true) === 16 && view.getUint32(40,true) === bytes.length - 44;
}

export function hasSpeechEnergy(wav) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const levels = []; let active = 0,run=0,longest=0;
  // 20ms frames, removing DC: clicks, a steady fan or mic offset are not speech.
  for (let at = 44; at + 640 <= wav.length; at += 640) {
    let sum = 0, squares = 0;
    for (let i = 0; i < 320; i++) { const x = view.getInt16(at + i * 2, true) / 32768; sum += x; squares += x * x; }
    const rms = Math.sqrt(Math.max(0, squares / 320 - (sum / 320) ** 2));
    levels.push(rms); if (rms >= 0.004){active++;run++;longest=Math.max(longest,run);}else run=0;
  }
  if (active < 6||longest<3) return false;
  levels.sort((a,b) => a-b);
  const low = levels[Math.floor(levels.length * .2)], high = levels[Math.floor(levels.length * .9)];
  return high >= 0.004 && high > low * 1.5;
}

export function suspectedSchoolOutro(result){
 const text=String(result?.text??result?.transcription_info?.text??'').normalize('NFKC').trim().replace(/[\s、。,.!！?？]/gu,'');
 return /^(?:これから(?:も)?(?:数多くの|たくさんの)?動画で(?:また)?お会いしましょう|(?:それでは)?(?:また)?次の動画でお会いしましょう)$/.test(text);
}
// Keep missing confidence distinct from invalid provider metadata.
function recognitionSegments(result){
 const top=result?.segments,nested=result?.transcription_info?.segments;
 if(top!=null&&!Array.isArray(top)||nested!=null&&!Array.isArray(nested))return null;
 return Array.isArray(top)&&top.length?top:Array.isArray(nested)?nested:[];
}
function invalidConfidence(segment){
 if(!segment||typeof segment!=='object'||Array.isArray(segment))return true;
 for(const [name,min,max] of [['no_speech_prob',0,1],['avg_logprob',-Infinity,0],['compression_ratio',0,Infinity]]){
  const n=segment[name];if(n!=null&&(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max))return true;
 }
 return false;
}
function unreliable(segment){
 return Number.isFinite(segment.no_speech_prob)&&segment.no_speech_prob>=.35||
  Number.isFinite(segment.avg_logprob)&&segment.avg_logprob< -1||
  Number.isFinite(segment.compression_ratio)&&segment.compression_ratio>2.4&&
   (Number.isFinite(segment.avg_logprob)&&segment.avg_logprob< -.5||Number.isFinite(segment.no_speech_prob)&&segment.no_speech_prob>=.15);
}
export function recognitionDecision(result,language,{schoolContext=false}={}){
 const raw=result?.text??result?.transcription_info?.text;
 if(typeof raw!=='string')return {text:null,reason:'invalid_result'};
 const text=raw.trim();if(!text)return {text:'',reason:'empty'};
 if(text.length>600)return {text:'',reason:'too_long'};
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))return {text:'',reason:'control_text'};
 if(schoolContext&&suspectedSchoolOutro(result))return {text:'',reason:'stock_outro'};
 const normalized=text.normalize('NFKC').replace(/[\s、。,.!！?？…]/gu,'');
 if(/^(?:ご視聴(?:どうも)?ありがとうございました|ご視聴ありがとうございます)+$/u.test(normalized))return {text:'',reason:'stock_outro'};
 const duration=result?.transcription_info?.duration_after_vad;
 if(Number.isFinite(duration)&&duration<=0)return {text:'',reason:'model_no_speech'};
 const segments=recognitionSegments(result);
 if(!segments||segments.length>256||segments.some(invalidConfidence))return {text:'',reason:'invalid_result'};
 if(segments.some(unreliable))return {text:'',reason:segments.every(s=>Number.isFinite(s.no_speech_prob)&&s.no_speech_prob>=.35)?'model_no_speech':'low_confidence'};
 if(['ja','ja-easy'].includes(language)&&/^[\sんン、。,.!！…]+$/u.test(text))return {text:'',reason:'nonverbal'};
 return {text,reason:null};
}
export function cleanRecognition(result,language,options){return recognitionDecision(result,language,options).text;}

// Numeric evidence only: never retain provider text or arbitrary properties.
export function recognitionEvidence(result){
 const rows=recognitionSegments(result);if(!rows?.length)return {};
 const safe=rows.slice(0,256),valid=safe.filter(s=>s&&typeof s==='object'&&!Array.isArray(s));
 const invalid=safe.filter(invalidConfidence).length;
 return {confidenceSegments:safe.length,noSpeechSegments:valid.filter(s=>Number.isFinite(s.no_speech_prob)&&s.no_speech_prob>=.35).length,lowConfidenceSegments:valid.filter(s=>Number.isFinite(s.avg_logprob)&&s.avg_logprob< -1).length,highCompressionSegments:valid.filter(s=>Number.isFinite(s.compression_ratio)&&s.compression_ratio>2.4).length,confidenceMeasuredSegments:valid.filter(s=>[s.no_speech_prob,s.avg_logprob,s.compression_ratio].some(Number.isFinite)).length,...(invalid?{invalidConfidenceSegments:invalid}:{})};
}
