export function validatedReadingQuality(value,count){
 let input;try{input=typeof value==='string'?JSON.parse(value):value;}catch{return [];}if(!Array.isArray(input))return [];
 return input.slice(0,count).flatMap((q,index)=>{if(!q||!['blank','readable','uncertain'].includes(q.status))return [];const item={page:index+1,status:q.status};for(const key of ['confidence','correction','illumination','unresolvedNumbers'])if(Number.isFinite(q[key]))item[key]=Math.round(Math.max(key==='correction'?-15:0,Math.min(key==='correction'?15:['confidence','unresolvedNumbers'].includes(key)?100:255,q[key]))*10)/10;return [item];});
}
export function unreadablePages(quality){return (quality??[]).filter(q=>q.status==='uncertain'||q.unresolvedNumbers>0).map(q=>q.page);}

export function mergeReadingQuality(current,incoming,{start,replaceCount=0,newCount}){
 const valid=q=>Number.isInteger(q?.page)&&q.page>0&&['blank','readable','uncertain'].includes(q.status);
 return [...(current??[]).filter(q=>valid(q)&&q.page<start),...(incoming??[]).filter(q=>valid(q)&&q.page<=newCount).map(q=>({...q,page:start+q.page-1})),...(current??[]).filter(q=>valid(q)&&q.page>=start+replaceCount).map(q=>({...q,page:q.page+newCount-replaceCount}))].sort((a,b)=>a.page-b.page);
}
