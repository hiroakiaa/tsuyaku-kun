export function automaticDocumentTitle(fileName,now=new Date()){
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
 const stem=String(fileName||'').split(/[\\/]/).pop().replace(/\.[^.]+$/u,'').replace(/[\u0000-\u001f]/g,'').trim()||'資料';
 return date+'_'+stem.slice(0,91).replace(/[\uD800-\uDBFF]$/u,'');
}
