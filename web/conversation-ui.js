export function createWaitingBubble(el){const bubble=el('div',undefined,'caption-waiting'),dots=el('span',undefined,'waiting-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(el('span','・'));bubble.setAttribute('role','status');bubble.setAttribute('aria-label','処理中');bubble.append(dots);return bubble;}
export function processingPresentation(s,now=Date.now()){
 const active=!!s.mode,recognizing=s.mic&&!s.paused&&s.speechPhase==='recognizing';
 const phase=s.mic&&!s.paused&&s.speechPhase==='capturing'?'capturing':s.translating?'translating':recognizing?'recognizing':'waiting';
 return {phase,text:'',show:active&&phase!=='waiting',busy:active&&['recognizing','translating'].includes(phase),watch:false};
}
export function conversationPresentation(s){
 const reconnecting=/再接続|つなぎ直|停止しました|接続できません/.test(s.connection||'')||s.paused;
 const microphone=s.preparing?'準備中':!s.mic?'マイクOFF':reconnecting?'再接続待ち':s.recognitionKind?'音声認識中':'音声認識を準備中';
 const costs=[];
 if(s.translating)costs.push('翻訳処理中：AI利用の可能性');
 if(s.mic&&s.recognitionKind==='server')costs.push('サーバー音声認識：従量課金対象');
 if(s.mic&&s.recognitionKind==='browser')costs.push('ブラウザー音声認識：アプリの認識API費用なし');
 return {microphone,connection:s.local?'この端末で利用中':s.connection||'準備中',cost:costs.join(' ／ ')||'処理待機中',role:s.role==='teacher'?'先生':s.role==='student'?'生徒':'',canStop:!!(s.mode&&(s.mic||s.preparing||s.translating))};
}

export function captionContentChanged(records,seen){
 const cards=new Set();
 for(const record of records){
  const target=record.target.nodeType===3?record.target.parentElement:record.target;
  const owner=target?.closest?.('.caption');if(owner)cards.add(owner);
  for(const node of record.addedNodes||[]){if(node.matches?.('.caption'))cards.add(node);for(const card of node.querySelectorAll?.('.caption')||[])cards.add(card);}
 }
 let changed=false;
 for(const card of cards){if(card.isConnected===false)continue;const texts=[...card.querySelectorAll('.caption-line>p')].map(n=>n.textContent),signature=JSON.stringify(texts);if(texts.some(Boolean)&&seen.get(card)!==signature)changed=true;seen.set(card,signature);}
 return changed;
}

export function installConversationUI({getState}){
 const $=s=>document.querySelector(s),captions=$('#captions');
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const badge=make('span',null,'header-role');badge.hidden=true;$('.app-shell>header').insertBefore(badge,$('.header-tools'));
 const progress=make('div',null,'conversation-progress');progress.id='conversation-progress';progress.hidden=true;progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');progress.setAttribute('aria-atomic','true');progress.setAttribute('aria-label','処理中');const dots=make('span',null,'waiting-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(make('span','・'));progress.append(dots);captions.append(progress);
 const latest=make('button','最新へ ↓','captions-latest');latest.type='button';latest.hidden=true;latest.setAttribute('aria-controls','captions');captions.setAttribute('tabindex','0');captions.setAttribute('aria-label','会話の字幕');latest.setAttribute('aria-label','字幕履歴の最新の文へ移動');captions.parentElement.append(latest);
 let unread=false,scheduled=false,scrollFrame,progressTimer,following=true;const seenCaptions=new WeakMap();for(const card of captions.querySelectorAll('.caption'))seenCaptions.set(card,JSON.stringify([...card.querySelectorAll('.caption-line>p')].map(n=>n.textContent)));
 const nearBottom=()=>captions.scrollHeight-captions.scrollTop-captions.clientHeight<100;
 const text=(n,v)=>{if(n.textContent!==v)n.textContent=v;};
 const refresh=()=>{scheduled=false;const current=getState(),p=conversationPresentation(current);const processing=processingPresentation(current);clearTimeout(progressTimer);if(processing.watch&&document.visibilityState==='visible')progressTimer=setTimeout(schedule,1000);const show=processing.show&&!captions.querySelector('.caption-waiting');progress.hidden=!show;if(show&&captions.lastElementChild!==progress)captions.append(progress);progress.dataset.phase=processing.phase;captions.setAttribute('aria-busy',String(processing.busy));badge.hidden=!p.role;text(badge,p.role);const cards=[...captions.querySelectorAll('.caption')];cards.forEach((n,i)=>n.classList.toggle('caption-latest',i===cards.length-1));if(!cards.length)following=true;if(nearBottom())unread=false;latest.hidden=!cards.length||nearBottom()||getState().mode==='lesson'&&getState().role!=='teacher'&&following;text(latest,unread?'新しい字幕 · 最新へ ↓':'最新へ ↓');latest.setAttribute('aria-label',unread?'新しい字幕があります。最新の文へ移動':'字幕履歴の最新の文へ移動');};
 const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(refresh);}};
 const followLatest=({primary=false}={})=>{following=true;unread=false;cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{scrollFrame=requestAnimationFrame(()=>{const state=getState();if(!['face','interpreter','lesson'].includes(state.mode))return;unread=false;const card=captions.querySelector('.caption:last-child'),line=card?.querySelector('.caption-line-primary');let top=captions.scrollHeight;if((primary||state.mode==='face')&&card){const containerRect=captions.getBoundingClientRect(),anchor=card.getBoundingClientRect().height<=captions.clientHeight-24?card:line||card;top=Math.max(0,captions.scrollTop+anchor.getBoundingClientRect().top-containerRect.top-12);}captions.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});schedule();});});};
 latest.onclick=()=>{following=true;const state=getState();if(state.mode==='face'||state.mode==='lesson'&&state.role!=='teacher'){followLatest({primary:true});return;}unread=false;captions.scrollTo({top:captions.scrollHeight,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});schedule();};
 captions.addEventListener('scroll',()=>{if(nearBottom())following=true;schedule();},{passive:true});
 const readingEarlier=()=>{following=false;cancelAnimationFrame(scrollFrame);schedule();};
 captions.addEventListener('wheel',readingEarlier,{passive:true});captions.addEventListener('touchmove',readingEarlier,{passive:true});
 captions.addEventListener('pointerdown',event=>{if(event.target===captions)readingEarlier();},{passive:true});
 captions.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target.closest('button,input,select,textarea'))readingEarlier();});
 new ResizeObserver(schedule).observe(captions);
 new MutationObserver(records=>{if(captionContentChanged(records,seenCaptions)&&!nearBottom())unread=true;schedule();}).observe(captions,{childList:true,characterData:true,subtree:true});
 new MutationObserver(schedule).observe($('#connection'),{childList:true,subtree:true});
 new MutationObserver(schedule).observe($('#microphone'),{attributes:true,attributeFilter:['aria-pressed','aria-busy','disabled','hidden'],childList:true});
 new MutationObserver(schedule).observe($('#lesson-role-teacher'),{attributes:true,attributeFilter:['aria-pressed']});
 new MutationObserver(schedule).observe($('#lesson-role-student'),{attributes:true,attributeFilter:['aria-pressed']});
 new MutationObserver(schedule).observe($('#participants'),{childList:true,subtree:true});
 document.addEventListener('visibilitychange',schedule);schedule();
 return {refresh:schedule,followLatest,shouldFollow:()=>following,syncDisplay(){for(const card of captions.querySelectorAll('.caption'))seenCaptions.set(card,JSON.stringify([...card.querySelectorAll('.caption-line>p')].map(n=>n.textContent)));schedule();}};
}
