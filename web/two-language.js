// Automatic recognition accepts only the configured pair; never guess a side.
export function recognitionLanguage(code){
 const value=String(code||'').trim().toLowerCase();
 const names={english:'en',japanese:'ja',portuguese:'pt',spanish:'es',german:'de',tagalog:'tl',filipino:'tl',vietnamese:'vi',chinese:'zh',korean:'ko',indonesian:'id',nepali:'ne'};
 if(names[value])return names[value];
 if(value==='ja-easy')return 'ja';
 if(['fil','tl','fil-ph','tl-ph'].includes(value))return 'tl';
 if(value==='zh'||value.startsWith('zh-'))return 'zh';
 return value.split('-')[0];
}
export function speechTextAllowed(text,candidates){
 const codes=new Set(candidates.map(recognitionLanguage));
 const scripts=[['ko',/\p{Script=Hangul}/u],['ja',/[\p{Script=Hiragana}\p{Script=Katakana}]/u],['zh',/\p{Script=Han}/u],['ne',/\p{Script=Devanagari}/u]];
 for(const [code,pattern] of scripts)if(pattern.test(text)&&!codes.has(code)&&!(code==='zh'&&codes.has('ja')))return false;
 return !/[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}]/u.test(text);
}
export function resolveSpeechLanguage(result,candidates){
 const info=result?.transcription_info||result||{},language=recognitionLanguage(info.language??result?.language),confidence=info.language_probability??result?.language_probability;
 if(!speechTextAllowed(String(result?.text??info.text??''),candidates))return null;
 const matches=candidates.filter(code=>recognitionLanguage(code)===language);
 if(!language||!matches.length||(confidence!=null&&(!Number.isFinite(confidence)||confidence<0||confidence>1)))return null;
 // Short replies often have weak acoustic language confidence. For JA/EN only,
 // use the transcription's script and ordinary English words as supporting
 // evidence; names, numbers and an unselected language never select a side.
 const pair=new Set(candidates.map(recognitionLanguage)),text=String(result?.text??info.text??'').trim();
 if(pair.size===2&&pair.has('ja')&&pair.has('en')){
  if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))return candidates.find(code=>recognitionLanguage(code)==='ja');
  const words=text.toLowerCase().match(/[a-z]+/g)||[];
  const clues=new Set('hello hi good morning afternoon evening how are you i am we they it is this that my your name what where when who why do does can could would will have has please thank thanks yes no sorry welcome help tomorrow today yesterday school book textbook bring meet library like want need understand speak english japanese nice to see me us fine well happy'.split(' '));
  const known=words.filter(word=>clues.has(word)).length;
  if(/^[A-Za-z0-9\s.,!?\u2019'":;()%+\-]+$/.test(text)&&known>0&&(language==='en'||words.length>=2&&known>=2))return candidates.find(code=>recognitionLanguage(code)==='en');
 }
 if(!Number.isFinite(confidence)||confidence<.6)return null;
 return matches[0];
}
export function speechSide(language,self,other,previous='self'){
 const code=recognitionLanguage(language),own=recognitionLanguage(self),peer=recognitionLanguage(other);
 if(code===own&&code===peer)return previous;
 return code===own?'self':code===peer?'other':null;
}
