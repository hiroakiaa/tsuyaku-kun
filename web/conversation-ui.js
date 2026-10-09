export function conversationPresentation(s){
 const reconnecting=/再接続|つなぎ直|停止しました|接続できません/.test(s.connection||'')||s.paused;
 const microphone=s.preparing?'準備中':!s.mic?'マイクOFF':reconnecting?'再接続待ち':s.recognitionKind?'音声認識中':'音声認識を準備中';
 const costs=[];
 if(s.translating)costs.push('翻訳処理中：AI利用の可能性');
 if(s.mic&&s.recognitionKind==='server')costs.push('サーバー音声認識：従量課金対象');
 if(s.mic&&s.recognitionKind==='browser')costs.push('ブラウザー音声認識：アプリの認識API費用なし');
 if(s.relay)costs.push('音声接続中：TURN経由の場合は通信費');
 return {microphone,connection:s.local?'この端末で利用中':s.connection||'準備中',cost:costs.join(' ／ ')||'処理待機中',role:s.role==='teacher'?'先生':s.role==='student'?'生徒':'',canStop:!!(s.mode&&(s.mic||s.preparing||s.translating||s.relay))};
}

export function installConversationUI({getState,stop}){
 const $=s=>document.querySelector(s),live=$('#live'),captions=$('#captions');
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const bar=make('div',null,'conversation-status'),mic=make('span'),connection=make('span'),cost=make('span'),stopButton=make('button','一時停止');
 bar.setAttribute('aria-label','会話の状態');mic.setAttribute('role','status');connection.setAttribute('role','status');cost.className='processing-state';cost.title='変動費の対象となる処理の目印です。固定費・サーバー維持費は含まず、請求額や無料枠の残量を示しません。';stopButton.type='button';stopButton.onclick=stop;bar.append(mic,connection,cost,stopButton);live.prepend(bar);
 const badge=make('span',null,'header-role');badge.hidden=true;$('.app-shell>header').insertBefore(badge,$('.header-tools'));
 const latest=make('button','最新へ ↓','captions-latest');latest.type='button';latest.hidden=true;captions.parentElement.append(latest);
 let unread=false,scheduled=false;
 const nearBottom=()=>captions.scrollHeight-captions.scrollTop-captions.clientHeight<100;
 const text=(n,v)=>{if(n.textContent!==v)n.textContent=v;};
 const refresh=()=>{scheduled=false;const p=conversationPresentation(getState());text(mic,p.microphone);text(connection,p.connection);text(cost,p.cost);badge.hidden=!p.role;text(badge,p.role);stopButton.hidden=!p.canStop;mic.dataset.active=String(p.microphone==='音声認識中');const cards=[...captions.querySelectorAll('.caption')];cards.forEach((n,i)=>n.classList.toggle('caption-latest',i===cards.length-1));if(nearBottom())unread=false;latest.hidden=!cards.length||nearBottom();text(latest,unread?'新しい字幕 · 最新へ ↓':'最新へ ↓');};
 const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(refresh);}};
 latest.onclick=()=>{unread=false;captions.scrollTo({top:captions.scrollHeight,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});schedule();};
 captions.addEventListener('scroll',schedule,{passive:true});
 new ResizeObserver(schedule).observe(captions);
 new MutationObserver(()=>{if(!nearBottom())unread=true;schedule();}).observe(captions,{childList:true,subtree:true});
 new MutationObserver(schedule).observe($('#connection'),{childList:true,subtree:true});
 new MutationObserver(schedule).observe($('#microphone'),{attributes:true,attributeFilter:['aria-pressed','aria-busy','disabled','hidden'],childList:true});
 new MutationObserver(schedule).observe($('#lesson-role-teacher'),{attributes:true,attributeFilter:['aria-pressed']});
 new MutationObserver(schedule).observe($('#lesson-role-student'),{attributes:true,attributeFilter:['aria-pressed']});
 new MutationObserver(schedule).observe($('#participants'),{childList:true,subtree:true});
 document.addEventListener('visibilitychange',schedule);schedule();
 return {refresh:schedule};
}
