let enabled=false;
let stop=()=>{};

export function createLiveSummarySetting(el){
 const label=el('label','Live要約','admin-check'),input=el('input');
 input.type='checkbox';
 input.checked=enabled;
 input.onchange=()=>{enabled=input.checked;if(!enabled)stop();};
 label.prepend(input);
 const section=el('section');
 section.append(label,el('p','オンにすると、会話の字幕をAIに送信して約1分ごとに要約します。','admin-caption'));
 return section;
}

export function createLiveSummary({el,api,captions,language,record=()=>{}}){
 const pending=new Map(),seen=new Map(),history=[];
 const wide=matchMedia('(min-width:900px), (min-width:480px) and (max-height:620px)');
 let timer,request,panel,output,status,button,badge,dialog,wiki,wikiRequest,translationButton,translationRequest,summaryLanguage,historyPanel,finalizeButton,finalizing=false,isFinal=false,summary='';
 function read(){badge.hidden=true;button.setAttribute('aria-label','要約を表示');}
 function place(){
  if(!panel)return;
  if(wide.matches){
   if(dialog.open)dialog.close();
   button.after(panel);
  }else dialog.append(panel);
 }
 wide.addEventListener('change',place);
 function makeDialog(title){
  const node=el('dialog'),heading=el('h2',title),close=el('button','閉じる');
  node.setAttribute('aria-label',title);
  Object.assign(node.style,{width:'min(90vw, 38rem)',maxHeight:'85dvh',overflow:'auto'});
  close.type='button';
  close.onclick=()=>node.close();
  node.append(heading,close);
  document.body.append(node);
  return node;
 }
 async function showTerm(term,target){
  wikiRequest?.abort();
  wiki?.remove();
  const controller=new AbortController();
  wikiRequest=controller;
  const node=wiki=makeDialog(term+' — Wikipedia'),extract=el('p','読み込み中…');
  const code=(target||language()).split('-')[0];
  const origin='https://'+(/^[a-z]{2,3}$/.test(code)?code:'ja')+'.wikipedia.org';
  const link=el('a','Wikipediaで記事を開く');
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.href=origin+'/wiki/Special:Search?search='+encodeURIComponent(term);
  node.append(extract,link);
  node.addEventListener('close',()=>{controller.abort();node.remove();},{once:true});
  node.showModal();
  try{
   const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:term,gsrnamespace:'0',gsrlimit:'1',prop:'extracts|info',inprop:'url',exintro:'1',explaintext:'1',exsentences:'4',format:'json',formatversion:'2',origin:'*'});
   const response=await fetch(origin+'/w/api.php?'+params,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]),credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('Wikipedia request failed');
   const page=(await response.json()).query?.pages?.[0];
   extract.textContent=page?.extract||'該当する記事の概要を取得できませんでした。';
   if(page?.title)link.href=origin+'/wiki/'+encodeURIComponent(page.title);
  }catch{
   if(!controller.signal.aborted)extract.textContent='記事の概要を取得できませんでした。';
  }
 }
 function renderSummary(text=summary,target=summaryLanguage,container=output){
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  container.replaceChildren();
  if(container===output&&isFinal)container.append(el('h3','全体要約'));
  let list;
  for(const line of lines){
   const heading=line.match(/^#{1,3}\s+(.+)$/);
   const bullet=line.match(/^[-*•]\s+(.+)$/);
   if(heading||!bullet)list=null;
   const node=el(heading?'h3':bullet?'li':'p');
   if(heading)node.style.borderBottom='1px solid var(--line, #777)';
   const parts=(heading?.[1]||bullet?.[1]||line).split(/(\[\[[^\[\]\n]{1,64}\]\])/);
   for(const part of parts){
    if(part.startsWith('[[')&&part.endsWith(']]')){
     const term=part.slice(2,-2),link=el('button',term);
     link.type='button';
     Object.assign(link.style,{display:'inline',minHeight:'0',padding:'0 .2em',textDecoration:'underline',font:'inherit'});
     link.onclick=()=>void showTerm(term,target);
     node.append(link);
    }else if(part)node.append(part);
   }
   if(bullet){
    if(!list){list=el('ul');container.append(list);}
    list.append(node);
   }else container.append(node);
  }
 }

 function reset(){
  clearTimeout(timer);timer=null;
  if(request){request.abort();record('cancelled');}request=null;
  if(translationRequest){translationRequest.abort();translationRequest=null;record('cancelled');}
  pending.clear();seen.clear();history.length=0;finalizing=false;isFinal=false;summary='';
  wikiRequest?.abort();wiki?.remove();wiki=null;
  dialog?.remove();dialog=null;
  button?.remove();button=null;
  panel?.remove();panel=null;
 }
 stop=reset;
 function schedule(){
  if(enabled&&pending.size&&!timer&&!request)timer=setTimeout(update,60000);
 }
 async function update(final=false){
  timer=null;
  const controller=new AbortController();
  request=controller;
  const batch=new Map(pending);
  const transcript=[...batch.values()].join('\n');
  const started=performance.now(),captionCount=pending.size;
  pending.clear();
  if(!final)record('requested',{captionCount,characters:Math.min(6000,transcript.length)});
  try{
   const target=language();
   let result;
   if(final){
    const material=history.map(entry=>entry.text).concat(transcript).filter(Boolean).join('\n\n');
    let previous='';
    for(let offset=0;offset<material.length;offset+=6000){
     const section=material.slice(offset,offset+6000);
     record('requested',{captionCount:offset===0?captionCount:0,characters:section.length});
     const startedAt=performance.now();
     result=await api('/live-summary',{transcript:section,previous,language:target,final:true},{signal:controller.signal});
     if(controller.signal.aborted)return;
     record('succeeded',{elapsedMs:Math.round(performance.now()-startedAt),usage:result.usage});
     previous=result.summary;
    }
   }else{
    result=await api('/live-summary',{transcript:transcript.slice(-6000),previous:'',language:target},{signal:controller.signal});
    if(controller.signal.aborted)return;
    history.push({text:result.summary,language:target,time:new Date()});
   }
   if(controller.signal.aborted)return;
   if(translationRequest){translationRequest.abort();translationRequest=null;record('cancelled');}
   if(final&&transcript)history.push({text:transcript,language:target,time:new Date()});
   summary=result.summary;
   isFinal=final;
   summaryLanguage=target;
   translationButton.hidden=/^ja(?:-|$)/.test(summaryLanguage);
   translationButton.disabled=false;
   translationButton.textContent='日本語に翻訳';
   translationButton.onclick=translateSummary;
   renderSummary();
   if(!final)appendHistory(history.at(-1));
   badge.hidden=false;
   button.setAttribute('aria-label','要約を表示・更新あり');
   status.textContent='';
   if(!final)record('succeeded',{elapsedMs:Math.round(performance.now()-started),usage:result.usage});
  }catch{
   if(!controller.signal.aborted){
    record('failed',{elapsedMs:Math.round(performance.now()-started)});
    const newer=[...pending];
    pending.clear();
    for(const [id,text] of batch)pending.set(id,text);
    for(const [id,text] of newer)pending.set(id,id.endsWith?.(':live')?((pending.get(id)||'')+text).slice(-6000):text);
    status.textContent=final?'全体要約を作成できませんでした。もう一度お試しください。':'要約を更新できませんでした。';
   }
  }finally{
   if(request===controller){
    request=null;
    if(finalizing&&!final){void update(true);return;}
    finalizing=false;
    finalizeButton.disabled=false;
    schedule();
   }
  }
 }
 async function translateSummary(){
  const controller=new AbortController();
  translationRequest=controller;
  translationButton.disabled=true;
  const started=performance.now();
  record('requested',{characters:summary.length});
  try{
   const result=await api('/live-summary',{transcript:summary,previous:'',language:'ja',translate:true},{signal:controller.signal});
   if(controller.signal.aborted)return;
   record('succeeded',{elapsedMs:Math.round(performance.now()-started),usage:result.usage});
   const toggle=showJapanese=>{
    renderSummary(showJapanese?result.summary:summary,showJapanese?'ja':summaryLanguage);
    translationButton.textContent=showJapanese?'要約の原文を表示':'日本語訳を表示';
    translationButton.onclick=()=>toggle(!showJapanese);
   };
   toggle(true);
  }catch{
   if(controller.signal.aborted)return;
   record('failed',{elapsedMs:Math.round(performance.now()-started)});
   status.textContent='要約の日本語訳を取得できませんでした。';
  }finally{
   if(translationRequest===controller){translationRequest=null;translationButton.disabled=false;}
  }
 }
 function appendHistory(entry){
  const section=el('details'),heading=el('summary',entry.time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
  const body=el('div');
  renderSummary(entry.text,entry.language,body);
  section.append(heading,body);
  historyPanel.append(section);
 }
 function finalize(){
  if(finalizing||(isFinal&&!pending.size&&!request)||(!pending.size&&!history.length&&!request))return;
  finalizing=true;
  finalizeButton.disabled=true;
  status.textContent='全体要約を作成中…';
  clearTimeout(timer);timer=null;
  if(!request)void update(true);
 }
 function add(id,text,append=false){
  if(!enabled||typeof text!=='string'||!text.trim())return;
  const value=append?((pending.get(id)||'')+text).slice(-6000):text.trim().slice(0,1200);
  if(!append&&seen.get(id)===value)return;
  seen.set(id,value);
  if(seen.size>256)seen.delete(seen.keys().next().value);
  pending.set(id,value);
  if(pending.size>80)pending.delete(pending.keys().next().value);
  if(!panel){
   panel=el('section',undefined,'admin-detail');
   panel.style.flexShrink='0';
   output=el('div');
   Object.assign(output.style,{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxBlockSize:'min(50dvh, 24rem)',overflowY:'auto',overscrollBehaviorY:'contain',touchAction:'pan-y'});
   output.tabIndex=0;
   output.setAttribute('aria-label','Live要約の本文');
   status=el('small','最初の要約は約1分後に表示します。');
   status.setAttribute('role','status');
   translationButton=el('button','日本語に翻訳');
   translationButton.type='button';
   translationButton.hidden=true;
   finalizeButton=el('button','全体を要約');
   finalizeButton.type='button';
   finalizeButton.onclick=finalize;
   historyPanel=el('section');
   Object.assign(historyPanel.style,{maxBlockSize:'min(32dvh, 16rem)',overflowY:'auto',overscrollBehaviorY:'contain'});
   historyPanel.tabIndex=0;
   historyPanel.append(el('h3','時系列の要約'));
   panel.append(finalizeButton,translationButton,output,status,historyPanel);
   dialog=makeDialog('Live要約');
   button=el('button','要約を表示');
   button.type='button';
   badge=el('span',' 更新');
   badge.hidden=true;
   badge.setAttribute('role','status');
   button.append(badge);
   button.onclick=()=>{
    read();
    if(wide.matches){output.scrollIntoView({block:'nearest'});output.focus();}
    else if(!dialog.open)dialog.showModal();
   };
   captions().closest('#live').querySelector('.live-tools').append(button);
   place();
  }
  schedule();
 }
 return {add,reset};
}
