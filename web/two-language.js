// Automatic recognition accepts only the configured pair; never guess a side.
export function recognitionLanguage(code){
 const value=String(code||'').toLowerCase();
 if(value==='ja-easy')return 'ja';
 if(['fil','tl','fil-ph','tl-ph'].includes(value))return 'tl';
 if(value==='zh'||value.startsWith('zh-'))return 'zh';
 return value.split('-')[0];
}
export function resolveSpeechLanguage(result,candidates){
 const info=result?.transcription_info||result||{},language=recognitionLanguage(info.language),confidence=info.language_probability;
 const matches=candidates.filter(code=>recognitionLanguage(code)===language);
 if(!language||!Number.isFinite(confidence)||confidence<.6||confidence>1||!matches.length)return null;
 return matches[0];
}
export function speechSide(language,self,other,previous='self'){
 const code=recognitionLanguage(language),own=recognitionLanguage(self),peer=recognitionLanguage(other);
 if(code===own&&code===peer)return previous;
 return code===own?'self':code===peer?'other':null;
}
