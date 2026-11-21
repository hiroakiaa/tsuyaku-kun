import {scanTranslationRanges} from './pdf-scan-alignment.js?v=1';
export const pdfComparableText=value=>String(value).normalize('NFKC').replace(/[\s|\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu,'');
const normalize=pdfComparableText;
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
function splitItem(item,cuts){
 const text=String(item.str),tokens=[];let raw=0,offset=0;
 for(const char of text){const count=normalize(char).length;tokens.push({from:offset,to:offset+count,rawFrom:raw,rawTo:raw+char.length});offset+=count;raw+=char.length;}
 const boundary=n=>n===0?0:n===offset?text.length:tokens.find(token=>token.to===n&&token.to>token.from)?.rawTo;
 const total=[...text].length||1,out=[];
 for(let i=0;i<cuts.length-1;i++){const start=boundary(cuts[i]),end=boundary(cuts[i+1]);if(start===undefined||end===undefined)return null;
  const left=[...text.slice(0,start)].length/total,right=[...text.slice(0,end)].length/total,transform=[...item.transform],angle=Math.atan2(transform[1],transform[0]);transform[4]+=Math.cos(angle)*item.width*left;transform[5]+=Math.sin(angle)*item.width*left;
  const part={...item,str:text.slice(start,end),width:item.width*(right-left),transform};
  if(item.ocrBox){if(item.verticalLayout)return null;const [x,y,w,h]=item.ocrBox;part.ocrBox=[x+w*left,y,w*(right-left),h];}
  out.push(part);
 }return out;
}
export function alignPdfTranslation(result,items,options={}){
 if(!Array.isArray(result.source)||!Array.isArray(result.lines)||result.source.length!==result.lines.length)return null;
 let offset=0;let runs=items.filter(item=>normalize(item.str||'')).map(item=>{const start=offset;offset+=normalize(item.str).length;return {item,start,end:offset};});
 const text=runs.map(run=>normalize(run.item.str)).join('');let ranges=[],scanAlignment;
 for(let i=0;i<result.source.length;i++){
  const needle=normalize(result.source[i]);if(!needle)continue;let start=text.indexOf(needle);
  while(start>=0&&ranges.some(range=>start<range.end&&start+needle.length>range.start))start=text.indexOf(needle,start+1);
  if(start<0){scanAlignment=scanTranslationRanges(result,runs,normalize,options);if(!scanAlignment)return null;ranges=scanAlignment.ranges;break;}const end=start+needle.length;ranges.push({start,end,translation:result.lines[i]});
 }
 if(!scanAlignment&&runs.every(run=>run.item.ocr===true)&&ranges.reduce((sum,range)=>sum+range.end-range.start,0)<text.length){
  const recovered=scanTranslationRanges(result,runs,normalize,options);
  if(recovered&&recovered.ranges.reduce((sum,range)=>sum+range.end-range.start,0)>ranges.reduce((sum,range)=>sum+range.end-range.start,0)){scanAlignment=recovered;ranges=recovered.ranges;}
 }
 if(!ranges.length)return null;
 const split=[];
 for(const run of runs){const cuts=[...new Set([0,run.end-run.start,...ranges.flatMap(range=>[range.start,range.end]).filter(n=>n>run.start&&n<run.end).map(n=>n-run.start)])].sort((a,b)=>a-b);
  const parts=cuts.length>2?splitItem(run.item,cuts):[run.item];if(!parts)return null;
  for(let i=0;i<parts.length;i++)split.push({item:parts[i],start:run.start+cuts[i],end:run.start+cuts[i+1]});
 }
 runs=split;
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
 return {...result,...(scanAlignment?{scanAlignment:{score:scanAlignment.score,citationRanges:scanAlignment.citationRanges}}:{}),items:runs.map(run=>run.item),source:groups.map(group=>group.runs.map(run=>run.item.str).join('')),lines:groups.map(group=>group.translation??group.runs.map(run=>run.item.str).join('')),untranslatedIndices:groups.flatMap((group,i)=>group.range?[]:[i])};
}
