import {previewFitScale} from './preview-fit.js?v=20261119-fit-1';
// Keep the image point between the fingers fixed while scaling.
export function photoZoomAnchor(scroll,from,to,previous,next){
 return {left:Math.max(0,(scroll.left+from.x)*next/previous-to.x),top:Math.max(0,(scroll.top+from.y)*next/previous-to.y)};
}
export function installPhotoZoom(viewport,canvas,{onChange=()=>{},fitHeight=false,fitWithinMaxHeight=false}={}){
 const surface=document.createElement('div');surface.className='photo-zoom-surface';canvas.replaceWith(surface);surface.append(canvas);if(fitHeight){surface.style.minWidth='0';surface.style.marginInline='auto';}
 let scale=1,baseWidth=0,baseHeight=0,pinch=null,frame=0,pending=null,destroyed=false;
 const controller=new AbortController(),options={signal:controller.signal};
 function local(touches){
  const [a,b]=touches,r=viewport.getBoundingClientRect();
  return {x:(a.clientX+b.clientX)/2-r.left-viewport.clientLeft,y:(a.clientY+b.clientY)/2-r.top-viewport.clientTop,distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};
 }
 function draw(){
  surface.style.width=baseWidth*scale+'px';surface.style.height=baseHeight*scale+'px';
  canvas.style.width=baseWidth+'px';canvas.style.height=baseHeight+'px';canvas.style.transform='scale('+scale+')';
 }
 function refresh(){
  if(destroyed||!viewport.clientWidth||!canvas.width||!canvas.height)return;
  const width=viewport.clientWidth,oldWidth=baseWidth,oldHeight=baseHeight;
  const center={x:viewport.clientWidth/2,y:viewport.clientHeight/2};
  const point={x:oldWidth?(viewport.scrollLeft+center.x)/(oldWidth*scale):0,y:oldHeight?(viewport.scrollTop+center.y)/(oldHeight*scale):0};
  const styles=getComputedStyle(viewport);
  const border=styles.boxSizing==='border-box'?(parseFloat(styles.borderTopWidth)||0)+(parseFloat(styles.borderBottomWidth)||0):0;
  const limit=parseFloat(styles.maxHeight);
  const max=Number.isFinite(limit)?limit:Infinity;
  const height=fitWithinMaxHeight&&Number.isFinite(max)?max-border:viewport.clientHeight || (Number.isFinite(max)?max-border:window.innerHeight);
  baseWidth=fitHeight?canvas.width*previewFitScale(canvas.width,canvas.height,width,height):width;baseHeight=baseWidth*canvas.height/canvas.width;
  viewport.style.height=Math.min(baseHeight+border,max)+'px';
  draw();
  if(oldWidth){viewport.scrollLeft=point.x*baseWidth*scale-center.x;viewport.scrollTop=point.y*baseHeight*scale-center.y;}
 }
 function setScale(value,from,to=from){
  if(!baseWidth)refresh();if(!baseWidth)return;
  const next=Math.min(6,Math.max(1,Number(value)||1));
  from??={x:viewport.clientWidth/2,y:viewport.clientHeight/2};to??=from;
  const bounds=viewport.getBoundingClientRect(),before=canvas.getBoundingClientRect();
  const point={x:(bounds.left+viewport.clientLeft+from.x-before.left)/scale,y:(bounds.top+viewport.clientTop+from.y-before.top)/scale};
  scale=next;draw();const after=canvas.getBoundingClientRect();
  viewport.scrollLeft+=after.left-bounds.left-viewport.clientLeft+point.x*scale-to.x;
  viewport.scrollTop+=after.top-bounds.top-viewport.clientTop+point.y*scale-to.y;
  onChange(scale);
 }
 function flush(){
  if(frame)cancelAnimationFrame(frame);frame=0;
  if(!pending)return;const next=pending;pending=null;
  if(pinch?.distance){setScale(scale*next.distance/pinch.distance,pinch,next);pinch=next;}
 }
 viewport.addEventListener('touchstart',event=>{
  if(event.touches.length!==2){flush();pinch=null;return;}
  event.preventDefault();flush();pinch=local(event.touches);
 },{...options,passive:false});
 viewport.addEventListener('touchmove',event=>{
  if(event.touches.length!==2||!pinch)return;
  event.preventDefault();pending=local(event.touches);if(!frame)frame=requestAnimationFrame(flush);
 },{...options,passive:false});
 for(const type of ['touchend','touchcancel'])viewport.addEventListener(type,()=>{flush();pinch=null;},options);
 // Ordinary one-finger dragging and momentum use the browser's scroll implementation.
 viewport.addEventListener('wheel',event=>{
  if(!event.ctrlKey)return;event.preventDefault();const r=viewport.getBoundingClientRect();
  setScale(scale*Math.exp(-event.deltaY*.01),{x:event.clientX-r.left-viewport.clientLeft,y:event.clientY-r.top-viewport.clientTop});
 },{...options,passive:false});
 const observer=new ResizeObserver(()=>refresh());observer.observe(viewport);
 return {refresh,setScale,get scale(){return scale;},reset(){flush();pinch=null;scale=1;baseWidth=baseHeight=0;viewport.scrollLeft=viewport.scrollTop=0;refresh();viewport.scrollLeft=viewport.scrollTop=0;onChange(scale);},destroy(){destroyed=true;controller.abort();observer.disconnect();if(frame)cancelAnimationFrame(frame);}};
}
