// Share one in-flight attempt, but permit an explicit retry once it has settled.
export function singleFlight(work){
 let pending=null;
 return (...args)=>pending||(pending=Promise.resolve().then(()=>work(...args)).finally(()=>{pending=null;}));
}

// Load optional UI only when requested. No automatic retries or background requests.
export function installLazyAction(button,load,{onError=()=>{}}={}){
 if(!button)return;let pending=null,attempt=0;
 const open=event=>{if(pending)return pending;const disabled=button.disabled,busy=button.getAttribute('aria-busy');button.disabled=true;button.setAttribute('aria-busy','true');
  pending=Promise.resolve().then(()=>load(++attempt)).then(()=>{const action=button.onclick;if(action===open||typeof action!=='function')throw Error('Action unavailable');if(button.isConnected!==false)return action.call(button,event);}).catch(error=>{button.onclick=open;onError(error);}).finally(()=>{pending=null;button.disabled=disabled;if(busy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',busy);});return pending;
 };button.onclick=open;
}
