export function validatedReadingQuality(value,count){
 let input;try{input=typeof value==='string'?JSON.parse(value):value;}catch{return [];}if(!Array.isArray(input))return [];
 return input.slice(0,count).flatMap((q,index)=>{if(!q||!['blank','readable','uncertain'].includes(q.status))return [];const item={page:index+1,status:q.status};for(const key of ['confidence','correction','illumination'])if(Number.isFinite(q[key]))item[key]=Math.round(Math.max(key==='correction'?-15:0,Math.min(key==='correction'?15:key==='confidence'?100:255,q[key]))*10)/10;return [item];});
}
export function unreadablePages(quality){return (quality??[]).filter(q=>q.status==='uncertain').map(q=>q.page);}
