import {PDFDocument} from './document-pdf-lib.mjs';
import {officePages} from './document-office.js?v=70';

export async function convertDocument(file){
  const pdf=await PDFDocument.create();
  const pages=[];
  const image=/\.(png|jpe?g|webp)$/i.test(file.name);
  const canvas=document.createElement('canvas');
  canvas.width=1120;
  canvas.height=1584;
  const ctx=canvas.getContext('2d');
  async function save(){
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.72));
    if(!jpeg)throw Error('PDFへの変換に失敗しました。');
    const picture=await pdf.embedJpg(await jpeg.arrayBuffer());
    pdf.addPage([595,842]).drawImage(picture,{x:0,y:0,width:595,height:842});
  }
  function clear(){ctx.fillStyle='#fff';ctx.fillRect(0,0,1120,1584);ctx.fillStyle='#181818';}
  if(image){
    const url=URL.createObjectURL(file);
    try{
      const element=new Image();
      element.src=url;
      await element.decode();
      const scale=Math.min(1040/element.naturalWidth,1504/element.naturalHeight);
      clear();
      ctx.drawImage(element,(1120-element.naturalWidth*scale)/2,(1584-element.naturalHeight*scale)/2,element.naturalWidth*scale,element.naturalHeight*scale);
      await save();
    }finally{URL.revokeObjectURL(url);}
  }else{
    const xlsx=/\.xlsx$/i.test(file.name);
    const sections=await officePages(file,{includeMerges:xlsx});
    for(const [index,section] of sections.entries()){
      const rows=(section.text ?? section).split('\n');
      const title=xlsx ? rows.shift() || 'シート '+(index+1) : file.name;
      const lines=[];
      ctx.font='19px sans-serif';
      for(const row of rows){
        let line='';
        for(const char of row){
          if(line && ctx.measureText(line+char).width>1010){lines.push(line);line='';}
          line+=char;
        }
        lines.push(line);
      }
      for(let offset=0;offset<Math.max(1,lines.length);offset+=50){
        if(pages.length>=160)throw Error('変換後のPDFは160ページまでです。');
        const block=lines.slice(offset,offset+50);
        clear();
        ctx.font='bold 26px sans-serif';
        ctx.fillText(title,50,65,1020);
        ctx.font='19px sans-serif';
        block.forEach((line,i)=>ctx.fillText(line,50,102+i*28));
        const merges = section.merges?.filter(range=>{
          const [first,last=first]=range.split(':');
          const start=Number(first.match(/\d+$/)?.[0]);
          const end=Number(last.match(/\d+$/)?.[0]);
          return block.some(line=>[...line.matchAll(/(?:^| \| )[A-Z]+(\d+) /g)].some(match=>Number(match[1])>=start && Number(match[1])<=end));
        });
        const metadata = merges?.length ? ['結合セル範囲: '+merges.join(', ')] : [];
        pages.push([title,...block,...metadata].join('\n'));
        await save();
      }
    }
  }
  const result=new File([await pdf.save()],file.name.replace(/\.[^.]+$/,'.pdf'),{type:'application/pdf'});
  if(result.size>20_000_000)throw Error('変換後のPDFは20 MBまでです。');
  return {file:result,pages,image};
}
