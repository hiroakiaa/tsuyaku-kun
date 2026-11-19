const normalize=value=>String(value).normalize('NFKC').replace(/[\s|]/gu,'');
function splitTranslation(text,weights){
 const chars=Array.from(String(text)),total=weights.reduce((a,b)=>a+b,0);let from=0,weight=0;
 return weights.map((w,i)=>{
  weight+=w;let end=i===weights.length-1?chars.length:Math.max(from,Math.round(chars.length*weight/total));
  if(end>from&&end<chars.length&&/[A-Za-zÀ-ž]/u.test(chars[end-1])&&/[A-Za-zÀ-ž]/u.test(chars[end])){
   const candidates=[];for(let at=Math.max(from,end-16);at<Math.min(chars.length,end+16);at++)if(/\s/u.test(chars[at]))candidates.push(at+1);
   if(candidates.length)end=candidates.sort((a,b)=>Math.abs(a-end)-Math.abs(b-end))[0];
  }
  const result=chars.slice(from,end).join('');from=end;return result.trim();
 });
}
export function alignPdfTranslation(result,items){
 if(!Array.isArray(result.source)||!Array.isArray(result.lines)||result.source.length!==result.lines.length)return null;
 let offset=0;const runs=items.filter(item=>item.str?.trim()).map(item=>{const start=offset;offset+=normalize(item.str).length;return {item,start,end:offset};});
 const text=runs.map(run=>normalize(run.item.str)).join(''),ranges=[];
 for(let i=0;i<result.source.length;i++){
  const needle=normalize(result.source[i]);if(!needle)continue;
  let start=text.indexOf(needle);
  while(start>=0&&ranges.some(range=>start<range.end&&start+needle.length>range.start))start=text.indexOf(needle,start+1);
  if(start<0)return null;
  const end=start+needle.length,matched=runs.filter(run=>run.start>=start&&run.end<=end);
  if(!matched.length||matched[0].start!==start||matched.at(-1).end!==end)return null;
  ranges.push({start,end,translation:result.lines[i]});
 }
 if(!ranges.length)return null;
 const groups=[];
 for(const run of runs){
  const range=ranges.find(range=>run.start>=range.start&&run.end<=range.end),last=groups.at(-1),previous=last?.runs.at(-1).item;
  const height=Math.max(run.item.height||0,previous?.height||0);
  const sameRow=previous && Math.abs(run.item.transform[5]-previous.transform[5])<=height*.25 && run.item.transform[4]>=previous.transform[4] && run.item.transform[4]-previous.transform[4]-previous.width<=height*2 && !run.item.ocrBox && !previous.ocrBox;
  if(last&&last.range===range&&sameRow)last.runs.push(run);else groups.push({range,runs:[run]});
 }
 for(const range of ranges){
  const matching=groups.filter(group=>group.range===range),pieces=splitTranslation(range.translation,matching.map(group=>group.runs.reduce((n,run)=>n+run.end-run.start,0)));
  matching.forEach((group,i)=>{group.translation=pieces[i];});
 }
 return {...result,source:groups.map(group=>group.runs.map(run=>run.item.str).join('')),lines:groups.map(group=>group.translation??group.runs.map(run=>run.item.str).join('')),untranslatedIndices:groups.flatMap((group,i)=>group.range?[]:[i])};
}
