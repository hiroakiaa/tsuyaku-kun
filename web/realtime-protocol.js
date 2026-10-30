import {recognitionLanguage,speechTextAllowed,resolveSpeechLanguage} from '../web/two-language.js';
// Cloudflare's documented multilingual set, not the larger direct Deepgram set.
export const REALTIME_LANGUAGES=new Set(['en','es','fr','de','hi','ru','pt','ja','it','nl']);
export function realtimePair(candidates){if(!Array.isArray(candidates)||!candidates.length||candidates.length>2)return null;const pair=[...new Set(candidates.map(recognitionLanguage))];return pair.every(c=>REALTIME_LANGUAGES.has(c))?pair:null;}
function missingLanguageEvidence(text,candidates,confidence){
 if(candidates.length!==2||!candidates.includes('ja')||!candidates.includes('en')||!Number.isFinite(confidence)||confidence<.8||confidence>1||!speechTextAllowed(text,candidates))return null;
 if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))return 'ja';
 if(!/^[A-Za-z0-9\s.,!?\u2019'":;()%+\-]+$/.test(text))return null;
 const words=text.toLowerCase().match(/[a-z]+/g)||[],clues=new Set('i you we they this that my your what where when who why do does can could would will is are am have has please thank thanks hello good morning like want need understand school book today tomorrow'.split(' '));
 return words.length>=3&&new Set(words.filter(w=>clues.has(w))).size>=2?'en':null;
}
export class RealtimeUtterances{
 constructor(candidates,onResult,onUncertain=()=>{}){this.candidates=candidates;this.onResult=onResult;this.onUncertain=onUncertain;this.parts=[];this.seen=new Set();this.index=0;this.committedEnd=-1;}
 flush(){if(!this.parts.length)return;const parts=this.parts;this.parts=[];this.committedEnd=Math.max(this.committedEnd,...parts.map(p=>p.end));if(parts.some(p=>!p.language)){this.onUncertain(parts.find(p=>!p.language).languageReason);return;}if(parts.some(p=>!Number.isFinite(p.confidence)||p.confidence<.6)){this.onUncertain('confidence');return;}const language=parts[0].language,text=parts.map(p=>p.text).join(language==='ja'?'':' ').trim();if(text&&parts.every(p=>p.language===language)&&speechTextAllowed(text,this.candidates))this.onResult({id:this.index++,text,language,final:true,segmentCount:parts.length,languageBasis:parts.some(p=>p.languageBasis==='transcript_evidence')?'transcript_evidence':'provider'});else this.onUncertain('text');}
 accept(data){
  // A delayed end event for the previous utterance must not finalize new speech.
  if(data?.type==='UtteranceEnd'){if(Number.isFinite(data.last_word_end)&&this.parts.length&&data.last_word_end>=this.parts.at(-1).speechEnd-.01)this.flush();return;}
  if(data?.type!=='Results')return;
  const alt=data.channel?.alternatives?.[0],text=typeof alt?.transcript==='string'?alt.transcript.trim():'';
  if(text&&data.is_final===true){
   const windowStart=data.start,windowEnd=windowStart+data.duration;
   if(!Number.isFinite(windowStart)||!Number.isFinite(data.duration)||windowStart<0||data.duration<=0||windowEnd>180){this.parts=[];this.onUncertain('timing');return;}
   // Processing windows include silence and may overlap. Prefer the actual
   // word range so a new utterance in that padding is not rejected as a replay.
   const words=Array.isArray(alt.words)?alt.words:[],timedWords=words.length>0&&words.every(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=windowStart-.01&&w.end<=windowEnd+.01&&w.end>w.start);
   const start=timedWords?Math.min(...words.map(w=>w.start)):windowStart,end=timedWords?Math.max(...words.map(w=>w.end)):windowEnd;
   // Only suppress the same already-consumed audio window. A later utterance
   // with identical text is genuine new speech and must remain translatable.
   if(end<=this.committedEnd+.001)return;
   if(start<this.committedEnd-.001){this.parts=[];this.committedEnd=end;this.onUncertain('audio_overlap');return;}
   const key=JSON.stringify([data.start,data.duration,text]);if(!this.seen.has(key)){
    this.seen.add(key);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
    const tags=Array.isArray(alt.languages)?alt.languages:[],reported=recognitionLanguage(tags[0]||words.find(w=>w.language)?.language||(this.candidates.length===1?this.candidates[0]:'')),missing=!reported||['und','unknown'].includes(reported);
    const language=missing?missingLanguageEvidence(text,this.candidates,alt.confidence):this.candidates.includes(reported)?resolveSpeechLanguage({text,language:reported,language_probability:alt.confidence},this.candidates):null,languageBasis=missing?'transcript_evidence':'provider';
    if(text.length>600){this.parts=[];this.onUncertain('length');return;}
    const previous=this.parts.at(-1);
    if(previous&&start<previous.end-.001){
     if(Math.abs(start-previous.start)<.001&&end>=previous.end-.001)this.parts.pop();
     else{this.parts=[];this.committedEnd=Math.max(this.committedEnd,end);this.onUncertain('audio_overlap');return;}
    }
    if(this.parts.length&&this.parts.at(-1).language!==language)this.flush();
    if(this.parts.length>=12||this.parts.reduce((n,p)=>n+p.text.length,0)+text.length>600)this.flush();
    // The provider inserts word separators into Japanese. Preserve Latin word
    // spacing and repetitions; only join adjacent Japanese script characters.
    const normalized=language==='ja'?text.replace(/(?<=[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}、。！？])\s+(?=[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}、。！？])/gu,''):text;
    this.parts.push({text:normalized,language:this.candidates.includes(language)?language:null,languageBasis,languageReason:missing?'language_missing':'language_outside',confidence:alt.confidence,start,end,speechEnd:end});
   }
  }
  if(data.speech_final===true&&data.is_final===true)this.flush();
 }
}
