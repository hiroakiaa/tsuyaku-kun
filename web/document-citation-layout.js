// Reuse exact OCR word positions; incomplete geometry must use the canonical fallback.
export function visionCitationRuns(recognized,viewport){
 if(!recognized?.blocks?.length)return null;const out=[],compact=s=>s.normalize('NFKC').replace(/\s/gu,'');
 for(const block of recognized.blocks){if(!block.tokens?.length||compact(block.tokens.map(t=>t[0]).join(''))!==compact(block.text))return null;
  for(const [str,x,y,width,height]of block.tokens){if(typeof str!=='string'||![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>1.001||y+height>1.001)return null;out.push({str,ocr:true,ocrBox:[x,y,width,height],width:width*viewport.width,height:height*viewport.height,transform:[height*viewport.height,0,0,height*viewport.height,x*viewport.width,(1-y-height)*viewport.height]});}
 }return out;
}
