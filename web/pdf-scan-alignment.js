// Match canonical OCR text to a second OCR pass only to recover geometry.
// Translation content stays canonical; this never rewrites document text or QA evidence.
export function scanTranslationRanges(result,runs,normalize,{quote}={}){
 if(!runs.length||!runs.every(run=>run.item.ocr===true&&Array.isArray(run.item.ocrBox)))return null;
 const source=result.source.map(normalize).join(''),target=runs.map(run=>normalize(run.item.str)).join(''),n=source.length,m=target.length;
 if(n<40||m<40||(n+1)*(m+1)>8000000||Math.abs(n-m)>Math.max(n,m)*.2)return null;
 const columns=m+1,trace=new Uint8Array((n+1)*columns);let previous=new Uint16Array(columns),current=new Uint16Array(columns);for(let j=0;j<=m;j++){previous[j]=j;trace[j]=2;}
 for(let i=1;i<=n;i++){current[0]=i;trace[i*columns]=1;for(let j=1;j<=m;j++){const diagonal=previous[j-1]+(source[i-1]===target[j-1]?0:1),deletion=previous[j]+1,insertion=current[j-1]+1;let best=diagonal,op=0;if(deletion<best){best=deletion;op=1;}if(insertion<best){best=insertion;op=2;}current[j]=best;trace[i*columns+j]=op;}[previous,current]=[current,previous];}
 const difference=previous[m],score=1-difference/Math.max(n,m);if(score<.8)return null;
 const positions=new Int32Array(n).fill(-1),equal=new Uint8Array(n);let i=n,j=m;while(i||j){const op=trace[i*columns+j];if(i&&j&&op===0){positions[i-1]=j-1;equal[i-1]=source[i-1]===target[j-1]?1:0;i--;j--;}else if(i&&(op===1||!j))i--;else j--;}
 const ranges=[];let at=0;for(let index=0;index<result.source.length;index++){const text=normalize(result.source[index]),end=at+text.length;let start=-1,last=-1,matches=0;for(let p=at;p<end;p++){if(positions[p]>=0){if(start<0)start=positions[p];last=positions[p];matches+=equal[p];}}
 const required=text.length<12?.8:.65;if(start>=0&&last>=start&&matches>=Math.ceil(text.length*required))ranges.push({start,end:last+1,translation:result.lines[index]});at=end;}
 if(!ranges.length||ranges.reduce((sum,range)=>sum+range.end-range.start,0)<m*.65)return null;
 const citationRanges=[];const needle=quote?normalize(quote):'',begin=needle?source.indexOf(needle):-1;
 if(begin>=0&&source.indexOf(needle,begin+1)<0){const hits=[];let matches=0;for(let p=begin;p<begin+needle.length;p++)if(positions[p]>=0){hits.push(positions[p]);matches+=equal[p];}if(hits.length&&matches>=needle.length*.65)citationRanges.push({start:hits[0],end:hits.at(-1)+1});}
 return {ranges,score,citationRanges};
}
