const compact = text => text.normalize('NFKC').replace(/\s/g,'');

const pdfPageText = new WeakMap();
export function readPdfPageText(page) {
  if (!pdfPageText.has(page)) pdfPageText.set(page,page.getTextContent().catch(error=>{
    pdfPageText.delete(page);
    throw error;
  }));
  return pdfPageText.get(page);
}

async function pageText(pdf, number) {
  const page = await pdf.getPage(number);
  return {page,...await readPdfPageText(page)};
}

export async function lookupTableCell(pdf, question) {
  const match = /^([^の？?、]{2,40}?)の([^？?、]{2,40}?)(?:の基準(?:は)?|を教えてください|を教えて|はいくら|は何|はいつ|はどこ|は)?[？?。]?$/u.exec(compact(question));
  if (!match) return null;
  const [,rowName,columnName]=match;
  const normalizeLabel = text=>compact(text).replace(/(?:高等学校|高校)$/u,'');
  const matches=[];

  for (let number=1; number<=pdf.numPages; number++) {
    const {page,items}=await pageText(pdf,number);

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

export async function lookupAlignedTableCell(pdf, question) {
  const terms=compact(question).replace(/[?？。]$/u,'').replace(/(?:はいくら(?:ですか)?|は何ですか|を教えてください|は)$/u,'').split('の');
  if(terms.length<2 || terms.length>3 || terms.some(term=>term.length<2)) return null;
  const [entity]=terms;
  const field=terms.at(-1);
  const matches=[];
  for(let page=1;page<=pdf.numPages;page++){
    const {items}=await pageText(pdf,page);
    const fragments=items.filter(item=>item.str?.trim()).map(item=>({
      x:item.transform[4],y:item.transform[5],end:item.transform[4]+item.width,text:item.str
    })).sort((a,b)=>b.y-a.y || a.x-b.x);
    const lines=[];
    for(const fragment of fragments){
      if(Math.abs((lines.at(-1)?.y??Infinity)-fragment.y)>1.5) lines.push({y:fragment.y,cells:[]});
      const cells=lines.at(-1).cells;
      const last=cells.at(-1);
      if(last && fragment.x-last.end>=-1 && fragment.x-last.end<=3){
        last.text+=fragment.text;
        last.end=fragment.end;
      }else cells.push({...fragment});
    }
    const at=(line,x)=>line?.cells.find(cell=>Math.abs(cell.x-x)<2);
    for(const [index,header] of lines.entries()){
      if(header.cells.length<3) continue;
      const repeated=terms.length===2 && new Set(header.cells.map(cell=>compact(cell.text))).size===1;
      const key=repeated ? lines[index+1]?.cells[0] : header.cells[0];
      const columns=repeated ? header.cells : header.cells.slice(1);
      if(!key || key.x>=columns[0].x) continue;
      const gap=lines[index+1] && header.y-lines[index+1].y;
      if(!gap || gap<8) continue;
      const body=lines.slice(index+1).filter(line=>Math.abs((header.y-line.y)/gap-Math.round((header.y-line.y)/gap))<0.07);
      const byPosition=(line)=>columns.every(column=>at(line,column.x));
      if(terms.length===3){
        const column=columns.find(cell=>compact(cell.text)===field);
        const selector=columns.find(cell=>cell!==column && body.some(line=>compact(at(line,cell.x)?.text??'')===terms[1]));
        if(!column || !selector) continue;
        const group=lines.slice(index+1).filter(line=>compact(at(line,key.x)?.text??'')===entity);
        if(group.length!==1) continue;
        const [anchor]=group;
        for(const row of body){
          const value=at(row,column.x);
          if(compact(at(row,selector.x)?.text??'')!==terms[1] || at(row,key.x) || value) continue;
          const neighboring=body.filter(line=>Math.abs(line.y-anchor.y)<=Math.abs(row.y-anchor.y)+1 && at(line,selector.x));
          if(neighboring.length!==2 || Math.abs(neighboring[0].y-neighboring[1].y-gap)>1.5 ||
            neighboring.some(line=>at(line,key.x)) || !neighboring.some(byPosition)) continue;
          matches.push({label:field,answer:'この欄は空欄です。資料内に記載がありません。',evidence:[{page,quote:[entity,at(row,selector.x).text,column.text].join(' | ')}]});
        }
        continue;
      }
      if(columns.length<4 || new Set(columns.map(cell=>compact(cell.text))).size!==1) continue;
      const bands=lines.slice(Math.max(0,index-2),index);
      if(bands.length!==2 || bands.some(line=>line.y-header.y>2*gap+1.5)) continue;
      for(const row of body){
        if(compact(at(row,key.x)?.text??'')!==entity || !byPosition(row)) continue;
        for(const column of columns){
          const [group,subheading]=bands.map(line=>line.cells.findLast(cell=>cell.x<=column.x+2 && columns.some(axis=>Math.abs(axis.x-cell.x)<2)));
          if(!group || !subheading || compact(group.text+subheading.text+column.text)!==field) continue;
          const value=at(row,column.x);
          matches.push({label:field,answer:value.text,evidence:[{page,quote:[at(row,key.x).text,group.text,subheading.text,column.text,value.text].join(' | ')}]});
        }
      }
    }
  }
  return matches.length===1 ? matches[0] : null;
}
