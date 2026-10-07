export const spokenLanguage=code=>code==='ja-easy'?'ja':code;
export function withEasyJapanese(data){return {...data,languages:[...data.languages.filter(l=>l.code!=='ja-easy'),{code:'ja-easy',speechCode:'ja-JP',labelJa:'やさしい日本語',labelNative:'やさしい日本語',icon:'comment'}]};}
export const normalizeLanguage = code => code === 'zh' ? 'zh-CN' : code;
export const translationField = code => ({'ja-easy':'simpleJaText',ja:'jaText',en:'enText',pt:'ptText',es:'esText',vi:'viText','zh-CN':'zhText',ko:'koText',tl:'tlText',fil:'tlText',id:'idText',ne:'neText'})[code];
export function translationOf(row, code) {return row[translationField(code)] || (code==='ja-easy' ? row.descriptionJa : '') || (code==='ja' ? row.ja || row.title : code==='en' ? row.en : '') || '';}
export function glossaryFor(text, glossary) {
  return glossary.filter(r=>r.ja && text.includes(r.ja)).sort((a,b)=>b.ja.length-a.ja.length).slice(0,16);
}
export function protectMath(text) {
  // Preserve the speaker's numbers/variables; do not invent equations from ambiguous speech.
  return String(text).normalize('NFC').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
}
export function parseTranslation(text, targets) {
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/g,'').replace(/^```(?:json)?\s*|\s*```$/g,'').trim();
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start<0||end<start)throw Error('翻訳の応答を確認できませんでした。');
  const data=JSON.parse(cleaned.slice(start,end+1));
  const out={};for(const code of targets){if(typeof data[code]!=='string'||!data[code].trim()||data[code].length>4000)throw Error('翻訳が完了しませんでした。');out[code]=data[code].trim();}
  return out;
}
export function validateCaption(data) {
  if(typeof data.text!=='string'||!data.text.trim()||data.text.length>1200)throw Error('文章は1200文字以内にしてください。');
  if(typeof data.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(data.id))throw Error('字幕IDを確認してください。');
  if(data.revision!==undefined&&(!Number.isInteger(data.revision)||data.revision<0||data.revision>100))throw Error('字幕の更新番号を確認してください。');
  return {id:data.id,text:protectMath(data.text.trim()),final:!!data.final,revision:data.revision??0,continuing:data.continuing===true,metadataOnly:data.metadataOnly===true};
}
export function csv(rows) {
  const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  const safe=x=>/^[=+\-@\t\r]/.test(String(x))?"'"+x:x;
  return '\uFEFF'+rows.map(r=>r.map(x=>q(safe(x))).join(',')).join('\r\n');
}

export function captionParticipant(room,a,data){if(room.mode!=='face')return a;if(!['self','other'].includes(data.speakerSide)||![a.language,a.viewLanguage].includes(data.source))throw Error('対面の話し手と言語を確認してください。');return {...a,language:data.source,name:data.speakerSide==='self'?'自分':'相手'};}
