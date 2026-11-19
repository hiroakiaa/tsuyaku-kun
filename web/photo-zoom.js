// Keep the image point between the fingers fixed while scaling.
export function photoZoomAnchor(scroll,from,to,previous,next){
 return {left:Math.max(0,(scroll.left+from.x)*next/previous-to.x),top:Math.max(0,(scroll.top+from.y)*next/previous-to.y)};
}
export function installPhotoZoom(viewport,canvas,{onChange=()=>{}}={}){
 const surface=document.createElement('div');surface.className='photo-zoom-surface';canvas.replaceWith(surface);surface.append(canvas);
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
  baseWidth=width;baseHeight=width*canvas.height/canvas.width;
  const limit=parseFloat(getComputedStyle(viewport).maxHeight);
  const max=Number.isFinite(limit)?limit:Infinity;
  viewport.style.height=Math.min(baseHeight,max)+'px';
  draw();
  if(oldWidth){viewport.scrollLeft=point.x*baseWidth*scale-center.x;viewport.scrollTop=point.y*baseHeight*scale-center.y;}
 }
 function setScale(value,from,to=from){
  if(!baseWidth)refresh();if(!baseWidth)return;
  const next=Math.min(6,Math.max(1,Number(value)||1));
  from??={x:viewport.clientWidth/2,y:viewport.clientHeight/2};to??=from;
  const at=photoZoomAnchor({left:viewport.scrollLeft,top:viewport.scrollTop},from,to,scale,next);
  scale=next;draw();viewport.scrollLeft=at.left;viewport.scrollTop=at.top;onChange(scale);
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
 return {refresh,setScale,get scale(){return scale;},reset(){flush();pinch=null;scale=1;viewport.scrollLeft=viewport.scrollTop=0;refresh();viewport.scrollLeft=viewport.scrollTop=0;onChange(scale);},destroy(){destroyed=true;controller.abort();observer.disconnect();if(frame)cancelAnimationFrame(frame);}};
}
