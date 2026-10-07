import {translationField,translationOf} from './core.js?v=20261007-progressive-1';
const key='tsuyaku-reviewed-memory-v1';
const exact=text=>String(text||'').normalize('NFC').trim();
// Catalog objects are replaced when refreshed; weak keys release old indexes.
const catalogIndexes=new WeakMap();
function indexedCatalog(catalog,source){
 const arrays=[catalog.bank,catalog.phrases,catalog.glossary,catalog.terms];let cached=catalogIndexes.get(catalog);if(!cached||arrays.some((a,i)=>a!==cached.arrays[i]||(a?.length||0)!==cached.lengths[i])){cached={arrays,lengths:arrays.map(a=>a?.length||0),languages:new Map()};catalogIndexes.set(catalog,cached);}const languages=cached.languages;if(languages.has(source))return languages.get(source);
 const index=new Map();const add=(text,kind,row)=>{text=exact(text);if(!text)return;let bucket=index.get(text);if(!bucket){bucket={bank:[],phrases:[],glossary:[],materials:[]};index.set(text,bucket);}bucket[kind].push(row);};
 for(const row of catalog.bank||[])if(row.status==='approved'&&row.sourceLang===source)add(row.sourceText,'bank',row);
 for(const row of catalog.phrases||[])if(!String(row.id||'').startsWith('personal-')){if(source==='ja')add(row.jaText,'phrases',row);add(translationOf(row,source),'materials',row);}
 if(source==='ja')for(const row of catalog.glossary||[])if(row.status==='approved')add(row.ja,'glossary',row);
 for(const row of catalog.terms||[])add(translationOf(row,source),'materials',row);
 languages.set(source,index);return index;
}
export class TranslationMemory {
 constructor(storage){this.storage=storage;try{const data=JSON.parse(storage.getItem(key));this.rows=Array.isArray(data?.rows)?data.rows.slice(-150):[];this.corrections=Array.isArray(data?.corrections)?data.corrections.slice(-100):[];}catch{this.rows=[];this.corrections=[];}}
 persist(){this.rows=this.rows.slice(-150);this.corrections=this.corrections.slice(-100);try{this.storage.setItem(key,JSON.stringify({rows:this.rows.slice(-150),corrections:this.corrections.slice(-100)}));}catch{}}
 remember(source,text,translations,unit=''){text=exact(text);if(!text||text.length>600)return false;const clean={};for(const [code,value] of Object.entries(translations||{}))if(code!==source&&typeof value==='string'&&value.trim()&&value.length<=1500)clean[code]=value.trim();if(!Object.keys(clean).length)return false;
 const row=this.rows.find(r=>r.source===source&&r.text===text&&r.unit===unit);if(row){row.translations={...row.translations,...clean};row.at=Date.now();}else this.rows.push({source,text,translations:clean,unit,at:Date.now()});this.persist();return true;}
 lookup(source,text,targets,unit='',catalog={},partial=false){text=exact(text);const row=this.rows.find(r=>r.source===source&&r.text===text&&r.unit===unit);const out={[source]:text};if(row)Object.assign(out,row.translations);
 const bucket=indexedCatalog(catalog,source).get(text);
 const bank=(bucket?.bank||[]).filter(r=>!r.subject||r.subject==='common'||r.subject===unit);
 const phrase=bucket?.phrases[0];
 const glossary=bucket?.glossary[0];
 for(const code of targets)if(!out[code])for(const r of [...bank,...(phrase?[phrase]:[]),...(glossary?[glossary]:[])]){const value=r[translationField(code)]||(r===glossary&&code==='en'?r.en:'');if(typeof value==='string'&&value.trim()&&!/^[#=]/.test(value)){out[code]=value;break;}}
 const matches=bucket?.materials||[];
 for(const code of targets)if(!out[code]){const values=[...new Set(matches.map(r=>translationOf(r,code)).filter(v=>typeof v==='string'&&v.trim()&&!/^[#=]/.test(v)))];if(values.length===1)out[code]=values[0];}
 if(partial)return {translations:out,missing:targets.filter(c=>!out[c]),source:row?'reviewed':'spreadsheet'};
 return targets.every(c=>typeof out[c]==='string'&&out[c].trim())?{translations:out,source:row?'reviewed':'spreadsheet'}:null;}
 correct(heard,corrected,unit=''){heard=exact(heard);corrected=exact(corrected);if(!heard||!corrected||heard===corrected||heard.length>600||corrected.length>600)return;const existing=this.corrections.find(r=>r.heard===heard&&r.unit===unit);if(existing)existing.corrected=corrected;else this.corrections.push({heard,corrected,unit});this.persist();}
 corrected(heard,unit=''){const text=exact(heard);return this.corrections.find(r=>r.heard===text&&r.unit===unit)?.corrected||text;}
 hints(unit=''){return this.corrections.filter(r=>r.unit===unit).slice(-10).map(r=>r.corrected).filter(t=>t.length<=40);}
}
