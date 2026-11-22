const normalized=text=>String(text).normalize('NFC').replace(/\s+/gu,'');
function orderedPhotoBlocks(original,blocks){
 let offset=0;const content=normalized(original);
 for(const block of blocks){const value=normalized(block.text);if(!value)return false;const at=content.indexOf(value,offset);if(at<0)return false;offset=at+value.length;}
 return true;
}
export function matchingPhotoBlocks(text,original,blocks){
 if(!Array.isArray(blocks)||!blocks.length||normalized(text)!==normalized(original)||!orderedPhotoBlocks(original,blocks))return null;
 if(blocks.some(b=>!b.box||![b.box.x,b.box.y,b.box.width,b.box.height].every(Number.isFinite)||b.box.x<0||b.box.y<0||b.box.width<=0||b.box.height<=0||b.box.x+b.box.width>1.001||b.box.y+b.box.height>1.001))return null;
 return blocks;
}
export function wrapPhotoText(measure,text,width){
 const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const token of paragraph.match(/[^\S\n]+|[A-Za-zÀ-ž0-9]+(?:['’-][A-Za-zÀ-ž0-9]+)*|./gu)||[]){if(line&&measure(line+token)>width){lines.push(line.trimEnd());line='';}for(const char of token){if(line&&measure(line+char)>width){lines.push(line.trimEnd());line='';}if(line||char.trim())line+=char;}}lines.push(line.trimEnd());}return lines;
}
function photoColors(ctx,x,y,w,h){
 // Sample the perimeter rather than text pixels; rendering stays on the device.
 try{
  const data=ctx.getImageData(Math.floor(x),Math.floor(y),Math.max(1,Math.ceil(w)),Math.max(1,Math.ceil(h)));
  const samples=[];for(let row=0;row<data.height;row+=Math.max(1,Math.floor(data.height/12)))for(let col=0;col<data.width;col+=Math.max(1,Math.floor(data.width/12))){
   if(row>data.height*.12&&row<data.height*.88&&col>data.width*.08&&col<data.width*.92)continue;
   const i=(row*data.width+col)*4;samples.push([data.data[i],data.data[i+1],data.data[i+2]]);
  }
  samples.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
  const rgb=samples[Math.floor(samples.length/2)];if(rgb)return {background:'rgb('+rgb.join(',')+')',foreground:(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>140?'#111':'#fff'};
 }catch{}
 return {background:'#fff',foreground:'#111'};
}
export function drawPhotoOverlay(canvas,source,blocks,translated,language){
 canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);ctx.textBaseline='top';let clipped=false;
 const byId=new Map(translated.map(b=>[b.id,b.translations?.[language]]));
 // Preserve every source mask when perspective makes paragraph rectangles overlap.
 for(const block of blocks){if(!block.maskBox||!byId.get(block.id))continue;const b=block.maskBox,x=b.x*canvas.width,y=b.y*canvas.height,w=b.width*canvas.width,h=b.height*canvas.height;ctx.fillStyle=photoColors(ctx,x,y,w,h).background;ctx.fillRect(x,y,w,h);}

 for(const block of blocks){const text=byId.get(block.id);if(!text)continue;const box=block.box,x=box.x*canvas.width,y=box.y*canvas.height,w=Math.min(canvas.width-x,box.width*canvas.width),h=Math.min(canvas.height-y,box.height*canvas.height),padding=Math.min(6,w/8,h/8),available=Math.max(1,w-padding*2);
  const minimumFont=block.minimumFont??8;let font=Math.min(block.maximumFont??48,Math.max(12,h*.65)),lines;
  do{ctx.font=`600 ${font}px system-ui, sans-serif`;lines=wrapPhotoText(t=>ctx.measureText(t).width,text,available);if(lines.length*font*1.25<=h-padding*2||font<=minimumFont)break;font=Math.max(minimumFont,font-1);}while(font>=minimumFont);
  const maxLines=Math.max(1,Math.floor((h-padding*2)/(font*1.25))),shown=lines.slice(0,maxLines);if(lines.length>maxLines){clipped=true;let last=shown.at(-1);while(last&&ctx.measureText(last+'…').width>available)last=last.slice(0,-1);shown[shown.length-1]=last+'…';}
  const colors=photoColors(ctx,x,y,w,h);ctx.fillStyle=block.highlight?'#ffe45c':colors.background;ctx.fillRect(x,y,w,h);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle=colors.foreground;ctx.direction=/^(ar|fa|he|ur)(-|$)/.test(language)?'rtl':'ltr';ctx.textAlign=ctx.direction==='rtl'?'right':'left';shown.forEach((line,i)=>ctx.fillText(line,ctx.direction==='rtl'?x+w-padding:x+padding,y+padding+i*font*1.25));ctx.restore();
 }
 return {clipped};
}
