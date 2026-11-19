// Block browser-level pinch, while leaving events available to each preview's own zoom handler.
const installed=Symbol.for('tsuyaku.preview-only-gestures');
export function installPreviewOnlyGestures(doc=document){
 if(doc[installed])return doc[installed];
 const previous=doc.documentElement.style.touchAction;
 doc.documentElement.style.touchAction='pan-x pan-y';
 const options={capture:true,passive:false};
 const prevent=event=>{if(event.cancelable)event.preventDefault();};
 const touch=event=>{if(event.touches?.length>1)prevent(event);};
 const wheel=event=>{if(event.ctrlKey)prevent(event);};
 for(const type of ['touchstart','touchmove'])doc.addEventListener(type,touch,options);
 for(const type of ['gesturestart','gesturechange','gestureend'])doc.addEventListener(type,prevent,options);
 doc.addEventListener('wheel',wheel,options);
 const cleanup=()=>{
  for(const type of ['touchstart','touchmove'])doc.removeEventListener(type,touch,options);
  for(const type of ['gesturestart','gesturechange','gestureend'])doc.removeEventListener(type,prevent,options);
  doc.removeEventListener('wheel',wheel,options);doc.documentElement.style.touchAction=previous;delete doc[installed];
 };
 doc[installed]=cleanup;return cleanup;
}
