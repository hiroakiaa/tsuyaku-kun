const versions=new WeakMap();
export function catalogVersion(catalog={}){
 const parts=[catalog.version,catalog.revision,catalog.glossary,catalog.corrections,catalog.bank,catalog.phrases,catalog.terms],cached=versions.get(catalog);if(cached&&parts.every((p,i)=>p===cached.parts[i]&&(!Array.isArray(p)||p.length===cached.lengths[i])))return cached.version;let hash=2166136261;
 for(const part of parts){const text=JSON.stringify(part||[]);for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}}
 const version=(hash>>>0).toString(16);versions.set(catalog,{version,parts,lengths:parts.map(p=>p?.length)});return version;
}
