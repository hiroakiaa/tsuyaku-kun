import {hasInternalMarker,markerPattern,reviewFallback} from '../web/translation-safety.js';
// Conservative checks for malformed ordinal phrases. Never repair numbers by guessing.
export function schoolContextHints(text,source='ja') {
 if(source!=='ja')return [];
 const rules=[['丸をもら','In schoolwork: the teacher confirmed the answer is correct. Translate the meaning, never the shape circle: English marked correct, Spanish respuesta correcta, Portuguese resposta correta. Do not claim who marked it unless specified.'],['終業式','End-of-term ceremony; different from graduation.'],['下校','Leaving school for home.'],['問','When followed by a number: an exercise/question.']];
 if(/マイク/.test(text)&&/(?:音声|入力|オン|オフ|ON|OFF|聞こえ|録音|今マイク)/i.test(text))rules.push(['マイク','In this audio-device context, マイク means microphone, not the person Mike. Preserve the question; do not answer it.']);
 return rules.filter(([term])=>text.includes(term)).map(([term,meaning])=>({term,meaning,scope:'Use only in clear school context; preserve the recognized source text.'}));
}
export function uncertainSpeech(text){return [...new Set(String(text).match(/[一二三四五六七八九十0-9０-９]+次つ目/g)||[])].slice(0,4);}
export function protectUncertainSpeech(text){const spans=uncertainSpeech(text);let speech=text;spans.forEach((span,i)=>{speech=speech.replaceAll(span,'__UNCLEAR_'+(i+1)+'__');});return {speech,spans};}
const labels={de:'unklare Formulierung','ja-easy':'意味を確認してください',en:'unclear wording',es:'expresión poco clara',pt:'expressão pouco clara',vi:'từ ngữ chưa rõ','zh-CN':'含义不明确',ko:'의미 확인 필요',tl:'hindi malinaw na salita',fil:'hindi malinaw na salita',id:'kata-kata tidak jelas',ne:'अस्पष्ट शब्द'};
export function restoreUncertainSpeech(translations,source,spans){
 return Object.fromEntries(Object.entries(translations).map(([code,value])=>{
   let result=String(value).replace(markerPattern(),(_,index)=>'__UNCLEAR_'+index.normalize('NFKC')+'__');for(let i=0;i<spans.length;i++){
     const token='__UNCLEAR_'+(i+1)+'__';
     if(!result.includes(token)){result=reviewFallback(source,code);break;}
     result=result.replaceAll(token,'「'+spans[i]+'」 ('+(labels[code]||labels.en)+')');
   }
   return [code,hasInternalMarker(result)?reviewFallback(source,code):result];
 }));
}
