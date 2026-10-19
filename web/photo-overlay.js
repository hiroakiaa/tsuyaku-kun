const normalized=text=>String(text).normalize('NFC').replace(/\s+/gu,'');
export function matchingPhotoBlocks(text,original,blocks){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>40||normalized(text)!==normalized(original)||normalized(blocks.map(b=>b.text).join('\n'))!==normalized(original))return null;
 if(blocks.reduce((n,b)=>n+b.text.length,0)>1200||blocks.some(b=>!b.box||![b.box.x,b.box.y,b.box.width,b.box.height].every(Number.isFinite)||b.box.x<0||b.box.y<0||b.box.width<=0||b.box.height<=0||b.box.x+b.box.width>1.001||b.box.y+b.box.height>1.001))return null;
 return blocks;
}
export function wrapPhotoText(measure,text,width){
 const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(line&&measure(line+char)>width){lines.push(line.trimEnd());line='';}line+=char;}lines.push(line.trimEnd());}return lines;
}
export function drawPhotoOverlay(canvas,source,blocks,translated,language){
 canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);ctx.textBaseline='top';let clipped=false;
 const byId=new Map(translated.map(b=>[b.id,b.translations?.[language]]));
 for(const block of blocks){const text=byId.get(block.id);if(!text)continue;const box=block.box,x=box.x*canvas.width,y=box.y*canvas.height,w=Math.min(canvas.width-x,box.width*canvas.width),h=Math.min(canvas.height-y,box.height*canvas.height),padding=Math.min(6,w/8,h/8),available=Math.max(1,w-padding*2);
  let font=Math.min(48,Math.max(12,h*.65)),lines;
  do{ctx.font=`600 ${font}px system-ui, sans-serif`;lines=wrapPhotoText(t=>ctx.measureText(t).width,text,available);if(lines.length*font*1.25<=h-padding*2||font<=10)break;font--;}while(font>=10);
  const maxLines=Math.max(1,Math.floor((h-padding*2)/(font*1.25))),shown=lines.slice(0,maxLines);if(lines.length>maxLines){clipped=true;let last=shown.at(-1);while(last&&ctx.measureText(last+'…').width>available)last=last.slice(0,-1);shown[shown.length-1]=last+'…';}
  ctx.fillStyle='rgba(255,255,255,0.96)';ctx.fillRect(x,y,w,h);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle='#111';shown.forEach((line,i)=>ctx.fillText(line,x+padding,y+padding+i*font*1.25));ctx.restore();
 }
 return {clipped};
}
