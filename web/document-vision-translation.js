import {alignPdfTranslation} from './pdf-translation-alignment.js';
import {resumeTranslation} from './translation-resume.js';
import {translatePhotoProgressively} from './photo-progress.js';
// Same recognition and paragraph translation endpoints as the photo mode.
// Cache is scoped to this reader; server document caches enforce document read access and revision separation.
export function createDocumentVisionTranslation({request,getPdf,requiresOcr,documentPath,valid=()=>true}){
 const pages=new Map(),segments=new Map(),forced=new Set();
 const photoRequest=(number,kind,body,signal)=>request(documentPath+'/vision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:number,kind,data:body}),signal});
 async function recognize(number,force=false){
  const pdf=await getPdf(),page=await pdf.getPage(number),native=await page.getTextContent();
  if(!force&&!requiresOcr(native.items,number)&&!nativeTranslationNeedsVision(native.items)){
   let image=false;if(page.getOperatorList)try{const {OPS}=await import('./pdf.min.mjs?v=legacy-5.6.205'),ops=await page.getOperatorList();image=ops.fnArray.some((op,index)=>op===OPS.paintImageXObject&&ops.argsArray[index]?.[1]>=300&&ops.argsArray[index]?.[2]>=150);}catch{}
   if(!image)return null;
  }
  const size=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(3,1800/Math.max(size.width,size.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  try{await page.render({canvas,viewport}).promise;let image;for(const quality of [.9,.75,.6,.45]){image=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(image.length<=2800000)break;}if(image.length>2800000)throw Error('ページ画像を読み取り用に調整できませんでした。');
   const result=await resumeTranslation(()=>photoRequest(number,'ocr',{image,id:crypto.randomUUID()},AbortSignal.timeout(45000)),{valid});
   if(!result.blocks?.length){if(!result.text?.trim())return {...result,blocks:[],blank:true};throw Error('このページの文字位置を読み取れませんでした。');}
   return result;
  }finally{canvas.width=canvas.height=0;}
 }
 return async(number,language,force=false)=>{
  if(force&&!forced.has(number)){forced.add(number);pages.delete(number);}
  if(!pages.has(number))pages.set(number,recognize(number,force).catch(error=>{pages.delete(number);throw error;}));
  const recognized=await pages.get(number);if(!recognized)return null;
  if(recognized.blank)return {visionLayout:[],source:[],lines:[],blank:true,reuse:recognized.reuse||'generated'};
  const result=await translatePhotoProgressively({blocks:recognized.blocks,source:recognized.sourceLanguage||'auto',target:language,cache:segments,valid,request:body=>photoRequest(number,'translate',body,AbortSignal.timeout(45000))});
  const byId=new Map(result.blocks.map(b=>[b.id,b.translations[language]]));
  if(recognized.blocks.some(b=>!byId.get(b.id)))throw Error('ページの翻訳がまだ完了していません。');
  return {visionLayout:recognized.blocks,source:recognized.blocks.map(b=>b.text),lines:recognized.blocks.map(b=>byId.get(b.id)),reuse:result.reuse.reused===result.reuse.total?'cache':'generated'};
 };
}

export function separateVisionParagraphs(blocks){
 const out=blocks.map(block=>({...block,originalBox:{...(block.originalBox||block.box)},box:{...block.box}}));
 for(let pass=0;pass<out.length;pass++){let changed=false;for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
  const a=out[i].box,b=out[j].box,ix=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),iy=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);if(ix<=1e-7||iy<=1e-7)continue;
  const vertical=Math.abs(out[i].originalBox.y+out[i].originalBox.height/2-out[j].originalBox.y-out[j].originalBox.height/2)/(a.height+b.height)>=Math.abs(out[i].originalBox.x+out[i].originalBox.width/2-out[j].originalBox.x-out[j].originalBox.width/2)/(a.width+b.width),axis=vertical?'y':'x',length=vertical?'height':'width',first=out[i].originalBox[axis]+out[i].originalBox[length]/2<=out[j].originalBox[axis]+out[j].originalBox[length]/2?a:b,last=first===a?b:a,cut=(Math.max(a[axis],b[axis])+Math.min(a[axis]+a[length],b[axis]+b[length]))/2,end=last[axis]+last[length];first[length]=cut-first[axis];last[axis]=cut;last[length]=end-cut;changed=true;
 }if(!changed)break;}return out;
}

// Geometry only: complex native pages need the same page-image path as scans.
export function nativeTranslationNeedsVision(items){
 const text=items.filter(item=>item.str?.trim()&&Array.isArray(item.transform));if(text.length<4)return false;
 if(text.some(item=>Math.abs(item.transform[1])>.01||Math.abs(item.transform[2])>.01))return true;
 const heights=text.map(i=>Math.max(1,i.height||Math.hypot(i.transform[2],i.transform[3]))).sort((a,b)=>a-b),height=heights[Math.floor(heights.length/2)],rows=[];
 for(const item of text){let row=rows.find(row=>Math.abs(row.y-item.transform[5])<height*.45);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);}
 const groupsByRow=rows.map(row=>{let end=-Infinity,groups=0;for(const item of row.items.sort((a,b)=>a.transform[4]-b.transform[4])){if(item.transform[4]-end>height)groups++;end=Math.max(end,item.transform[4]+(item.width||0));}return groups;});
 if(groupsByRow.filter(groups=>groups>=3).length>=3||groupsByRow.filter(groups=>groups>=2).length>=5)return true;
 const short=text.filter(i=>/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{1,2}$/u.test(i.str.trim()));
 return short.some(a=>short.filter(b=>a!==b&&Math.abs(a.transform[4]-b.transform[4])<height*.4&&Math.abs(a.transform[5]-b.transform[5])>height*.4&&Math.abs(a.transform[5]-b.transform[5])<height*3).length>=2);
}

export function unchangedTranslationNeedsVision(result,language){
 if(result.visionLayout||!result.source?.length||result.source.length!==result.lines?.length)return false;
 const compact=value=>value.normalize('NFKC').replace(/\s/gu,'');if(!result.source.every((source,i)=>compact(source)===compact(result.lines[i]||'')))return false;
 const text=result.source.join(''),letters=[...text].filter(c=>/\p{L}/u.test(c));if(letters.length<12)return false;
 const target=/^(en|pt|es|de|id|tl|fil|vi)(-|$)/u.test(language)?/\p{Script=Latin}/u:language==='ko'?/\p{Script=Hangul}/u:language==='ne'?/\p{Script=Devanagari}/u:language==='zh'?/\p{Script=Han}/u:null;
 return Boolean(target)&&letters.filter(c=>!target.test(c)).length>=8;
}

export function incompleteNativeTranslation(result,items){
 if(result.visionLayout)return false;const aligned=alignPdfTranslation(result,items);if(!aligned)return true;
 if(aligned.untranslatedIndices.some(i=>/[\p{L}\p{N}]/u.test(aligned.source[i]||'')))return true;
 return aligned.items.some(item=>/\p{L}/u.test(item.str||'')&&(!(item.width>0)||!(item.height||Math.hypot(item.transform[2],item.transform[3]))));
}

export function expandVisionTableCells(blocks,canvas){
 const {width,height}=canvas,pixels=canvas.getContext('2d').getImageData(0,0,width,height).data,known=new Uint8Array(width*height),cellSafety=new Map();
 for(const block of blocks){const b=block.originalBox||block.box,left=Math.max(0,Math.floor(b.x*width)-2),right=Math.min(width,Math.ceil((b.x+b.width)*width)+2);for(let y=Math.max(0,Math.floor(b.y*height)-2);y<Math.min(height,Math.ceil((b.y+b.height)*height)+2);y++)known.fill(1,y*width+left,y*width+right);}
 const dark=(x,y)=>{const i=(y*width+x)*4;return pixels[i+3]>128&&pixels[i]+pixels[i+1]+pixels[i+2]<500;};
 const vertical=(x,from,to)=>{let ink=0,total=0;for(let y=Math.max(0,from);y<=Math.min(height-1,to);y++){total++;if(dark(x,y))ink++;}return total>=15&&ink/total>.8;};
 const horizontal=(y,from,to)=>{let ink=0,total=0;for(let x=Math.max(0,from);x<=Math.min(width-1,to);x++){total++;if(dark(x,y))ink++;}return total>=30&&ink/total>.8;};
 return blocks.map(block=>{const b=block.box,x=b.x*width,y=b.y*height,w=b.width*width,h=b.height*height,y0=Math.floor(y-Math.max(10,h*.4)),y1=Math.ceil(y+h+Math.max(10,h*.4)),x0=Math.floor(x-Math.max(15,w*.2)),x1=Math.ceil(x+w+Math.max(15,w*.2));let left,right,top,bottom;
  for(let p=Math.max(0,Math.floor(x)-2);p>=Math.max(0,x-width*.45);p--)if(vertical(p,y0,y1)){left=p;break;}
  for(let p=Math.min(width-1,Math.ceil(x+w)+2);p<Math.min(width,x+w+width*.45);p++)if(vertical(p,y0,y1)){right=p;break;}
  for(let p=Math.max(0,Math.floor(y)-2);p>=Math.max(0,y-height*.25);p--)if(horizontal(p,x0,x1)){top=p;break;}
  for(let p=Math.min(height-1,Math.ceil(y+h)+2);p<Math.min(height,y+h+height*.25);p++)if(horizontal(p,x0,x1)){bottom=p;break;}
  if([left,right,top,bottom].some(p=>p===undefined)||right-left<8||bottom-top<8||(right-left)*(bottom-top)>width*height*.25)return block;
  const key=[left,right,top,bottom].join(':');if(!cellSafety.has(key)){let count=0,unowned=0;for(let cy=top+4;cy<bottom-3;cy+=3)for(let cx=left+4;cx<right-3;cx+=3){count++;if(!known[cy*width+cx]&&dark(cx,cy))unowned++;}cellSafety.set(key,unowned<=Math.max(12,count*.003));}if(!cellSafety.get(key))return block;
  const inset=3;return {...block,maximumFont:Math.min(48,Math.max(h*1.6,width/50)),originalBox:{...b},box:{x:(left+inset)/width,y:(top+inset)/height,width:(right-left-inset*2)/width,height:(bottom-top-inset*2)/height}};
 });
}
