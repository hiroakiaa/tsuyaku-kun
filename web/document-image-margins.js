// Only recognizes the app's older full-A4 raster conversion. PDF text pages stay intact.
export async function isLegacyImagePage(page,OPS){
 const text=await page.getTextContent();if(text.items?.some(item=>item.str?.trim()))return false;
 const {fnArray,argsArray}=await page.getOperatorList();const images=fnArray.flatMap((op,i)=>op===OPS.paintImageXObject?[argsArray[i]]:[]);
 const size=page.getViewport({scale:1});return images.length===1&&images[0]?.[1]===1120&&images[0]?.[2]===1584&&Math.abs(size.width-595)<1&&Math.abs(size.height-842)<1;
}
export function imageContentFrame({data,width,height}){
 let left=width,top=height,right=-1,bottom=-1,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]>200&&Math.min(data[i],data[i+1],data[i+2])<240){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}}
 if(right<left||bottom<top)return null;
 const area=(right-left+1)*(bottom-top+1);
 // Sparse text scans, tiny logos and pages without a significant border are left unchanged.
 if(area<width*height*.1||count/area<.25||Math.max(left/width,top/height,(width-right-1)/width,(height-bottom-1)/height)<.025)return null;
 right++;bottom++;
 return {left:left/width,top:top/height,right:right/width,bottom:bottom/height};
}
export function paintImageFrame(canvas,frame,color){
 if(!frame)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,l=frame.left*w,t=frame.top*h,r=frame.right*w,b=frame.bottom*h;
 ctx.save();ctx.fillStyle=color;ctx.fillRect(0,0,w,t);ctx.fillRect(0,b,w,h-b);ctx.fillRect(0,t,l,b-t);ctx.fillRect(r,t,w-r,b-t);ctx.restore();
}
