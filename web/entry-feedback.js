export function lessonCode(value){
 const normalized=String(value??'').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296)).trim();
 return {value:normalized,valid:/^\d{4}$/.test(normalized),message:normalized?'ルームIDを数字4桁で入力してください。':'先生から教わったルームIDを入力してください。'};
}

// Keep the same live-region node in the dialog's top layer so feedback remains visible.
export function installModalFeedback({dialog,message,close}){
 const parent=message.parentNode,next=message.nextSibling;
 close.setAttribute('autofocus','');
 dialog.addEventListener('close',()=>{if(dialog.open)return;if(next?.parentNode===parent)parent.insertBefore(message,next);else parent.append(message);});
 return ()=>{dialog.append(message);close.focus({preventScroll:true});};
}
