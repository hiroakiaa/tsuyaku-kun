import {localIcon} from './icons.js?v=photo-viewer-1';
import {installPhotoZoom} from './photo-zoom.js?v=20261119-minimum-fit';
import {translatePhotoProgressively} from './photo-progress.js?v=20261119-photo-recovery';
import {matchingPhotoBlocks,drawPhotoOverlay} from './photo-overlay.js?v=20261020-photo-overlay-4';
export function photoReadResult(value){
 if(!value||typeof value.text!=='string')throw Error('写真の読み取り結果を確認できませんでした。もう一度お試しください。');
 return {...value,blocks:Array.isArray(value.blocks)?value.blocks.filter(b=>b&&typeof b.id==='string'&&typeof b.text==='string'):[],truncated:value.truncated===true};
}
export function photoTranslationText(text,start=0,end=0){const selected=end>start?text.slice(start,end):text;const value=selected.trim();if(!value)throw Error('翻訳する文字がありません。');return value;}
export function cropRect(width,height,crop){
 const [left,top,right,bottom]=crop.map(Number);if(![width,height,...crop].every(n=>Number.isFinite(Number(n)))||width<1||height<1||left<0||top<0||right>100||bottom>100||right-left<5||bottom-top<5)throw Error('読取範囲を広げてください。');
 return {x:Math.round(width*left/100),y:Math.round(height*top/100),width:Math.max(1,Math.round(width*(right-left)/100)),height:Math.max(1,Math.round(height*(bottom-top)/100))};
}
export function installPhotoTranslate({button,api,modal,el,languages,viewLanguage,speechControls,updateSpeechControls}){
 const images=new Map(),translations=new Map(),segments=new Map();
 const remember=(map,key,value)=>{map.delete(key);map.set(key,value);while(map.size>24)map.delete(map.keys().next().value);};
 button.onclick=()=>{
  const root=el('div',undefined,'photo-translate photo-simple'),file=el('input'),pick=el('button','写真を選択');
  file.type='file';file.accept='image/*';file.hidden=true;file.setAttribute('aria-label','撮影した写真・画像を選ぶ');pick.type='button';pick.className='photo-pick';pick.onclick=()=>{file.value='';file.click();};
  const previewViewport=el('button',undefined,'photo-source-viewport photo-image-card');previewViewport.type='button';previewViewport.setAttribute('aria-label','原文画像を開く');previewViewport.hidden=true;const preview=el('canvas');previewViewport.append(preview);preview.className='photo-preview';preview.setAttribute('aria-label','選択した写真');
  const selection=el('div',undefined,'photo-selection');selection.hidden=true;
  const remove=el('button',undefined,'photo-selection-remove');remove.type='button';remove.setAttribute('aria-label','選択した写真を削除');remove.title='選択した写真を削除';remove.append(localIcon('trash'));selection.append(previewViewport,remove);
  const source={value:'auto'},target=el('select');for(const language of languages().filter(l=>l.code!=='ja-easy')){const o=el('option',language.labelJa+(language.labelNative&&language.labelNative!==language.labelJa?' / '+language.labelNative:''));o.value=language.code;target.append(o);}target.value=['ja','ja-easy'].includes(viewLanguage())?'en':viewLanguage();
  const targetLabel=el('label','翻訳する言語');targetLabel.append(target);const languageRow=el('div',undefined,'photo-languages');languageRow.append(targetLabel);languageRow.hidden=true;
  const translate=el('button','翻訳する');translate.type='button';translate.className='photo-translate-run';translate.disabled=true;translate.hidden=true;translate.title='選んだ画像をGoogleで読み取り、翻訳します';
  const notice=el('p',undefined,'photo-notice');notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const text=el('textarea');text.rows=5;text.setAttribute('aria-label','読み取った原文');let textView='translated';
  const result=el('div',undefined,'photo-results'),details=el('details',undefined,'photo-text-details');details.hidden=true;details.append(el('summary','原文・訳文を見る'),result,el('p','写真そのものは保存しません。読取結果と訳文は同じ利用者の次回の翻訳でも再利用します。','photo-help'));
  const overlay=el('section',undefined,'photo-overlay');overlay.hidden=true;const viewport=el('div',undefined,'photo-overlay-viewport'),overlayCanvas=el('canvas');viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','翻訳画像。ピンチで拡大縮小、指や矢印キーで移動できます。');const loading=el('div',undefined,'photo-preview-loading'),loadingSpinner=el('span',undefined,'photo-preview-spinner'),loadingText=el('span'),previewRetry=el('button','再試行');
  loadingSpinner.append(localIcon('spinner'));loading.setAttribute('data-ui-ignore','');loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');loading.hidden=true;previewRetry.type='button';previewRetry.hidden=true;
  loading.append(loadingSpinner,loadingText,previewRetry);viewport.append(overlayCanvas,loading);overlayCanvas.setAttribute('aria-label','写真に重ねた翻訳');
  const settings=el('div',undefined,'photo-display-settings');const overlayMode=el('input');overlayMode.type='checkbox';overlayMode.checked=true;const overlayLabel=el('label','画像に訳を重ねる');overlayLabel.prepend(overlayMode);const zoom=el('input');zoom.type='range';zoom.min='1';zoom.max='6';zoom.step='.01';zoom.value='1';zoom.setAttribute('aria-label','翻訳画像の拡大');const zoomLabel=el('label','拡大');zoomLabel.append(zoom);const modes=el('div',undefined,'photo-preview-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','写真の表示');modes.setAttribute('data-ui-ignore','');
  const originalMode=el('button','原文'),translationMode=el('button','翻訳');originalMode.type=translationMode.type='button';
  function setMode(translated){overlayMode.checked=translated;originalMode.setAttribute('aria-pressed',String(!translated));translationMode.setAttribute('aria-pressed',String(translated));paintOverlay();}
  originalMode.onclick=()=>setMode(false);translationMode.onclick=()=>setMode(true);originalMode.setAttribute('aria-pressed','false');translationMode.setAttribute('aria-pressed','true');modes.append(originalMode,translationMode);settings.append(zoomLabel);const overlayNote=el('p',undefined,'photo-help');overlayNote.hidden=true;const previewDialog=el('dialog',undefined,'photo-preview-dialog');previewDialog.setAttribute('aria-label','画像プレビュー');
  const previewHeader=el('header',undefined,'photo-preview-heading'),previewTitle=el('h2','プレビュー'),previewClose=el('button','×','photo-preview-close');
  previewTitle.tabIndex=-1;previewTitle.autofocus=true;previewClose.type='button';previewClose.setAttribute('aria-label','プレビューを閉じる');previewClose.replaceChildren(localIcon('xmark'));previewHeader.append(previewTitle,previewClose);
  const fit=el('button');fit.type='button';fit.className='photo-fit';fit.setAttribute('aria-label','全体表示');fit.title='全体表示';fit.append(localIcon('expand'));fit.onclick=()=>overlayZoom.setScale(1);
  const plus=el('button','＋'),minus=el('button','−');plus.type=minus.type='button';plus.setAttribute('aria-label','拡大');plus.replaceChildren(localIcon('plus'));minus.setAttribute('aria-label','縮小');
  plus.onclick=()=>overlayZoom.setScale(overlayZoom.scale*1.25);minus.onclick=()=>overlayZoom.setScale(overlayZoom.scale/1.25);
  settings.replaceChildren(minus,zoom,plus,fit);
  previewHeader.prepend(modes);previewDialog.append(previewHeader,viewport,overlayNote,settings);document.body.append(previewDialog);
  const openPreview=el('button',undefined,'photo-open-preview photo-image-card'),thumbnail=el('canvas');openPreview.type='button';openPreview.setAttribute('aria-label','翻訳画像を開く');openPreview.append(thumbnail,el('span','翻訳画像を開く ↗'));overlay.append(openPreview);

  let previewReturn=null,readerScroll=0;
  function openImage(translated,trigger){
    if(!image)return;
    if(!previewDialog.open){previewReturn=trigger;readerScroll=root.closest('dialog').scrollTop;}
    setMode(translated);translationMode.disabled=!overlayData&&!busy;
    if(!previewDialog.open)previewDialog.showModal();
    fitPreviewDialog();paintOverlay();renderPreviewStatus();
  }
  previewViewport.onclick=()=>openImage(false,previewViewport);openPreview.onclick=()=>openImage(true,openPreview);
  previewClose.onclick=()=>previewDialog.close();
  previewDialog.addEventListener('close',()=>{notice.setAttribute('aria-live','polite');const host=root.closest('dialog');if(host?.open){host.scrollTop=readerScroll;previewReturn?.focus({preventScroll:true});}});
  overlayMode.onchange=paintOverlay;const overlayZoom=installPhotoZoom(viewport,overlayCanvas,{fitHeight:true,onChange:value=>{zoom.value=String(value);}});zoom.oninput=()=>overlayZoom.setScale(zoom.value);
  const changeLanguage=el('button','言語を変更','photo-change-language');changeLanguage.type='button';changeLanguage.hidden=true;changeLanguage.onclick=()=>{settingsOpen=!settingsOpen;buttons();if(settingsOpen)target.focus({preventScroll:true});};
  root.append(file,pick,selection,languageRow,translate,notice,overlay,changeLanguage,details);modal('写真を翻訳',root);
  let image=null,objectURL=null,busy=false,closed=false,epoch=0,controller=null,requestId=null,currentHash=null,ocrText='',ocrBlocks=[],overlayData=null,translationError='',settingsOpen=false;
  root.closest('dialog').addEventListener('close',()=>{closed=true;epoch++;overlayZoom.destroy();window.removeEventListener('resize',fitPreviewDialog);window.visualViewport?.removeEventListener('resize',fitPreviewDialog);if(previewDialog.open)previewDialog.close();previewDialog.remove();controller?.abort();for(const active of controllers)active.abort();if(objectURL)URL.revokeObjectURL(objectURL);image=null;preview.width=preview.height=overlayCanvas.width=overlayCanvas.height=1;},{once:true});
  function fitPreviewDialog(){
    if(!previewDialog.open||!preview.width||!preview.height)return;
    const availableWidth=window.visualViewport?.width||innerWidth,availableHeight=window.visualViewport?.height||innerHeight;
    previewDialog.style.setProperty('--photo-preview-width',availableWidth+'px');
    previewDialog.style.setProperty('--photo-preview-height',availableHeight+'px');
  }
  window.addEventListener('resize',fitPreviewDialog);window.visualViewport?.addEventListener('resize',fitPreviewDialog);
  function renderPreviewStatus(){
    const working=busy&&Boolean(image);
    loading.hidden=!working&&!translationError;loadingSpinner.hidden=!working;previewRetry.hidden=working||!translationError;
    loadingText.textContent=working?(notice.textContent||'翻訳を準備しています…'):translationError;
    previewDialog.setAttribute('aria-busy',String(working));
  }
  previewRetry.onclick=()=>void translate.onclick();
  function say(value=''){notice.textContent=value;notice.hidden=!value;notice.setAttribute('aria-live',previewDialog.open?'off':'polite');renderPreviewStatus();}
  function buttons(){const hasResult=Boolean(overlayData);root.dataset.step=busy?'working':hasResult?'result':image?'ready':'select';
   if(image)(hasResult?overlay:selection).append(pick,remove);else root.insertBefore(pick,selection);
   pick.classList.toggle('photo-pick-compact',Boolean(image));pick.hidden=busy;selection.hidden=!image||hasResult;
   languageRow.hidden=!image||busy||(hasResult&&!settingsOpen);translate.hidden=!image||busy||(hasResult&&!translationError&&!settingsOpen);changeLanguage.hidden=!hasResult||busy;changeLanguage.textContent=settingsOpen?'言語選択を閉じる':'言語を変更';
   remove.disabled=busy;pick.disabled=busy;file.disabled=busy;translate.disabled=busy||!image;target.disabled=text.disabled=busy;translate.textContent=translationError?'残りの翻訳を続ける':'翻訳する';root.setAttribute('aria-busy',String(busy));renderPreviewStatus();}
  function clearTranslation(){settingsOpen=false;selection.append(remove);selection.hidden=!image;translationError='';overlayMode.checked=true;originalMode.setAttribute('aria-pressed','false');translationMode.setAttribute('aria-pressed','true');result.replaceChildren();overlay.hidden=true;overlayData=null;previewViewport.hidden=!image;say();}
  function paintOverlay(){if(!image)return;drawPhotoOverlay(overlayCanvas,preview,overlayMode.checked?(overlayData?.blocks||[]):[],overlayData?.translated||[],overlayData?.to||source.value);thumbnail.width=overlayCanvas.width;thumbnail.height=overlayCanvas.height;if(overlayData)drawPhotoOverlay(thumbnail,preview,overlayData.blocks,overlayData.translated,overlayData.to);else thumbnail.getContext('2d').drawImage(overlayCanvas,0,0);overlayCanvas.setAttribute('aria-label',overlayMode.checked?'写真に重ねた翻訳':'原文の写真');overlayNote.textContent='';overlayNote.hidden=true;fitPreviewDialog();overlayZoom.refresh();}
  text.oninput=()=>{clearTranslation();buttons();};target.onchange=()=>{clearTranslation();if(image&&text.value.trim()&&!busy)void translate.onclick();};
  remove.onclick=()=>{if(busy)return;epoch++;image=null;source.value='auto';file.value='';text.value='';ocrText='';ocrBlocks=[];requestId=currentHash=null;details.hidden=true;details.open=false;pick.textContent='写真を選択';pick.removeAttribute('title');if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}preview.width=preview.height=1;clearTranslation();buttons();pick.focus({preventScroll:true});};
  file.onchange=async()=>{
   const selected=file.files?.[0];if(!selected)return;const version=++epoch;busy=true;source.value='auto';image=null;buttons();text.value='';ocrText='';ocrBlocks=[];details.hidden=true;details.open=false;clearTranslation();requestId=currentHash=null;say('写真を準備しています…');
   try{if(selected.size>15000000)throw Error('15MB以内の写真を選んでください。');if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(selected);const next=new Image();next.src=objectURL;await next.decode();if(closed||version!==epoch)return;if(next.naturalWidth*next.naturalHeight>50000000)throw Error('画像が大きすぎます。小さくして選び直してください。');image=next;const scale=Math.min(1,1800/Math.max(next.naturalWidth,next.naturalHeight));preview.width=Math.round(next.naturalWidth*scale);preview.height=Math.round(next.naturalHeight*scale);const ctx=preview.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,preview.width,preview.height);ctx.drawImage(image,0,0,preview.width,preview.height);previewViewport.hidden=false;overlayZoom.reset();pick.textContent='写真を変更';pick.title=selected.name;say();}
   catch(e){if(!closed&&version===epoch)say('写真を開けませんでした。'+(e.message&&/[ぁ-んァ-ヶ一-龠]/.test(e.message)?e.message:'JPEG・PNG形式の画像を選び直してください。'));}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
  const controllers=new Set();
  async function bounded(operation){const active=new AbortController();controllers.add(active);controller=active;let timer;try{return await Promise.race([operation(active.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{active.abort();reject(Object.assign(Error('翻訳に時間がかかっています。'),{name:'TimeoutError'}));},22000);})]);}finally{clearTimeout(timer);controllers.delete(active);}}
  async function readPhoto(){
   const base64=preview.toDataURL('image/jpeg',.9).split(',')[1];if(base64.length>2800000)throw Error('画像が大きすぎます。小さい画像を選んでください。');
   const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base64)));currentHash=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');let data=images.get(currentHash);
   if(!data){requestId||=crypto.randomUUID();data=photoReadResult(await bounded(signal=>api('/photo/recognize',{image:base64,id:requestId},{signal})));remember(images,currentHash,data);}
   if(closed)return;source.value=languages().some(l=>l.code===data.sourceLanguage)?data.sourceLanguage:'auto';text.value=data.text;ocrText=data.text;ocrBlocks=data.blocks||[];details.hidden=!data.text;
   if(!data.text)throw Error('文字が見つかりませんでした。写真を選び直してください。');if(data.truncated){details.open=true;throw Error('文字が多いため一部だけ読み取りました。原文を確認し、訳す部分を選択してください。');}
  }
  translate.onclick=async()=>{
   if(busy||!image)return;const resuming=Boolean(translationError);translationError='';busy=true;buttons();if(!resuming)clearTranslation();const version=epoch;openImage(true,translate);
   try{
    if(!text.value.trim()){say('文字を読み取っています…');await readPhoto();}if(closed||version!==epoch)return;
    let original;try{original=photoTranslationText(text.value,text.selectionStart,text.selectionEnd);}catch(e){details.hidden=false;details.open=true;throw e;}
    const from=source.value,to=target.value,blocks=matchingPhotoBlocks(original,ocrText,ocrBlocks),inputBlocks=blocks||[{id:'b0',text:original}],key=JSON.stringify([original,from,to,inputBlocks.map(b=>b.text)]);
    function show(data){
     result.querySelector('[data-stop]:not([hidden])')?.click();result.replaceChildren();const incomplete=data.blocks.length<inputBlocks.length||data.blocks.some(b=>b.partial);
     if(data.blocks.length){translationMode.disabled=false;overlayData={blocks:blocks||[],translated:data.blocks,to};overlay.hidden=false;overlay.append(remove);selection.hidden=true;previewViewport.hidden=true;paintOverlay();if(!blocks){overlayNote.textContent='文字の位置を対応づけられなかったため原文画像を表示しています。訳文は下の「原文・訳文を見る」で確認できます。';overlayNote.hidden=false;}details.open=!blocks;}else details.open=true;
     const translated=data.blocks.map(b=>b.translations[to]).join('\n\n');
     const tabs=el('div',undefined,'photo-text-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','原文と訳文');result.append(tabs);const views=[];
     for(const [kind,label,code,value] of [['original','原文',from,original],['translated','訳文',to,translated]]){
      const tab=el('button',label),section=el('section',undefined,'reference-language photo-text-panel'),paragraph=el('p',value,'reference-language-text');
      tab.type='button';tab.setAttribute('role','tab');tab.id='photo-text-tab-'+kind;tab.setAttribute('aria-controls','photo-text-panel-'+kind);section.id='photo-text-panel-'+kind;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',tab.id);paragraph.lang=code==='auto'?'':code==='ja-easy'?'ja':code;paragraph.dir='auto';
      if(code!=='auto'){const playback=speechControls(value,code,'photo:'+crypto.randomUUID()+':'+kind);playback.classList.add('photo-text-playback');section.append(playback);}
      section.append(paragraph);tabs.append(tab);result.append(section);views.push({kind,tab,section});
     }
     function selectView(kind,focus=false){textView=kind;for(const view of views){const selected=view.kind===kind;if(!selected&&!view.section.hidden){const stop=view.section.querySelector('[data-stop]:not([hidden])');stop?.click();}view.section.hidden=!selected;view.tab.setAttribute('aria-selected',String(selected));view.tab.tabIndex=selected?0:-1;if(selected&&focus)view.tab.focus();}}
     for(const view of views){view.tab.onclick=()=>selectView(view.kind);view.tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectView(event.key==='Home'?'original':event.key==='End'?'translated':view.kind==='original'?'translated':'original',true);}};}
     selectView(textView);if(incomplete)result.append(el('p','翻訳途中です。まだ訳されていない部分があります。','photo-help'));
     details.hidden=false;buttons();updateSpeechControls();
    }
    say('翻訳しています…');let data=translations.get(key);if(data)data={...data,reuse:{...data.reuse,reused:Math.max(1,data.reuse?.total||1)}};
    if(!data&&from===to){data={blocks:inputBlocks.map(b=>({id:b.id,translations:{[from]:b.text},quality:{warnings:[]}}))};remember(translations,key,data);}
    if(!data){data=await translatePhotoProgressively({blocks:inputBlocks,source:from,target:to,cache:segments,valid:()=>!closed&&version===epoch,onResume:event=>say(event.split?'読み取り範囲を細かく分けて翻訳を続けています…':'接続を回復して、未完了の部分から翻訳を続けています…'),request:body=>bounded(signal=>api('/photo/translate',body,{signal})),onProgress:(partial,done,total)=>{show(partial);say('翻訳しています… '+done+' / '+total);}});remember(translations,key,data);}
    if(closed||version!==epoch)return;show(data);say(data.blocks.some(b=>b.quality?.warnings?.length)?'数字・日付など、訳の確認が必要な箇所があります。':data.reuse?.reused?'保存済みの翻訳を再利用しました。':'');
   }catch(e){if(!closed&&version===epoch){translationError=e.message||'翻訳できませんでした。';say(translationError+(result.childElementCount?' 完成した部分は残しています。':''));}}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
 };
}

export function photoUsageSection({api,el}){
 const section=el('section'),value=el('p','取得中…'),refresh=el('button','写真読取の利用回数を更新');section.append(el('h3','写真の文字読取'),value,refresh,el('p','写真読取の回数制限はありません。送信後の失敗も集計します。Googleの無料枠・請求額を直接取得した値ではありません。'));
 refresh.onclick=async()=>{refresh.disabled=true;try{const data=await api('/photo/status');value.textContent=(data.enabled?'利用可能':'未接続')+(data.blocked?'・サービス停止中':'')+'・'+data.month+'：全体 '+data.used+'回・この利用者 '+data.userUsed+'回・回数制限なし。';}catch{value.textContent='写真読取の利用状況を取得できませんでした。';}finally{refresh.disabled=false;}};void refresh.onclick();return section;
}
