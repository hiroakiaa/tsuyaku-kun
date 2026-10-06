import {translationField} from '../web/core.js';

const usable=value=>typeof value==='string'&&value.trim()&&!value.startsWith('#')&&!value.startsWith('=');
export function storedTranslations(text,source,targets,data,subject='') {
  // Exact means exact: different numbers, punctuation and context-dependent variants never share a bank entry.
  const rows=(data.bank||[]).filter(r=>r.status==='approved'&&r.sourceLang===source&&r.sourceText===text&&(!r.subject||r.subject==='common'||r.subject===subject));
  const phraseKey=v=>String(v||'').normalize('NFC').trim().replace(/。$/,'');
  const phrase=(data.phrases||[]).find(r=>source==='ja'&&phraseKey(r.jaText)===phraseKey(text));
  const translations={},keys=[];
  for(const code of targets){for(const row of [...rows,...(phrase?[phrase]:[])]){const value=row[translationField(code)];if(usable(value)){translations[code]=value;if(row.bankKey&&!keys.includes(row.bankKey))keys.push(row.bankKey);break;}}}
  return {translations,keys};
}
export function correctionHints(text,rules,subject='') {
  const seen=new Set();return (rules||[]).filter(r=>{const key=r.from+'|'+r.to;if(!r.from||!r.to||String(r.enabled).toLowerCase()!=='true'||String(r.regex).toLowerCase()==='true'||!text.includes(r.from)||r.subject!=='common'&&r.subject!==subject||/[0-9０-９]/.test(r.to)&&!/[0-9０-９]/.test(r.from)||seen.has(key))return false;seen.add(key);return true;}).slice(0,6).map(r=>({heard:r.from,possible:r.to,context:r.memo||r.category||''}));
}
