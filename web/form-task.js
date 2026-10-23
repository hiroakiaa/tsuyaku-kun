// Keep explicit user submissions recoverable without repeating network requests.
export function installFormTask({root,fields,button,notice,validate,request,onSuccess,online=()=>navigator.onLine}){
 let pending=false;const active=()=>root.isConnected&&root.closest('dialog')?.open!==false;
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;
 for(const field of fields){field.addEventListener('input',()=>{field.removeAttribute('aria-invalid');if(!pending)notice.hidden=true;});field.addEventListener('compositionstart',()=>{field.dataset.composing='true';});field.addEventListener('compositionend',()=>{delete field.dataset.composing;});}
 return async()=>{
  if(pending||!active()||fields.some(f=>f.dataset.composing==='true'))return;
  const show=text=>{notice.textContent=text;notice.hidden=false;};
  const issue=validate();if(issue){show(issue.message);issue.field?.setAttribute('aria-invalid','true');issue.field?.focus();return;}
  if(!online()){show('オフラインです。接続してからもう一度送信してください。');return;}
  pending=true;const controls=[...root.querySelectorAll('input,select,textarea,button')],states=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);root.setAttribute('aria-busy','true');show('送信しています…');
  try{await request();if(active())onSuccess();}
  catch{if(active())show('送信できませんでした。入力は残っています。接続を確認して、もう一度お試しください。');}
  finally{pending=false;root.removeAttribute('aria-busy');controls.forEach((n,i)=>n.disabled=states[i]);}
 };
}
