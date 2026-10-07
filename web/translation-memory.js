import {translationField,translationOf} from './core.js?v=20261007-progressive-1';
const key='tsuyaku-reviewed-memory-v1';
const exact=text=>String(text||'').normalize('NFC').trim();
export class TranslationMemory {
 constructor(storage){this.storage=storage;try{const data=JSON.parse(storage.getItem(key));this.rows=Array.isArray(data?.rows)?data.rows.slice(-150):[];this.corrections=Array.isArray(data?.corrections)?data.corrections.slice(-100):[];}catch{this.rows=[];this.corrections=[];}}
 persist(){this.rows=this.rows.slice(-150);this.corrections=this.corrections.slice(-100);try{this.storage.setItem(key,JSON.stringify({rows:this.rows.slice(-150),corrections:this.corrections.slice(-100)}));}catch{}}
 remember(source,text,translations,unit=''){text=exact(text);if(!text||text.length>600)return false;const clean={};for(const [code,value] of Object.entries(translations||{}))if(code!==source&&typeof value==='string'&&value.trim()&&value.length<=1500)clean[code]=value.trim();if(!Object.keys(clean).length)return false;
 const row=this.rows.find(r=>r.source===source&&r.text===text&&r.unit===unit);if(row){row.translations={...row.translations,...clean};row.at=Date.now();}else this.rows.push({source,text,translations:clean,unit,at:Date.now()});this.persist();return true;}
 lookup(source,text,targets,unit='',catalog={},partial=false){text=exact(text);const row=this.rows.find(r=>r.source===source&&r.text===text&&r.unit===unit);const out={[source]:text};if(row)Object.assign(out,row.translations);
 const bank=(catalog.bank||[]).filter(r=>r.status==='approved'&&r.sourceLang===source&&exact(r.sourceText)===text&&(!r.subject||r.subject==='common'||r.subject===unit));
 const phrase=source==='ja'?(catalog.phrases||[]).find(r=>exact(r.jaText)===text&&!String(r.id||'').startsWith('personal-')):null;
 const glossary=source==='ja'?(catalog.glossary||[]).find(r=>r.status==='approved'&&exact(r.ja)===text):null;
 for(const code of targets)if(!out[code])for(const r of [...bank,...(phrase?[phrase]:[]),...(glossary?[glossary]:[])]){const value=r[translationField(code)]||(r===glossary&&code==='en'?r.en:'');if(typeof value==='string'&&value.trim()&&!/^[#=]/.test(value)){out[code]=value;break;}}
 const materials=[...(catalog.phrases||[]).filter(r=>!String(r.id||'').startsWith('personal-')),...(catalog.terms||[])];
 const matches=materials.filter(r=>exact(translationOf(r,source))===text);
 for(const code of targets)if(!out[code]){const values=[...new Set(matches.map(r=>translationOf(r,code)).filter(v=>typeof v==='string'&&v.trim()&&!/^[#=]/.test(v)))];if(values.length===1)out[code]=values[0];}
 if(partial)return {translations:out,missing:targets.filter(c=>!out[c]),source:row?'reviewed':'spreadsheet'};
 return targets.every(c=>typeof out[c]==='string'&&out[c].trim())?{translations:out,source:row?'reviewed':'spreadsheet'}:null;}
 correct(heard,corrected,unit=''){heard=exact(heard);corrected=exact(corrected);if(!heard||!corrected||heard===corrected||heard.length>600||corrected.length>600)return;const existing=this.corrections.find(r=>r.heard===heard&&r.unit===unit);if(existing)existing.corrected=corrected;else this.corrections.push({heard,corrected,unit});this.persist();}
 corrected(heard,unit=''){const text=exact(heard);return this.corrections.find(r=>r.heard===text&&r.unit===unit)?.corrected||text;}
 hints(unit=''){return this.corrections.filter(r=>r.unit===unit).slice(-10).map(r=>r.corrected).filter(t=>t.length<=40);}
}
