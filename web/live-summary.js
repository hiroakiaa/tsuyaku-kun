let enabled=false;
let stop=()=>{};

export function createLiveSummarySetting(el){
 const label=el('label','Live要約','admin-check'),input=el('input');
 input.type='checkbox';
 input.checked=enabled;
 input.onchange=()=>{enabled=input.checked;if(!enabled)stop();};
 label.prepend(input);
 const section=el('section');
 section.append(label,el('p','オンにすると、会話の字幕をAIに送信して約2分ごとに要約します。','admin-caption'));
 return section;
}

export function createLiveSummary({el,api,captions,language}){
 const pending=new Map(),seen=new Map();
 let timer,request,panel,output,status,summary='';
 function reset(){
  clearTimeout(timer);timer=null;
  request?.abort();request=null;
  pending.clear();seen.clear();summary='';
  panel?.remove();panel=null;
 }
 stop=reset;
 function schedule(){
  if(enabled&&pending.size&&!timer&&!request)timer=setTimeout(update,120000);
 }
 async function update(){
  timer=null;
  const controller=new AbortController();
  request=controller;
  const transcript=[...pending.values()].join('\n').slice(-6000);
  pending.clear();
  try{
   const result=await api('/live-summary',{transcript,previous:summary,language:language()},{signal:controller.signal});
   if(controller.signal.aborted)return;
   summary=result.summary;
   output.textContent=summary;
   status.textContent='';
  }catch{
   if(!controller.signal.aborted)status.textContent='要約を更新できませんでした。';
  }finally{
   if(request===controller){request=null;schedule();}
  }
 }
 function add(id,text){
  if(!enabled||typeof text!=='string'||!text.trim())return;
  const value=text.trim().slice(0,1200);
  if(seen.get(id)===value)return;
  seen.set(id,value);
  if(seen.size>256)seen.delete(seen.keys().next().value);
  pending.set(id,value);
  if(pending.size>80)pending.delete(pending.keys().next().value);
  if(!panel){
   panel=el('details',undefined,'admin-detail');
   panel.open=true;
   output=el('p');
   output.style.whiteSpace='pre-wrap';
   status=el('small','最初の要約は約2分後に表示します。');
   status.setAttribute('role','status');
   panel.append(el('summary','Live要約'),output,status);
   captions().before(panel);
  }
  schedule();
 }
 return {add,reset};
}
