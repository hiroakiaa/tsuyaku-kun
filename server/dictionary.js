import {translationField} from '../web/core.js';
import {equivalentPhrase} from '../web/phrase-equivalence.js';

const usable=value=>typeof value==='string'&&value.trim()&&!value.startsWith('#')&&!value.startsWith('=');
export function storedTranslations(text,source,targets,data,subject='') {
  // Exact means exact: different numbers, punctuation and context-dependent variants never share a bank entry.
  const rows=(data.bank||[]).filter(r=>r.status==='approved'&&r.sourceLang===source&&r.sourceText===text&&(!r.subject||r.subject==='common'||r.subject===subject));
  const phraseKey=v=>String(v||'').normalize('NFC').trim().replace(/。$/,'');
  const phrases=(data.phrases||[]).filter(r=>source==='ja'&&equivalentPhrase(r.jaText,text)&&!String(r.id||'').startsWith('personal-'));
  const translations={},keys=[];
  for(const code of targets){const candidates=[...rows,...phrases].filter(row=>usable(row[translationField(code)]));const values=[...new Set(candidates.map(row=>row[translationField(code)]))];if(values.length===1){translations[code]=values[0];for(const row of candidates)if(row.bankKey&&!keys.includes(row.bankKey))keys.push(row.bankKey);}}
  return {translations,keys};
}
export function correctionHints(text,rules,subject='') {
  const seen=new Set();return (rules||[]).filter(r=>{const key=r.from+'|'+r.to;if(!r.from||!r.to||String(r.enabled).toLowerCase()!=='true'||String(r.regex).toLowerCase()==='true'||!text.includes(r.from)||r.subject!=='common'&&r.subject!==subject||/[0-9０-９]/.test(r.to)&&!/[0-9０-９]/.test(r.from)||seen.has(key))return false;seen.add(key);return true;}).slice(0,6).map(r=>({heard:r.from,possible:r.to,context:r.memo||r.category||''}));
}
