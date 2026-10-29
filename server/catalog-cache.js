// Shared reference data only. Never cache authentication, speech or user-specific results.
export function catalogRevision(data){const text=JSON.stringify(data);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return 'c1-'+(hash>>>0).toString(16).padStart(8,'0');}
export function createCatalogCache(fallback,{now=Date.now,ttlMs=300000,retryMs=30000,maxEntries=4,maxBytes=2000000}={}){
 const entries=new Map(),fallbackRevision=catalogRevision(fallback);
 const snapshot=entry=>({data:entry?.data||fallback,source:entry?.data?'spreadsheet':'bundled',revision:entry?.revision||fallbackRevision,ageMs:entry?.data?Math.max(0,now()-entry.at):null,fresh:!!entry?.data&&now()<entry.until});
 return {peek(key){return snapshot(entries.get(key));},refresh(key,load){
  if(!key)return Promise.resolve(snapshot());let entry=entries.get(key);
  if(entry?.pending)return entry.pending;
  if(entry&&(now()<entry.until||now()<entry.retryAt))return Promise.resolve(snapshot(entry));
  if(!entry){if(entries.size>=maxEntries){const victim=[...entries].find(([,value])=>!value.pending);if(!victim)return Promise.resolve(snapshot());entries.delete(victim[0]);}entry={until:0,retryAt:0};entries.set(key,entry);}
  entry.pending=Promise.resolve().then(load).then(value=>{if(!value||Array.isArray(value)||typeof value!=='object'||!Array.isArray(value.languages)||!value.languages.length||['languages','phrases','terms','glossary','bank','corrections'].some(key=>value[key]!==undefined&&(!Array.isArray(value[key])||value[key].some(row=>!row||Array.isArray(row)||typeof row!=='object'))))throw Error('Invalid shared catalog');const text=JSON.stringify(value);if(text.length*2>maxBytes)throw Error('Shared catalog too large');entry.data=value;entry.revision=catalogRevision(value);entry.at=now();entry.until=now()+ttlMs;entry.retryAt=0;return snapshot(entry);}).catch(()=>{entry.retryAt=now()+retryMs;return snapshot(entry);}).finally(()=>{entry.pending=null;});return entry.pending;
 },get size(){return entries.size;}};
}
export function exposeCatalog(snapshot){return {...snapshot.data,_catalog:{revision:snapshot.revision,source:snapshot.source}};}
