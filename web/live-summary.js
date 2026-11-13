const SUMMARY_INTERVAL_MS=30000;
const SUMMARY_SETTING_KEY='tsuyaku-live-summary-enabled';
let enabled=false;
try{enabled=localStorage.getItem(SUMMARY_SETTING_KEY)==='on';}catch{}
let stop=()=>{};

export function createLiveSummarySetting(el){
 const label=el('label','Live要約','admin-check'),input=el('input');
 input.type='checkbox';
 input.checked=enabled;
 input.onchange=()=>{
  enabled=input.checked;
  try{localStorage.setItem(SUMMARY_SETTING_KEY,enabled?'on':'off');}catch{}
  if(!enabled)stop();
 };
 label.prepend(input);
 const section=el('section');
 section.append(label,el('p','オンにすると、会話の字幕をAIに送信して約30秒ごとに要約します。','admin-caption'));
 return section;
}

export function createLiveSummary({el,api,captions,language,record=()=>{}}){
 const pending=new Map(),seen=new Map(),history=[];
 let checkpoint=null,pendingSince=null,retryAfter=0,retryCount=0,bufferNotice,bufferDiscarded=false;
 const wide=matchMedia('(min-width:900px), (min-width:480px) and (max-height:620px)');
 let timer,request,panel,output,status,button,badge,dialog,wiki,wikiRequest,translationButton,translationStatus,copyButton,copyStatus,translationRequest,summaryLanguage,historyPanel,finalizeButton,retryButton,finalSummaryTime,finalizing=false,isFinal=false,summary='';
 function notifySummary(label){
  button.hidden=false;
  badge.textContent=' '+label;
  badge.hidden=false;
  button.setAttribute('aria-label','要約を表示・'+label);
 }
 function read(){badge.hidden=true;button.setAttribute('aria-label','要約を表示');}
 function place(){
  if(!panel)return;
  const wasOpen=dialog.open;
  if(wasOpen)dialog.close();
  (wide.matches?captions().closest('#live'):document.body).append(dialog);
  if(wasOpen)openSummary();
 }
 function openSummary(){
  if(wide.matches)dialog.show();
  else dialog.showModal();
  dialog.focus({preventScroll:true});
 }
 wide.addEventListener('change',place);
 function makeDialog(title){
  const node=el('dialog'),header=el('div',undefined,'modal-heading'),close=el('button',undefined,'modal-close');
  const icon=el('i',undefined,'fa-solid fa-xmark');
  icon.setAttribute('aria-hidden','true');
  close.setAttribute('aria-label','閉じる');
  close.append(icon);
  header.append(el('h2',title),close);
  node.setAttribute('aria-label',title);
  node.tabIndex=-1;
  Object.assign(node.style,{width:'min(90vw, 38rem)',maxHeight:'85dvh',overflow:'auto'});
  close.type='button';
  close.onclick=()=>node.close();
  node.append(header);
  document.body.append(node);
  return node;
 }
 async function showTerm(term,target,trigger,container){
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
  node.addEventListener('close',()=>{
   controller.abort();
   node.remove();
   if(wiki!==node)return;
   wiki=null;
   wikiRequest=null;
   if(!container.isConnected)return;
   const replacement=[...container.querySelectorAll('[data-summary-term]')].find(button=>button.dataset.summaryTerm===term);
   (trigger.isConnected?trigger:replacement||container).focus({preventScroll:true});
  },{once:true});
  node.showModal();
  node.focus({preventScroll:true});
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
  const scrollTop=container.scrollTop;
  const active=document.activeElement;
  const focusedTerm=active?.dataset?.summaryTerm;
  const restoreFocus=focusedTerm!==undefined&&container.contains(active);
  let matchingTerm;
  container.replaceChildren();
  container.lang=target||'';
  container.dir='auto';
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
     link.dataset.summaryTerm=term;
     if(restoreFocus&&term===focusedTerm)matchingTerm??=link;
     Object.assign(link.style,{display:'inline',minHeight:'0',padding:'0 .2em',textDecoration:'underline',font:'inherit'});
     link.onclick=()=>void showTerm(term,target,link,container);
     node.append(link);
    }else if(part)node.append(part);
   }
   if(bullet){
    if(!list){list=el('ul');container.append(list);}
    list.append(node);
   }else container.append(node);
  }
  if(restoreFocus)(matchingTerm||container).focus({preventScroll:true});
  container.scrollTop=scrollTop;
  if(container===output){copyButton.hidden=false;copyStatus.textContent='';}
 }

 function reset(){
  clearTimeout(timer);timer=null;
  if(request){request.abort();record('cancelled',{operation:request.operation});}request=null;
  if(translationRequest){translationRequest.abort();translationRequest=null;record('cancelled',{operation:'translation'});}
  checkpoint=null;
  pendingSince=null;retryAfter=0;retryCount=0;
  bufferNotice=null;bufferDiscarded=false;
  pending.clear();seen.clear();history.length=0;finalizing=false;isFinal=false;summary='';
  wikiRequest?.abort();wiki?.remove();wiki=null;
  dialog?.remove();dialog=null;
  button?.remove();button=null;
  panel?.remove();panel=null;
 }
 stop=reset;
 function schedule(){
  if(enabled&&pending.size&&!timer&&!request)timer=setTimeout(update,Math.max(0,(pendingSince??performance.now())+SUMMARY_INTERVAL_MS-performance.now(),retryAfter-performance.now()));
 }
 function noteDiscard(details){
  record('bufferDiscarded',details);
  bufferDiscarded=true;
  if(bufferNotice)bufferNotice.hidden=false;
 }
 function boundedText(text,limit,fromEnd=false){
  if(text.length<=limit)return text;
  const boundary=fromEnd?text.length-limit:limit;
  const left=text.charCodeAt(boundary-1),right=text.charCodeAt(boundary);
  const splitPair=left>=0xd800&&left<=0xdbff&&right>=0xdc00&&right<=0xdfff;
  const cut=boundary+(splitPair?(fromEnd?1:-1):0);
  const retained=fromEnd?text.slice(cut):text.slice(0,cut);
  noteDiscard({characters:text.length-retained.length});
  return retained;
 }
 function trimPending(){
  while(pending.size>80){
   const oldest=pending.keys().next().value;
   noteDiscard({captionCount:1,characters:pending.get(oldest).length});
   pending.delete(oldest);
  }
 }
 function restorePending(batch){
  const newer=[...pending];
  pending.clear();
  for(const [id,text] of batch)pending.set(id,text);
  for(const [id,text] of newer)pending.set(id,typeof id==='string'&&id.endsWith(':live')?boundedText((pending.get(id)||'')+text,6000,true):text);
  trimPending();
 }
 async function update(final=false){
  let languageChanged=false;
  clearTimeout(timer);timer=null;
  retryButton.hidden=true;
  status.textContent=final?'全体要約を作成中…':'要約を更新中…';
  output.setAttribute('aria-busy','true');
  const controller=new AbortController();
  controller.operation=final?'final':'interval';
  request=controller;
  const batch=new Map(pending);
  const transcript=[...batch.values()].join('\n');
  const started=performance.now(),captionCount=pending.size;
  const batchSince=pendingSince;
  const queueMs=batchSince===null?null:Math.round(started-batchSince);
  retryAfter=0;
  pending.clear();
  pendingSince=null;
  try{
   const target=language();
   const material=final?history.map(entry=>entry.text).concat(transcript).filter(Boolean).join('\n\n'):transcript;
   const characters=Array.from(material);
   const resume=checkpoint?.target===target&&checkpoint.final===final&&material.startsWith(checkpoint.prefix);
   let previous=resume?checkpoint.result.summary:'';
   let result=resume?checkpoint.result:null;
   let offset=resume?checkpoint.offset:0;
   if(!resume)checkpoint=null;
   while(offset<characters.length){
    let end=offset,length=0;
    while(end<characters.length&&length+characters[end].length<=6000)length+=characters[end++].length;
    const section=characters.slice(offset,end).join('');
    record('requested',{operation:controller.operation,captionCount:offset===0?captionCount:0,characters:section.length,queueMs:offset===0?queueMs:null});
    const startedAt=performance.now();
    result=await api('/live-summary',{transcript:section,previous,language:target,final},{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
    if(controller.signal.aborted)return;
    record('succeeded',{operation:controller.operation,elapsedMs:Math.round(performance.now()-startedAt),usage:result.usage});
    if(language()!==target){
     pendingSince=batchSince??pendingSince;
     restorePending(batch);
     languageChanged=true;
     return;
    }
    previous=result.summary;
    offset=end;
    if(material.length<=96000&&offset<characters.length){
     checkpoint={target,final,offset,prefix:characters.slice(0,offset).join(''),result};
    }
   }
   checkpoint=null;
   if(!final)history.push({text:result.summary,language:target,time:new Date()});
   if(controller.signal.aborted)return;
   if(translationRequest){translationRequest.abort();translationRequest=null;record('cancelled',{operation:'translation'});}
   if(final&&transcript)history.push({text:transcript,language:target,time:new Date()});
   if(isFinal)appendHistory({text:summary,language:summaryLanguage,time:finalSummaryTime,final:true});
   summary=result.summary;
   isFinal=final;
   if(final)finalSummaryTime=new Date();
   summaryLanguage=target;
   translationStatus.textContent='';
   translationButton.hidden=/^ja(?:-|$)/.test(summaryLanguage);
   translationButton.disabled=false;
   translationButton.textContent='日本語に翻訳';
   translationButton.onclick=translateSummary;
   renderSummary();
   if(!final)appendHistory(history.at(-1));
   retryCount=0;
   notifySummary('更新あり');
   status.textContent='';
  }catch{
   if(!controller.signal.aborted){
    record('failed',{operation:controller.operation,elapsedMs:Math.round(performance.now()-started)});
    pendingSince=batchSince??pendingSince;
    const retryDelay=Math.min(30,5*2**Math.min(retryCount++,3));
    retryAfter=performance.now()+retryDelay*1000;
    restorePending(batch);
    status.textContent=final?'全体要約を作成できませんでした。':'要約を更新できませんでした。約'+retryDelay+'秒後に再試行します。';
    retryButton.onclick=()=>{if(!request)void update(final);};
    retryButton.hidden=false;
    notifySummary('要約に失敗');
   }
  }finally{
   if(request===controller){
    request=null;
    if(languageChanged){void update(final);return;}
    if(finalizing&&!final){void update(true);return;}
    finalizing=false;
    finalizeButton.disabled=false;
    output.setAttribute('aria-busy','false');
    schedule();
   }
  }
 }
 async function translateSummary(){
  const controller=new AbortController();
  translationRequest=controller;
  translationButton.disabled=true;
  translationStatus.textContent='日本語に翻訳中…';
  const started=performance.now();
  record('requested',{operation:'translation',characters:summary.length});
  try{
   const result=await api('/live-summary',{transcript:summary,previous:'',language:'ja',translate:true},{signal:controller.signal});
   if(controller.signal.aborted)return;
   record('succeeded',{operation:'translation',elapsedMs:Math.round(performance.now()-started),usage:result.usage});
   const toggle=showJapanese=>{
    renderSummary(showJapanese?result.summary:summary,showJapanese?'ja':summaryLanguage);
    translationButton.textContent=showJapanese?'要約の原文を表示':'日本語訳を表示';
    translationButton.onclick=()=>toggle(!showJapanese);
   };
   toggle(true);
   translationStatus.textContent='';
  }catch{
   if(controller.signal.aborted)return;
   record('failed',{operation:'translation',elapsedMs:Math.round(performance.now()-started)});
   translationStatus.textContent='要約の日本語訳を取得できませんでした。';
  }finally{
   if(translationRequest===controller){translationRequest=null;translationButton.disabled=false;}
  }
 }
 async function copySummary(body,feedback){
  try{
   await navigator.clipboard.writeText(body.innerText.trim());
   feedback.textContent='要約をコピーしました。';
  }catch{
   feedback.textContent='コピーできませんでした。要約本文を選択してコピーしてください。';
  }
 }
 function makeCopyButton(label){
  const button=el('button',undefined,'summary-copy-icon');
  const icon=el('i',undefined,'fa-solid fa-copy');
  icon.setAttribute('aria-hidden','true');
  button.append(icon);
  button.type='button';
  button.setAttribute('aria-label',label);
  button.title=label;
  return button;
 }
 function appendHistory(entry){
  const section=el('details');
  const time=entry.time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const heading=el('summary',entry.final?'全体要約 · '+time:time);
  const body=el('div');
  body.tabIndex=-1;
  renderSummary(entry.text,entry.language,body);
  const copy=makeCopyButton('この要約をコピー'),feedback=el('small');
  copy.type='button';
  feedback.setAttribute('role','status');
  copy.onclick=()=>copySummary(body,feedback);
  section.append(heading,body,copy,feedback);
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
 function add(id,text,append=false,limit=append?6000:1200){
  if(!enabled||typeof text!=='string'||(!text.trim()&&!(append&&pending.has(id))))return;
  const value=boundedText(append?(pending.get(id)||'')+text:text.trim(),limit,append);
  if(!append&&seen.get(id)===value)return;
  seen.set(id,value);
  if(seen.size>256)seen.delete(seen.keys().next().value);
  pendingSince??=performance.now();
  pending.set(id,value);
  trimPending();
  if(!panel){
   panel=el('section',undefined,'admin-detail');
   panel.style.flexShrink='0';
   output=el('div');
   Object.assign(output.style,{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxBlockSize:'min(50dvh, 24rem)',overflowY:'auto',overscrollBehaviorY:'contain',touchAction:'pan-y'});
   output.tabIndex=0;
   output.setAttribute('aria-label','Live要約の本文');
   status=el('small','最初の要約は約30秒後に表示します。');
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
   retryButton=el('button','要約を再試行');
   retryButton.type='button';
   retryButton.hidden=true;
   bufferNotice=el('p','保持上限に達したため、要約に含まれない字幕があります。','admin-caption');
   bufferNotice.hidden=!bufferDiscarded;
   bufferNotice.setAttribute('role','status');
   translationStatus=el('small');
   translationStatus.setAttribute('role','status');
   copyButton=makeCopyButton('要約をコピー');
   copyButton.type='button';
   copyButton.hidden=true;
   copyStatus=el('small');
   copyStatus.setAttribute('role','status');
   copyButton.onclick=()=>copySummary(output,copyStatus);
   panel.append(finalizeButton,translationButton,copyButton,copyStatus,bufferNotice,output,status,retryButton,translationStatus,historyPanel);
   dialog=makeDialog('Live要約');
   dialog.classList.add('live-summary-dialog');
   dialog.append(panel);
   button=el('button',undefined,'live-summary-toggle');
   button.hidden=true;
   button.setAttribute('aria-label','要約を表示');
   const summaryIcon=el('i',undefined,'fa-solid fa-list');
   summaryIcon.setAttribute('aria-hidden','true');
   button.append(summaryIcon,el('span','要約を表示'));
   button.type='button';
   badge=el('span',' 更新');
   badge.hidden=true;
   badge.setAttribute('role','status');
   button.append(badge);
   button.onclick=()=>{
    read();
    if(!dialog.open)openSummary();
    if(!summary&&pending.size&&!request)void update();
   };
   captions().closest('#live').querySelector('.call-controls').prepend(button);
   place();
  }
  schedule();
 }
 return {add,reset};
}
