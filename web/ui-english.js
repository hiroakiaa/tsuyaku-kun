import {guardedStorage} from './storage-access.js?v=20261024-usability20-4';
const localStorage=guardedStorage(()=>globalThis.localStorage);
import {uiLabels} from './ui-labels.js?v=20261021-chat-controls-1';

export const ENGLISH_GUIDES_KEY='tsuyaku-english-guides-v1';
export function guidesEnabled(storage){try{return storage.getItem(ENGLISH_GUIDES_KEY)!=='off';}catch{return true;}}
let sheetLabels=Object.create(null);
export function applyEnglishLabels(labels){if(!labels||Array.isArray(labels)||typeof labels!=='object')return false;const next=Object.create(null);for(const [ja,en] of Object.entries(labels)){if(ja.length<=3000&&typeof en==='string'&&en.length<=300&&!/[<>\x00-\x08]/.test(en))next[ja]=en.trim();}if(!Object.keys(next).length)return false;sheetLabels=next;activeGuides?.refresh();return true;}
const trim=value=>String(value??'').replace(/\s+/g,' ').trim();
const dynamicLabels=[
 ['相手端末に表示済み','Displayed on partners'],['取得日時：','Retrieved'],
 ['この認証IDの本日の利用：',"This user's use today"],['この認証IDの1日の設定上限：',"This user's daily limit"],['この認証IDの残り：',"This user's remaining budget"],
 ['本日の利用：',"Today's use"],['1日の設定上限：','Daily limit'],['次のリセット：','Next reset'],['翻訳 P95：','Translation P95'],
 ['最新の利用：翻訳成功 ','Latest translation results'],['最新の利用で5秒以上の翻訳 ','Translations taking over 5 seconds'],['最新の利用でTURN中継通信 ','Observed TURN traffic'],
 ['当日UTCの利用履歴：音声認識エラー ','Speech recognition errors today (UTC)'],['直近の利用で待機音声の破棄 ','Discarded queued audio'],['直近の利用で音声通話の接続失敗 ','Recent audio connection failures'],['直近の利用中に音声認識エラー ','Recent speech recognition errors'],
 ['接続先が応答しました（HTTP ','Endpoint HTTP response'],['5分より古い通信記録 ','Older connection records'],['取得：','Retrieved'],['開始 ','Started'],['確認日 ','Checked on'],['AIなしで訳せた割合：','Share translated without AI'],
 ['1回ごとの利用','Per-session use'],['入力 ','Input'],['翻訳 ','Translation'],['音声認識 ','Speech recognition']
];
export function englishFor(value){
 const text=trim(value);if(!text||text.length>3000)return '';
 if(Object.hasOwn(sheetLabels,text))return sheetLabels[text];
 if(Object.hasOwn(uiLabels,text))return uiLabels[text];
 let match=text.match(/^あと(\d+)件\s*[·・]\s*続きを見る$/);if(match)return match[1]+' more';
 if(/^.+を少なく表示$/.test(text))return 'Show less';
 if(/^.+の続きを見る$/.test(text))return 'Show more';
 match=text.match(/^(自分|相手)のことばを入力$/);if(match)return match[1]==='自分'?'Type your words':'Type your partner\'s words';
 if(/^(自分|相手)が話す番に交代する$/.test(text))return 'Switch speaker';
 if(/^(自分|相手)が話す$/.test(text))return 'Speaking';
 if(/の読み上げを一時停止$/.test(text))return 'Pause speech';
 if(/の読み上げを再開$/.test(text))return 'Resume speech';
 if(/の読み上げを停止$/.test(text))return 'Stop speech';
 if(/を読み上げる$/.test(text))return 'Play audio';
 if(/の音声を準備中。押すと取り消し$/.test(text))return 'Preparing audio. Press to cancel.';
 match=text.match(/^(.+?)を(再生|一時停止|停止|再開)$/);if(match)return ({再生:'Play',一時停止:'Pause',停止:'Stop',再開:'Resume'})[match[2]]+' '+(englishFor(match[1])||'audio');
 match=text.match(/^(.+?)：推定に必要な実績がありません。$/);if(match)return (englishFor(match[1])||'Estimate')+': no measured samples yet.';
 match=text.match(/^(.+?)：あと約(\d+)文。10文の会話なら約(\d+)回、50文なら約(\d+)回/);if(match)return (englishFor(match[1])||'Translation')+': about '+match[2]+' captions; '+match[3]+' short or '+match[4]+' long sessions.';
 match=text.match(/^(\d+)回の利用・(\d+)文/);if(match)return match[1]+' sessions · '+match[2]+' captions';
 match=text.match(/^(\d+)文・未成功 (\d+)文・試行 (\d+)回/);if(match)return match[1]+' captions · '+match[2]+' unsuccessful · '+match[3]+' attempts';
 for(const [prefix,en] of dynamicLabels)if(text.startsWith(prefix.trim()))return en;
 // Timing rows combine a fixed label with measured data; keep the Japanese data untouched.
 match=text.match(/^(.+?)：([\d.]+秒.*|未計測)$/);if(match&&uiLabels[match[1]])return uiLabels[match[1]];
 return '';
}

let activeGuides=null;
export function refreshEnglishGuides(scope){activeGuides?.refresh(scope);}

const skip='script,style,noscript,textarea,input,select,option,svg,canvas,code,pre,[contenteditable],[data-ui-ignore],.ui-copy,.ui-en,.caption-line>p,.caption-meta>span:first-child,.participant-name,.reference-language-text,.reference-reading,[data-speech-text],.speech-word-active,.speech-words-spoken';
export function englishPrompt(value,enabled=true){const en=enabled?englishFor(value):'';return en?en+'\n\n'+value:value;}

export function installEnglishGuides({doc=document,storage=localStorage,Observer=MutationObserver}={}){
 const controllerKey=Symbol.for('tsuyaku.ui-english.controller');if(doc[controllerKey])return doc[controllerKey];
 let enabled=guidesEnabled(storage),scheduled=false;
 const pending=new Set(),root=doc.documentElement;
 const button=doc.createElement('button');button.id='english-guides-toggle';button.type='button';button.textContent='英語\nルビ';button.setAttribute('data-ui-ignore','');
 button.setAttribute('aria-label','英語ルビ / English guides');
 const setEnabled=value=>{enabled=!!value;root.dataset.englishGuides=enabled?'on':'off';button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'英語ルビを隠す / Hide English guides':'英語ルビを表示 / Show English guides';};
 doc.querySelector('.header-tools').insertBefore(button,doc.querySelector('#language-options'));setEnabled(enabled);
 function annotateText(node){
  const parent=node.parentElement;if(!parent||parent.closest(skip)||!/[ぁ-んァ-ヶ一-龠]/.test(node.data))return;
  const english=englishFor(node.data);if(!english)return;
  const wrapper=doc.createElement('span');wrapper.className='ui-copy';
  const guide=doc.createElement('span');guide.className='ui-en';guide.lang='en';guide.dataset.uiEnglish=english;
  // Generated content gives a real English line without changing textContent used by the app.
  // Keep the original text node, listeners, form values and speech text exactly as they are.
  const japanese=doc.createElement('span');japanese.className='ui-ja';japanese.lang='ja';
  node.replaceWith(wrapper);japanese.append(node);wrapper.append(guide,japanese);
 }
 function annotateControls(scope){
  const controls=[...(scope.matches?.('button,input,select,textarea,[role=tab]')?[scope]:[]),...scope.querySelectorAll?.('button,input,select,textarea,[role=tab]')||[]];
  for(const control of controls){
   if(control.closest('[data-ui-ignore]'))continue;
   // Native options already contain the language's own name. Only translate UI instructions.
   if(control.tagName==='SELECT'&&![...control.options].some(o=>o.value==='ja'&&o.textContent.includes('日本語')))for(const option of control.options){const base=option.dataset.uiOption||option.getAttribute('label')||option.textContent;if(base.includes('/'))continue;const en=englishFor(base);if(en){option.dataset.uiOption=base;option.label=enabled?en+' / '+base:base;}}
   const label=control.getAttribute('aria-label'),title=control.getAttribute('title');
   for(const [attribute,value] of [['aria-label',label],['title',title]]){
    if(!value)continue;
    const previous=control.dataset[attribute==='title'?'uiTitle':'uiAria'];
    const ja=previous&&value===previous.split('\u001f')[1]?previous.split('\u001f')[0]:value;
    const en=englishFor(ja);if(!en){if(previous)control.setAttribute(attribute,ja);continue;}
    const bilingual=en+' / '+ja;control.dataset[attribute==='title'?'uiTitle':'uiAria']=ja+'\u001f'+bilingual;
    const displayed=enabled?bilingual:ja;if(control.getAttribute(attribute)!==displayed)control.setAttribute(attribute,displayed);
   }
  }
 }
 function visit(scope){
  if(!scope.isConnected)return;
  if(scope.nodeType===3){annotateText(scope);return;}
  if(scope.nodeType!==1||scope.closest(skip))return;
  annotateControls(scope);
  const walker=doc.createTreeWalker(scope,4),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes)annotateText(node);
 }
 const observer=new Observer(records=>{for(const record of records){if(record.type==='attributes')pending.add(record.target);else if(record.type==='characterData')pending.add(record.target.parentElement);else{pending.add(record.target);for(const node of record.addedNodes)pending.add(node);}}schedule();});
 const observe=()=>observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','data-active-mode']});
 function flush(){scheduled=false;observer.disconnect();try{for(const wrapper of doc.querySelectorAll('.ui-copy')){const en=englishFor(wrapper.querySelector('.ui-ja')?.textContent);wrapper.querySelector('.ui-en').dataset.uiEnglish=en;}for(const node of pending)if(node)visit(node);pending.clear();}finally{observe();}}
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(flush);}}
 const oldSet=setEnabled;
 button.onclick=()=>{oldSet(!enabled);try{storage.setItem(ENGLISH_GUIDES_KEY,enabled?'on':'off');}catch{}pending.add(doc.body);schedule();};
 visit(doc.body);observe();
 // No network, polling, AI calls or server-side preference changes are needed.
 const controller={refresh(scope=doc.body){pending.add(scope);schedule();},disconnect(){observer.disconnect();button.remove();if(doc[controllerKey]===controller)delete doc[controllerKey];}};doc[controllerKey]=controller;return controller;
}
if(typeof document!=='undefined'&&document.querySelector('.header-tools'))activeGuides=installEnglishGuides();
