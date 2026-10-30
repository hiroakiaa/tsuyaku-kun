import {recognitionLanguage,speechTextAllowed} from '../web/two-language.js';
// Cloudflare's documented multilingual set, not the larger direct Deepgram set.
export const REALTIME_LANGUAGES=new Set(['en','es','fr','de','hi','ru','pt','ja','it','nl']);
export function realtimePair(candidates){if(!Array.isArray(candidates)||!candidates.length||candidates.length>2)return null;const pair=[...new Set(candidates.map(recognitionLanguage))];return pair.every(c=>REALTIME_LANGUAGES.has(c))?pair:null;}
export class RealtimeUtterances{
 constructor(candidates,onResult,onUncertain=()=>{}){this.candidates=candidates;this.onResult=onResult;this.onUncertain=onUncertain;this.parts=[];this.seen=new Set();this.index=0;this.committedEnd=-1;}
 flush(){if(!this.parts.length)return;const parts=this.parts;this.parts=[];this.committedEnd=Math.max(this.committedEnd,...parts.map(p=>p.end));if(parts.some(p=>!p.language||!Number.isFinite(p.confidence)||p.confidence<.6)){this.onUncertain();return;}const language=parts[0].language,text=parts.map(p=>p.text).join(language==='ja'?'':' ').trim();if(text&&parts.every(p=>p.language===language)&&speechTextAllowed(text,this.candidates))this.onResult({id:this.index++,text,language,final:true,segmentCount:parts.length});else this.onUncertain();}
 accept(data){
  // A delayed end event for the previous utterance must not finalize new speech.
  if(data?.type==='UtteranceEnd'){if(Number.isFinite(data.last_word_end)&&this.parts.length&&data.last_word_end>=this.parts[0].start)this.flush();return;}
  if(data?.type!=='Results')return;
  const alt=data.channel?.alternatives?.[0],text=typeof alt?.transcript==='string'?alt.transcript.trim():'';
  if(text&&data.is_final===true){
   const start=data.start,end=start+data.duration;
   if(!Number.isFinite(start)||!Number.isFinite(data.duration)||start<0||data.duration<=0||end>180){this.parts=[];this.onUncertain();return;}
   // Only suppress the same already-consumed audio window. A later utterance
   // with identical text is genuine new speech and must remain translatable.
   if(end<=this.committedEnd+.001)return;
   if(start<this.committedEnd-.001){this.parts=[];this.committedEnd=end;this.onUncertain();return;}
   const key=JSON.stringify([data.start,data.duration,text]);if(!this.seen.has(key)){
    this.seen.add(key);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
    const tags=Array.isArray(alt.languages)?alt.languages:[],words=Array.isArray(alt.words)?alt.words:[],language=recognitionLanguage(tags[0]||words.find(w=>w.language)?.language|| (this.candidates.length===1?this.candidates[0]:''));
    if(text.length>600){this.parts=[];this.onUncertain();return;}
    const previous=this.parts.at(-1);
    if(previous&&start<previous.end-.001){
     if(Math.abs(start-previous.start)<.001&&end>=previous.end-.001)this.parts.pop();
     else{this.parts=[];this.committedEnd=Math.max(this.committedEnd,end);this.onUncertain();return;}
    }
    if(this.parts.length&&this.parts.at(-1).language!==language)this.flush();
    if(this.parts.length>=12||this.parts.reduce((n,p)=>n+p.text.length,0)+text.length>600)this.flush();
    // The provider inserts word separators into Japanese. Preserve Latin word
    // spacing and repetitions; only join adjacent Japanese script characters.
    const normalized=language==='ja'?text.replace(/(?<=[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}、。！？])\s+(?=[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}、。！？])/gu,''):text;
    this.parts.push({text:normalized,language:this.candidates.includes(language)?language:null,confidence:alt.confidence,start,end});
   }
  }
  if(data.speech_final===true&&data.is_final===true)this.flush();
 }
}
