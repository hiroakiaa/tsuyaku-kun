// The parent owns the visible viewport; the embedded reader uses local coordinates.
export function installDocumentKeyboardHost(dialog,frame){
 const viewport=window.visualViewport;let active=false;
 const update=()=>{const managed=Boolean(active&&dialog.open&&viewport);dialog.classList.toggle('document-keyboard',managed);for(const [key,value]of [['--document-visible-top',managed?viewport.offsetTop+'px':''],['--document-visible-height',managed?viewport.height+'px':'']]){if(value){if(dialog.style.getPropertyValue(key)!==value)dialog.style.setProperty(key,value);}else dialog.style.removeProperty(key);}frame.contentWindow?.postMessage({type:'document-viewport-managed',active:managed},location.origin);};
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='document-keyboard')return;active=event.data.open===true;update();});
 viewport?.addEventListener('resize',()=>{if(active)update();});viewport?.addEventListener('scroll',()=>{if(active)update();});dialog.addEventListener('close',()=>{active=false;update();});
}
