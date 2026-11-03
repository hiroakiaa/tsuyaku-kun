// Suggestions reuse an existing automatic ASR result; they never accept a transcript.
import {mergeLanguages} from './language-registry.js';
import {recognitionLanguage} from './two-language.js';
export function speechLanguageCandidates(result,selected=[]){
 const info=result?.transcription_info||result||{},raw=String(info.language??result?.language??'').trim().toLowerCase(),confidence=info.language_probability??result?.language_probability;
 if(!raw||!Number.isFinite(confidence)||confidence<.8||confidence>1)return [];
 const languages=mergeLanguages(),code=recognitionLanguage(raw),aliases={zh:'zh-CN',tl:'fil',no:'nb',hebrew:'he',burmese:'my',norwegian:'nb',serbian:'sr-Cyrl',mongolian:'mn-Cyrl'};
 const canonical=aliases[raw]||aliases[code]||code;
 const found=languages.filter(l=>l.code===canonical||l.azureCode?.toLowerCase()===raw||l.labelEn?.toLowerCase()===raw);
 const excluded=new Set(selected.map(recognitionLanguage));
 return [...new Set(found.filter(l=>!excluded.has(recognitionLanguage(l.code))).map(l=>l.code))].slice(0,3);
}
