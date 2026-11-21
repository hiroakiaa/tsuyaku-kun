export function scanReadingParagraphs(blocks,pageWidth){
 if(blocks.some(block=>block.vertical||block.diagramText))return null;
 const text=blocks.filter(block=>block.line?.trim()&&!block.vertical&&!block.diagramText);if(text.length<12||text.reduce((sum,b)=>sum+b.line.length,0)<400||text.filter(b=>(b.sourceWidth||b.width)>pageWidth*.45).length<text.length*.35)return null;
 const heights=text.map(b=>b.sourceHeight/1.26||b.size).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)];const paragraphs=[];
 if(text.filter(a=>text.some(b=>a!==b&&Math.abs(a.top-b.top)<median*.35&&(a.x+a.sourceWidth<=b.x||b.x+b.sourceWidth<=a.x))).length>text.length*.25)return null;
 for(const block of text){const previous=paragraphs.at(-1),last=previous?.blocks.at(-1),height=block.sourceHeight/1.26||block.size;const heading=block.line.length<90&&height>median*1.3;
  const same=last&&previous.blocks.length<6&&!/[.!?。]\s*$/u.test(last.line)&&!heading&&!previous.heading&&Math.abs(block.x-last.x)<median*1.5&&block.top>=last.top&&block.top-last.top<(last.sourceHeight||median)*1.8;
  if(same)previous.blocks.push(block);else paragraphs.push({heading,top:block.top,blocks:[block]});
 }return paragraphs;
}
export async function installScanReadingLayout(frame,blocks,sourceCanvas,pageWidth){
 const paragraphs=scanReadingParagraphs(blocks,pageWidth);if(!paragraphs)return false;
 const {scanPhotoRegions}=await import('./document-scan-preprocess.js');const source=sourceCanvas.getContext('2d'),photos=scanPhotoRegions(source.getImageData(0,0,sourceCanvas.width,sourceCanvas.height));
 const content=document.createElement('div');content.className='pdf-scan-reading-content';
 const pieces=[...paragraphs.map(paragraph=>({top:paragraph.top,paragraph})),...photos.map(photo=>({top:photo.y/sourceCanvas.height*(sourceCanvas.height/sourceCanvas.width*pageWidth),photo}))].sort((a,b)=>a.top-b.top);
 for(const piece of pieces){if(piece.photo){const {x,y,width,height}=piece.photo,photo=document.createElement('canvas');photo.width=width;photo.height=height;photo.getContext('2d').drawImage(sourceCanvas,x,y,width,height,0,0,width,height);photo.className='pdf-scan-reading-photo';photo.dataset.sourceRect=[x,y,width,height].join(',');content.append(photo);continue;}
  const paragraph=document.createElement(piece.paragraph.heading?'h3':'p');paragraph.className='pdf-scan-reading-paragraph';for(const block of piece.paragraph.blocks){const span=document.createElement('span');span.textContent=block.line.replace(/\s+/gu,' ').trim()+' ';if(block.marked)span.className='pdf-translated-citation';paragraph.append(span);}content.append(paragraph);
 }
 frame.replaceChildren(content);frame.classList.add('pdf-scan-reading');frame.dataset.readingLayout='paragraphs';return true;
}
