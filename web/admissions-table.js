const compact = text => text.normalize('NFKC').replace(/\s/g,'');

export async function admissionsCell(pdf, question) {
  const name = /^([\p{L}・]+?)(?:高等学校|高校)の一般入試/u.exec(question)?.[1];
  if (!name) return null;
  for (let number=1; number<=pdf.numPages; number++) {
    const page=await pdf.getPage(number);
    const {items}=await page.getTextContent();
    if (!compact(items.map(item=>item.str ?? '').join('')).includes(name)) continue;
    const viewport=page.getViewport({scale:1200/page.getViewport({scale:1}).width});
    const cells=items.filter(item=>item.str?.trim()).map(item=>{
      const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
      return {x,y:y-Math.abs(item.height)*viewport.scale*0.25,text:item.str};
    });
    const header=cells.find(cell=>compact(cell.text).includes('一般入試'));
    if (!header) continue;
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:ctx,viewport}).promise;
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
      if(count>width*0.63) {
        if(rules.length && y-rules.at(-1)<4) rules[rules.length-1]=y;
        else rules.push(y);
      }
    }
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
    if(left==null || right==null || schoolRight==null || left<=schoolRight) continue;
    for(let i=0;i<rules.length-1;i++) {
      const start=rules[i], end=rules[i+1];
      if(start<bottom) continue;
      const row=cells.filter(cell=>cell.y>start && cell.y<end);
      const school=row.filter(cell=>cell.x>=schoolLeft && cell.x<schoolRight).sort((a,b)=>a.y-b.y);
      const label=compact(school.map(cell=>cell.text).join('')).replace(/(?:高等学校|高校)$/u,'');
      if(label!==name) continue;
      const values=row.filter(cell=>cell.x>left && cell.x<right).sort((a,b)=>Math.abs(a.y-b.y)<2 ? a.x-b.x : a.y-b.y);
      const quote=values.map(cell=>cell.text.trim()).filter(Boolean).join('\n');
      if(quote) return {label:name+'高校の一般入試（目安）',answer:quote,evidence:[{page:number,quote}]};
    }
  }
  return null;
}
