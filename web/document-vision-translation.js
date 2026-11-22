import {resumeTranslation} from './translation-resume.js';
import {translatePhotoProgressively} from './photo-progress.js';
// Same recognition and paragraph translation endpoints as the photo mode.
// Cache is scoped to this reader; server photo caches retain their existing user isolation.
export function createDocumentVisionTranslation({request,getPdf,requiresOcr,valid=()=>true}){
 const pages=new Map(),segments=new Map();
 async function recognize(number){
  const pdf=await getPdf(),page=await pdf.getPage(number),native=await page.getTextContent();
  if(!requiresOcr(native.items,number))return null;
  const size=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(3,1800/Math.max(size.width,size.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  try{await page.render({canvas,viewport}).promise;let image;for(const quality of [.9,.75,.6,.45]){image=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(image.length<=2800000)break;}if(image.length>2800000)throw Error('ページ画像を読み取り用に調整できませんでした。');
   const result=await resumeTranslation(()=>request('/photo/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,id:crypto.randomUUID()}),signal:AbortSignal.timeout(45000)}),{valid});
   if(!result.blocks?.length)throw Error('このページの文字位置を読み取れませんでした。');
   return result;
  }finally{canvas.width=canvas.height=0;}
 }
 return async(number,language)=>{
  if(!pages.has(number))pages.set(number,recognize(number).catch(error=>{pages.delete(number);throw error;}));
  const recognized=await pages.get(number);if(!recognized)return null;
  const result=await translatePhotoProgressively({blocks:recognized.blocks,source:recognized.sourceLanguage||'auto',target:language,cache:segments,valid,request:body=>request('/photo/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)})});
  const byId=new Map(result.blocks.map(b=>[b.id,b.translations[language]]));
  if(recognized.blocks.some(b=>!byId.get(b.id)))throw Error('ページの翻訳がまだ完了していません。');
  return {visionLayout:recognized.blocks,source:recognized.blocks.map(b=>b.text),lines:recognized.blocks.map(b=>byId.get(b.id)),reuse:result.reuse.reused===result.reuse.total?'cache':'generated'};
 };
}

export function separateVisionParagraphs(blocks){
 const out=blocks.map(block=>({...block,originalBox:{...block.box},box:{...block.box}}));
 for(let pass=0;pass<out.length;pass++){let changed=false;for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
  const a=out[i].box,b=out[j].box,ix=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),iy=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);if(ix<=1e-7||iy<=1e-7)continue;
  const vertical=Math.abs(a.y+a.height/2-b.y-b.height/2)/(a.height+b.height)>=Math.abs(a.x+a.width/2-b.x-b.width/2)/(a.width+b.width),axis=vertical?'y':'x',length=vertical?'height':'width',first=a[axis]+a[length]/2<=b[axis]+b[length]/2?a:b,last=first===a?b:a,cut=(Math.max(a[axis],b[axis])+Math.min(a[axis]+a[length],b[axis]+b[length]))/2,end=last[axis]+last[length];first[length]=cut-first[axis];last[axis]=cut;last[length]=end-cut;changed=true;
 }if(!changed)break;}return out;
}
