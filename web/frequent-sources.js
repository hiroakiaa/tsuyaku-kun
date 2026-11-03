// Source candidates only: repetition is not proof of recognition or translation accuracy.
import {schoolPhraseList} from './school-phrases.js';
const KEY='tsuyaku-frequent-sources-v1',DAY=86400000;
const publicKeys=new Set(schoolPhraseList().flatMap(row=>Object.entries(row).filter(([code])=>code!=='id').map(([code,text])=>JSON.stringify([code,text]))));
const exact=s=>String(s||'').normalize('NFC').trim();
export class FrequentSources{
 constructor(storage,{personal=false,now=()=>Date.now()}={}){Object.assign(this,{storage,personal,now});this.rows=[];this.events=[];try{const saved=JSON.parse(storage.getItem(KEY)||'null');this.rows=Array.isArray(saved?.rows)?saved.rows:[];this.events=Array.isArray(saved?.events)?saved.events:[];}catch{}this.save();}
 publicText(source,text){return publicKeys.has(JSON.stringify([source,text]));}
 allowed(source,text){return typeof source==='string'&&typeof text==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]+)?$/.test(source)&&text.length>=2&&text.length<=240&&!/https?:|@|\d{3}[-ー ]\d{3,4}[-ー ]\d{4}|[\u0000-\u001f]/.test(text)&&(this.personal||this.publicText(source,text));}
 prune(){const cutoff=this.now()-DAY;this.rows=this.rows.filter(r=>r&&this.allowed(r.source,r.text)&&Number.isSafeInteger(r.count)&&r.count>0&&Number.isFinite(r.at)&&r.at>cutoff).sort((a,b)=>b.at-a.at).slice(0,200);const keys=new Set(this.rows.map(r=>JSON.stringify([r.source,r.text])));this.events=this.events.filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.at)&&e.at>cutoff&&keys.has(e.key)).slice(-500);}
 save(){this.prune();try{this.storage.setItem(KEY,JSON.stringify({rows:this.rows,events:this.events}));return true;}catch{return false;}}
 observe({id,source,text,final=true,continuing=false,revision=0}){if(!Number.isSafeInteger(revision)||revision<0||!final||continuing||typeof id!=='string'||!id)return false;text=exact(text);if(!this.allowed(source,text))return false;this.prune();const key=JSON.stringify([source,text]),old=this.events.find(e=>e.id===id);if(old&&revision<old.revision)return false;if(old&&old.key===key){if(revision>old.revision){old.revision=revision;this.save();}return false;}if(old){const row=this.rows.find(r=>JSON.stringify([r.source,r.text])===old.key);if(row)row.count--;this.events=this.events.filter(e=>e.id!==id);}const at=this.now();let row=this.rows.find(r=>r.source===source&&r.text===text);if(!row){row={source,text,count:0,at};this.rows.push(row);}row.count++;row.at=at;this.events.push({id,key,revision,at});return this.save();}
 list(){this.prune();return this.rows.filter(r=>r.count>=2).sort((a,b)=>b.count-a.count||b.at-a.at).map(r=>({...r}));}
 clear(){this.rows=[];this.events=[];return this.save();}
}
