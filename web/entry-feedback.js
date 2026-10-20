export function lessonCode(value){
 const normalized=String(value??'').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296)).trim();
 return {value:normalized,valid:/^\d{4}$/.test(normalized),message:normalized?'ルームIDを数字4桁で入力してください。':'先生から教わったルームIDを入力してください。'};
}

export function backdropClick(event,dialog){
 if(event.target!==dialog)return false;
 const r=dialog.getBoundingClientRect();
 return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;
}

export function updateMode(storage){
 try{const saved=storage.getItem('tsuyaku-update-tab');storage.removeItem('tsuyaku-update-tab');return ['face','interpreter','lesson','words'].includes(saved)?saved:'face';}catch{return 'face';}
}

export function searchBounds(anchor,viewport){
 const margin=16,leftEdge=(viewport.offsetLeft||0)+margin,topEdge=(viewport.offsetTop||0)+8;
 const width=Math.max(0,Math.min(420,viewport.width-margin*2));
 const bottom=(viewport.offsetTop||0)+viewport.height-8;
 const top=Math.max(topEdge,Math.min(anchor.bottom+8,bottom-96));
 return {width,left:Math.max(leftEdge,Math.min(anchor.right-width,leftEdge+viewport.width-margin*2-width)),top,maxHeight:Math.max(0,bottom-top)};
}

// Keep feedback in the modal top layer and restore a replaced opener after closing.
export function installModalFeedback({dialog,message,close,resolveFocus=target=>target?.isConnected?target:null}){
 const parent=message.parentNode,next=message.nextSibling;let returnTo,epoch=0;
 close.setAttribute('autofocus','');
 dialog.addEventListener('close',()=>{
  if(dialog.open)return;
  if(next?.parentNode===parent)parent.insertBefore(message,next);else parent.append(message);
  const doc=dialog.ownerDocument,target=returnTo,closedEpoch=epoch;returnTo=null;
  const restore=()=>{if(!dialog.open&&epoch===closedEpoch&&doc&&(doc.activeElement===doc.body||dialog.contains(doc.activeElement)))resolveFocus(target)?.focus({preventScroll:true});};
  if(doc?.defaultView?.requestAnimationFrame)doc.defaultView.requestAnimationFrame(restore);else restore();
 });
 return trigger=>{epoch++;returnTo=trigger;dialog.append(message);close.focus({preventScroll:true});};
}
