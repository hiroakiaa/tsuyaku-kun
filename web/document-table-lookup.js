const compact = text => text.normalize('NFKC').replace(/\s/g,'');

export async function lookupTableCell(pdf, question) {
  const match = /^([^の？?、]{2,40}?)の([^？?、]{2,40}?)(?:の基準(?:は)?|を教えてください|を教えて|はいくら|は何|はいつ|はどこ|は)?[？?。]?$/u.exec(compact(question));
  if (!match) return null;
  const [,rowName,columnName]=match;
  const normalizeLabel = text=>compact(text).replace(/(?:高等学校|高校)$/u,'');
  const matches=[];

  for (let number=1; number<=pdf.numPages; number++) {
    const page=await pdf.getPage(number);
    const {items}=await page.getTextContent();

    const viewport=page.getViewport({scale:1200/page.getViewport({scale:1}).width});
    const cells=items.filter(item=>item.str?.trim()).map(item=>{
      const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
      return {x,y:y-Math.abs(item.height)*viewport.scale*0.25,text:item.str};
    });
    const headers=cells.filter(cell=>{
      const text=compact(cell.text);
      if(text===columnName || text.startsWith(columnName+'(')) return true;
      if(!columnName.startsWith(text) || text.length<2) return false;
      return cells.some(next=>Math.abs(next.y-cell.y)<3 && next.x>cell.x &&
        next.x-cell.x<50 && (text+compact(next.text)).startsWith(columnName));
    });
    if (!headers.length) continue;
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvas,viewport}).promise;
    const {width,height}=canvas;
    const pixels=ctx.getImageData(0,0,width,height).data;
    const dark=(x,y)=>{
      const i=(y*width+x)*4;
      return pixels[i]<155 && pixels[i+1]<155 && pixels[i+2]<155;
    };
    const rules=[];
    for (let y=0;y<height;y++) {
      let count=0;
      for(let x=0;x<width;x++) if(dark(x,y)) count++;
      if(count>width*0.55) {
        if(rules.length && y-rules.at(-1)<4) rules[rules.length-1]=y;
        else rules.push(y);
      }
    }
    for (const header of headers) {
      const top=rules.findLast(y=>y<header.y);
      const bottom=rules.find(y=>y>header.y);
      if(top==null || bottom==null) continue;
      const columns=[];
      for(let x=0;x<width;x++) {
        let count=0;
        for(let y=top+1;y<bottom;y++) if(dark(x,y)) count++;
        if(count>(bottom-top)*0.8) {
          if(columns.length && x-columns.at(-1)<4) columns[columns.length-1]=x;
          else columns.push(x);
        }
      }
      const left=columns.findLast(x=>x<=header.x+1);
      const right=columns.find(x=>x>header.x+3);
      const schoolLeft=columns[0], schoolRight=columns[1];
      if(left==null || right==null || schoolRight==null || left<schoolRight) continue;
      const schoolRules = rules.filter(y=>{
        let count=0;
        for(let x=schoolLeft+2;x<schoolRight-2;x++) {
          if(dark(x,y) || (y>0 && dark(x,y-1))) count++;
        }
        return count>(schoolRight-schoolLeft)*0.65;
      });
      for(let i=0;i<schoolRules.length-1;i++) {
        const start=schoolRules[i], end=schoolRules[i+1];
        if(start<bottom) continue;
        const row=cells.filter(cell=>cell.y>start && cell.y<end);
        const school=row.filter(cell=>cell.x>=schoolLeft && cell.x<schoolRight).sort((a,b)=>a.y-b.y);
        const label=compact(school.map(cell=>cell.text).join('')).replace(/(?:高等学校|高校)$/u,'');
        if(label!==normalizeLabel(rowName) && !label.includes(normalizeLabel(rowName))) continue;
        const values=row.filter(cell=>cell.x>left && cell.x<right).sort((a,b)=>Math.abs(a.y-b.y)<2 ? a.x-b.x : a.y-b.y);
        const quote=values.map(cell=>cell.text.trim()).filter(Boolean).join('\n');
        const key = [number,start,end,left,right].join(':');
        if(quote && !matches.some(item=>item.key===key)) matches.push({key,label,exact:label===normalizeLabel(rowName),answer:quote,evidence:[{page:number,quote}]});
      }
    }
  }
  const exact=matches.filter(item=>item.exact);
  const candidates=exact.length ? exact : matches;
  if(candidates.length!==1) return null;
  const {label,answer,evidence}=candidates[0];
  return {label:label+'の'+columnName,answer,evidence};
}
