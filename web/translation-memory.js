import {catalogVersion} from './catalog-version.js?v=20261008-safety-1';
import {ReviewedStore,memoryKey,retentionScore} from './reviewed-store.js?v=20261008-report-2';
import {translationField,translationOf} from './core.js?v=20261007-progressive-1';
import {phraseIdentity} from './phrase-equivalence.js?v=20261008-report-2';
const key='tsuyaku-reviewed-memory-v1';
const exact=text=>String(text||'').normalize('NFC').trim();
// Catalog objects are replaced when refreshed; weak keys release old indexes.
const catalogIndexes=new WeakMap();
function indexedCatalog(catalog,source){
 const arrays=[catalog.bank,catalog.phrases,catalog.glossary,catalog.terms];let cached=catalogIndexes.get(catalog);if(!cached||arrays.some((a,i)=>a!==cached.arrays[i]||(a?.length||0)!==cached.lengths[i])){cached={arrays,lengths:arrays.map(a=>a?.length||0),languages:new Map()};catalogIndexes.set(catalog,cached);}const languages=cached.languages;if(languages.has(source))return languages.get(source);
 const index=new Map();const add=(text,kind,row)=>{text=phraseIdentity(text,source);if(!text)return;let bucket=index.get(text);if(!bucket){bucket={bank:[],phrases:[],glossary:[],materials:[]};index.set(text,bucket);}bucket[kind].push(row);};
 for(const row of catalog.bank||[])if(row.status==='approved'&&row.sourceLang===source)add(row.sourceText,'bank',row);
 for(const row of catalog.phrases||[])if(!String(row.id||'').startsWith('personal-')){if(source==='ja')add(row.jaText,'phrases',row);add(translationOf(row,source),'materials',row);}
 if(source==='ja')for(const row of catalog.glossary||[])if(row.status==='approved')add(row.ja,'glossary',row);
 for(const row of catalog.terms||[])add(translationOf(row,source),'materials',row);
 languages.set(source,index);return index;
}
export class TranslationMemory {
 constructor(storage,store=new ReviewedStore()){this.storage=storage;this.store=store;this.hot=new Map();try{const data=JSON.parse(storage.getItem(key));this.rows=Array.isArray(data?.rows)?data.rows.slice(-150):[];this.corrections=Array.isArray(data?.corrections)?data.corrections.slice(-100):[];}catch{this.rows=[];this.corrections=[];}this.rows=this.rows.filter(r=>r&&typeof r.text==='string'&&r.translations&&typeof r.translations==='object');for(const r of this.rows){r.unit=r.unit||'';this.hot.set(memoryKey(r.source,r.text,r.unit),r);void this.store.put(r);}}
 persist(){this.rows=[...this.hot.values()].sort((a,b)=>retentionScore(b)-retentionScore(a)).slice(0,150);this.hot=new Map(this.rows.map(r=>[memoryKey(r.source,r.text,r.unit),r]));this.corrections=this.corrections.slice(-100);try{this.storage.setItem(key,JSON.stringify({rows:this.rows.slice(-150),corrections:this.corrections.slice(-100)}));}catch{}}
 remember(source,text,translations,unit=''){text=exact(text);if(!text||text.length>600)return false;const clean={};for(const [code,value] of Object.entries(translations||{}))if(code!==source&&typeof value==='string'&&value.trim()&&value.length<=1500)clean[code]=value.trim();if(!Object.keys(clean).length)return false;
 const version=catalogVersion(this.catalog||{}),id=memoryKey(source,text,unit),candidate=this.hot.get(id),row=candidate?.catalogVersion===version?candidate:null,next={...row,source,text,unit,catalogVersion:version,translations:{...row?.translations,...clean},at:Date.now(),lastUsed:Date.now(),hits:row?.hits||0};this.hot.set(id,next);this.persist();void this.store.get(id).then(old=>this.store.put({...old,...next,translations:{...(old?.catalogVersion===version?old.translations:{}),...next.translations}}));return true;}
 lookup(source,text,targets,unit='',catalog=this.catalog||{},partial=false){this.catalog=catalog;text=exact(text);const version=catalogVersion(catalog),candidate=this.hot.get(memoryKey(source,text,unit)),row=candidate&&candidate.catalogVersion===version?candidate:null;if(row){row.hits=(row.hits||0)+1;row.lastUsed=Date.now();if(row.hits===1||row.hits%10===0)void this.store.put(row);}const out={[source]:text};if(row)Object.assign(out,row.translations);
 const bucket=indexedCatalog(catalog,source).get(phraseIdentity(text,source));
 const bank=(bucket?.bank||[]).filter(r=>!r.subject||r.subject==='common'||r.subject===unit);
 const phraseRows=bucket?.phrases||[];
 const glossary=bucket?.glossary[0];
 for(const code of targets)if(!out[code]){const candidates=[...bank,...phraseRows,...(glossary?[glossary]:[])];const values=[...new Set(candidates.map(r=>r[translationField(code)]||(r===glossary&&code==='en'?r.en:'')).filter(v=>typeof v==='string'&&v.trim()&&!/^[#=]/.test(v)))];if(values.length===1)out[code]=values[0];}
 const matches=bucket?.materials||[];
 for(const code of targets)if(!out[code]){const values=[...new Set(matches.map(r=>translationOf(r,code)).filter(v=>typeof v==='string'&&v.trim()&&!/^[#=]/.test(v)))];if(values.length===1)out[code]=values[0];}
 if(partial)return {translations:out,missing:targets.filter(c=>!out[c]),source:row?'reviewed':'spreadsheet',diagnostic:{reason:targets.every(c=>out[c])?'complete':row||bucket?'missing_languages':'no_match',missing:targets.filter(c=>!out[c])}};
 return targets.every(c=>typeof out[c]==='string'&&out[c].trim())?{translations:out,source:row?'reviewed':'spreadsheet'}:null;}
 async lookupAsync(source,text,targets,unit='',catalog=this.catalog||{},partial=false){
 text=exact(text);const hotResult=this.lookup(source,text,targets,unit,catalog,partial);if(hotResult&&(!partial||!hotResult.missing.length))return hotResult;
 let timer;const id=memoryKey(source,text,unit),legacy=JSON.stringify([source,text,unit]);const read=async()=>await this.store.get(id)||(id!==legacy?await this.store.get(legacy):null);const row=await Promise.race([read(),new Promise(resolve=>timer=setTimeout(()=>resolve(null),120))]);clearTimeout(timer);
 if(row&&row.catalogVersion===catalogVersion(catalog)&&row.source===source&&phraseIdentity(row.text,source)===phraseIdentity(text,source)&&row.unit===unit&&row.translations){row.lastUsed=Date.now();row.hits=(row.hits||0)+1;this.hot.set(id,row);this.persist();void this.store.put(row);return this.lookup(source,text,targets,unit,catalog,partial);}return hotResult;
 }
 correct(heard,corrected,unit=''){heard=exact(heard);corrected=exact(corrected);if(!heard||!corrected||heard===corrected||heard.length>600||corrected.length>600)return;const existing=this.corrections.find(r=>r.heard===heard&&r.unit===unit);if(existing)existing.corrected=corrected;else this.corrections.push({heard,corrected,unit});this.persist();}
 corrected(heard,unit=''){const text=exact(heard);return this.corrections.find(r=>r.heard===text&&r.unit===unit)?.corrected||text;}
 hints(unit=''){return this.corrections.filter(r=>r.unit===unit).slice(-10).map(r=>r.corrected).filter(t=>t.length<=40);}
}
