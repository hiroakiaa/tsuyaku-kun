export function scanReadingParagraphs(blocks,pageWidth){
 if(blocks.some(block=>block.vertical||block.diagramText))return null;
 const text=blocks.filter(block=>block.line?.trim()&&!block.vertical&&!block.diagramText);if(text.length<12||text.reduce((sum,b)=>sum+b.line.length,0)<400||text.filter(b=>(b.sourceWidth||b.width)>pageWidth*.45).length<text.length*.35)return null;
 const heights=text.map(b=>b.sourceHeight/1.26||b.size).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)];const paragraphs=[];
 if(text.filter(a=>text.some(b=>a!==b&&Math.abs(a.top-b.top)<median*.35&&(a.x+a.sourceWidth<=b.x||b.x+b.sourceWidth<=a.x))).length>text.length*.25)return null;
 for(const block of text){const previous=paragraphs.at(-1),last=previous?.blocks.at(-1),height=block.sourceHeight/1.26||block.size;const heading=block.line.length<90&&height>median*1.3;
  const same=last&&previous.blocks.length<6&&!heading&&!previous.heading&&Math.abs(block.x-last.x)<median*1.5&&block.top>=last.top&&block.top-last.top<(last.sourceHeight||median)*1.8;
  if(same)previous.blocks.push(block);else paragraphs.push({heading,top:block.top,blocks:[block]});
 }return paragraphs;
}

export function fitTranslationBox(context,text,width,height,preferred){
 const clean=text.replace(/\s+/gu,' ').trim();
 const wrap=size=>{context.font=size+'px sans-serif';const rows=[];let row='';for(const word of clean.split(' ')){if(!word)continue;const candidate=row?row+' '+word:word;if(context.measureText(candidate).width<=width){row=candidate;continue;}if(row)rows.push(row);row='';for(const character of word){if(row&&context.measureText(row+character).width>width){rows.push(row);row='';}row+=character;}}if(row)rows.push(row);return rows;};
 let low=.5,high=Math.max(.5,preferred);for(let i=0;i<18;i++){const size=(low+high)/2;if(wrap(size).length*size*1.18<=height)low=size;else high=size;}return {text:clean,size:low,rows:wrap(low)};
}
// Scanned documents use the same clipped, background-aware raster compositor as photo translation.
export async function installScanReadingLayout(frame,blocks,sourceCanvas,pageWidth,{group=true}={}){
 if(!blocks.length)return false;
 const {drawPhotoOverlay}=await import('./photo-overlay.js');
 const pageHeight=sourceCanvas.height/sourceCanvas.width*pageWidth,source=document.createElement('canvas');source.width=sourceCanvas.width;source.height=sourceCanvas.height;source.getContext('2d').drawImage(sourceCanvas,0,0);
 const grouped=group?scanReadingParagraphs(blocks,pageWidth):null;
 if(grouped){
  const {scanPhotoRegions}=await import('./document-scan-preprocess.js'),photos=scanPhotoRegions(source.getContext('2d').getImageData(0,0,source.width,source.height));
  blocks=grouped.flatMap(group=>{if(group.blocks.length===1)return group.blocks;const rows=group.blocks,x=Math.min(...rows.map(b=>b.x)),top=Math.min(...rows.map(b=>b.top)),width=Math.max(...rows.map(b=>b.x+(b.sourceWidth||b.width)))-x,height=Math.max(...rows.map(b=>b.top+(b.sourceHeight||b.boxHeight)))-top;
   if(photos.some(p=>x/pageWidth<(p.x+p.width)/source.width&&(x+width)/pageWidth>p.x/source.width&&top/pageHeight<(p.y+p.height)/source.height&&(top+height)/pageHeight>p.y/source.height))return rows;
   return [{...rows[0],x,top,width,sourceWidth:width,sourceHeight:height,boxHeight:height,line:rows.map(b=>b.line.trim()).join(' '),marked:rows.some(b=>b.marked)}];
  });
 }
 const regions=blocks.map((block,index)=>({id:String(index),text:block.line,highlight:Boolean(block.marked),maskBox:block.maskBox,minimumFont:block.maskBox?2:undefined,box:{x:Math.max(0,block.x)/pageWidth,y:Math.max(0,block.top)/pageHeight,width:Math.max(.1,Math.min(block.sourceWidth||block.width,pageWidth-Math.max(0,block.x)))/pageWidth,height:Math.max(.1,Math.min(block.sourceHeight||block.boxHeight,pageHeight-Math.max(0,block.top)))/pageHeight}}));
 const language=frame.lang||'en',paint=drawPhotoOverlay(sourceCanvas,source,regions,blocks.map((block,index)=>({id:String(index),translations:{[language]:block.line}})),language);
 frame.querySelectorAll('.pdf-layout-line,.pdf-source-mask').forEach(node=>node.remove());
 const context=source.getContext('2d');
 for(const [index,block] of blocks.entries()){
  const box=regions[index].box,fit=fitTranslationBox(context,block.line,Math.max(1,box.width*pageWidth-1),Math.max(1,box.height*pageHeight-1),block.size||16),paragraph=document.createElement('span');
  paragraph.className='pdf-layout-line pdf-inplace-paragraph';paragraph.textContent=fit.rows.join('\n');paragraph.dataset.fullTranslation=fit.text;paragraph.setAttribute('role','button');paragraph.tabIndex=0;paragraph.setAttribute('aria-label',fit.text);
  paragraph.style.cssText='left:'+box.x*100+'%;top:'+box.y*100+'%;width:'+box.width*100+'%;height:'+box.height*100+'%;font-size:'+fit.size/pageWidth*100+'cqw;line-height:1.18;white-space:pre-wrap;background:transparent;color:transparent;z-index:3;padding:0;';
  if(block.marked)paragraph.classList.add('pdf-translated-citation');
  const read=()=>{const dialog=frame.ownerDocument.querySelector('#read-translation'),content=frame.ownerDocument.querySelector('#read-translation-text');if(dialog&&content){content.textContent=fit.text;content.lang=language;dialog.showModal();}};paragraph.onclick=read;paragraph.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();read();}};frame.append(paragraph);
 }
 frame.dataset.readingLayout='in-place';frame.dataset.translationRenderer='photo-overlay';frame.dataset.translationClipped=String(paint.clipped);frame.classList.add('pdf-scan-inplace');return true;
}
