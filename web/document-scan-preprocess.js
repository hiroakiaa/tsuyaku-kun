// Local OCR preprocessing only. The original document pixels are never changed.
export function scanPixelAnalysis({data,width,height}){
 const tile=40,cols=Math.ceil(width/tile),rows=Math.ceil(height/tile),background=new Uint8Array(cols*rows);let darkest=255,brightest=0;
 for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){const i=(y*width+x)*4,g=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]),k=Math.floor(y/tile)*cols+Math.floor(x/tile);background[k]=Math.max(background[k],g);}
 const lit=Array.from(background).filter(v=>v>40).sort((a,b)=>a-b);darkest=lit[Math.floor(lit.length*.1)]??255;brightest=lit[Math.floor(lit.length*.9)]??255;
 let softInk=0;const points=[],step=Math.max(3,Math.ceil(Math.sqrt(width*height/90000)));let ink=0;
 const at=(x,y)=>background[Math.min(rows-1,Math.max(0,y))*cols+Math.min(cols-1,Math.max(0,x))]||255;
 function local(x,y){const tx=x/tile-.5,ty=y/tile-.5,ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;return at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy;}
 for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const i=(y*width+x)*4,g=.299*data[i]+.587*data[i+1]+.114*data[i+2];if(g<local(x,y)*.97)softInk++;if(g<local(x,y)*.65){ink++;points.push([x-width/2,y-height/2]);}}
 const scale=Math.min(1,700/Math.max(width,height))/3,bins=new Uint32Array(Math.ceil(Math.hypot(width,height)*scale)+4),offset=bins.length/2;
 function score(angle){bins.fill(0);const rad=angle*Math.PI/180,s=Math.sin(rad)*scale,c=Math.cos(rad)*scale;for(const [x,y]of points){const k=Math.floor(x*s+y*c+offset);if(k>=0&&k<bins.length)bins[k]++;}return bins.reduce((sum,n)=>sum+n*n,0);}
 const zero=score(0);let best=zero,angle=0;if(points.length>=100&&points.length<25000){for(let a=-7;a<=7;a+=.5){const value=score(a);if(value>best){best=value;angle=a;}}const center=angle;for(let a=center-.4;a<=center+.4;a+=.1){const value=score(a);if(value>best){best=value;angle=a;}}}
 if(best<zero*1.18||Math.abs(angle)<.35)angle=0;
 return {correction:Math.round(angle*10)/10,illumination:brightest-darkest,softInkRatio:softInk/Math.ceil(width/step)/Math.ceil(height/step),skewGain:best/Math.max(1,zero),inkRatio:ink/Math.ceil(width/step)/Math.ceil(height/step),localBackground:local};
}
export function restoreScanBox(box,angle,width,height){
 if(!angle)return box;const rad=-angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),points=[box.x0,box.x1].flatMap(x=>[box.y0,box.y1].map(y=>{const dx=x-width/2,dy=y-height/2;return [dx*c-dy*s+width/2,dx*s+dy*c+height/2]}));
 return {x0:Math.max(0,Math.min(...points.map(p=>p[0]))),y0:Math.max(0,Math.min(...points.map(p=>p[1]))),x1:Math.min(width,Math.max(...points.map(p=>p[0]))),y1:Math.min(height,Math.max(...points.map(p=>p[1])))};
}
export function prepareScanCanvas(input){
 const ctx=input.getContext('2d'),pixels=ctx.getImageData(0,0,input.width,input.height),analysis=scanPixelAnalysis(pixels),quality={correction:analysis.correction,illumination:analysis.illumination,inkRatio:analysis.inkRatio,softInkRatio:analysis.softInkRatio,skewGain:analysis.skewGain};
 if(!analysis.correction&&analysis.illumination<35)return {canvas:input,quality,restore:box=>box,close(){}};
 const source=document.createElement('canvas');source.width=input.width;source.height=input.height;const normalized=source.getContext('2d');
 if(analysis.illumination>=35){for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){const i=(y*input.width+x)*4,g=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2],v=Math.min(255,Math.round(g*255/Math.max(45,analysis.localBackground(x,y))));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}normalized.putImageData(pixels,0,0);}else normalized.drawImage(input,0,0);
 let canvas=source;if(analysis.correction){canvas=document.createElement('canvas');canvas.width=input.width;canvas.height=input.height;const out=canvas.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,canvas.width,canvas.height);out.translate(canvas.width/2,canvas.height/2);out.rotate(analysis.correction*Math.PI/180);out.drawImage(source,-source.width/2,-source.height/2);}
 return {canvas,quality,restore:box=>restoreScanBox(box,analysis.correction,input.width,input.height),close(){source.width=source.height=0;if(canvas!==source)canvas.width=canvas.height=0;}};
}
