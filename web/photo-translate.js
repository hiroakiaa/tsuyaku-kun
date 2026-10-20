import {translatePhotoProgressively} from './photo-progress.js?v=20261020-photo-fast-1';
import {matchingPhotoBlocks,drawPhotoOverlay} from './photo-overlay.js?v=20261020-photo-overlay-2';
export function photoReadResult(value){
 if(!value||typeof value.text!=='string')throw Error('写真の読み取り結果を確認できませんでした。もう一度お試しください。');
 return {...value,blocks:Array.isArray(value.blocks)?value.blocks.filter(b=>b&&typeof b.id==='string'&&typeof b.text==='string'):[],truncated:value.truncated===true};
}
export function photoTranslationText(text,start=0,end=0){const selected=end>start?text.slice(start,end):text;const value=selected.trim();if(!value||value.length>1200)throw Error('訳す部分を選択するか、原文を1200文字以内に直してください。');return value;}
export function cropRect(width,height,crop){
 const [left,top,right,bottom]=crop.map(Number);if(![width,height,...crop].every(n=>Number.isFinite(Number(n)))||width<1||height<1||left<0||top<0||right>100||bottom>100||right-left<5||bottom-top<5)throw Error('読取範囲を広げてください。');
 return {x:Math.round(width*left/100),y:Math.round(height*top/100),width:Math.max(1,Math.round(width*(right-left)/100)),height:Math.max(1,Math.round(height*(bottom-top)/100))};
}
export function installPhotoTranslate({button,api,modal,el,languages,viewLanguage,speechControls,updateSpeechControls}){
 const images=new Map(),translations=new Map(),segments=new Map();
 const remember=(map,key,value)=>{map.delete(key);map.set(key,value);while(map.size>24)map.delete(map.keys().next().value);};
 button.onclick=()=>{
  const root=el('div',undefined,'photo-translate photo-simple'),file=el('input'),pick=el('button','画像を選ぶ');
  file.type='file';file.accept='image/*';file.hidden=true;file.setAttribute('aria-label','撮影した写真・画像を選ぶ');pick.type='button';pick.className='photo-pick';pick.onclick=()=>{file.value='';file.click();};
  const preview=el('canvas');preview.hidden=true;preview.className='photo-preview';preview.setAttribute('aria-label','選択した写真');
  const source=el('select'),target=el('select');for(const language of languages().filter(l=>l.code!=='ja-easy'))for(const select of [source,target]){const o=el('option',language.labelJa+(language.labelNative&&language.labelNative!==language.labelJa?' / '+language.labelNative:''));o.value=language.code;select.append(o);}source.value='ja';target.value=viewLanguage()==='ja-easy'?'ja':viewLanguage();
  const sourceLabel=el('label','原文の言語'),targetLabel=el('label','訳す言語');sourceLabel.append(source);targetLabel.append(target);const languageRow=el('div',undefined,'photo-languages');languageRow.append(sourceLabel,targetLabel);
  const translate=el('button','翻訳する');translate.type='button';translate.disabled=true;translate.title='選んだ画像をGoogleで読み取り、翻訳します';
  const notice=el('p',undefined,'photo-notice');notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const text=el('textarea');text.rows=5;text.maxLength=12000;text.setAttribute('aria-label','読み取った原文');const textLabel=el('label','原文を確認・修正');textLabel.append(text);
  const result=el('div',undefined,'photo-results'),details=el('details',undefined,'photo-text-details');details.hidden=true;details.append(el('summary','原文・訳文を見る'),textLabel,el('p','翻訳は1200文字まで。長い場合は、訳したい部分を選択してください。','photo-help'),result,el('p','写真はサーバーに保存しません。読取結果・訳はこのページを開いている間だけ再利用します。','photo-help'));
  const overlay=el('section',undefined,'photo-overlay');overlay.hidden=true;const viewport=el('div',undefined,'photo-overlay-viewport'),overlayCanvas=el('canvas');viewport.append(overlayCanvas);overlayCanvas.setAttribute('aria-label','写真に重ねた翻訳。全文は原文・訳文を見るで確認できます。');
  const settings=el('details',undefined,'photo-display-settings');settings.append(el('summary','表示設定'));const overlayMode=el('input');overlayMode.type='checkbox';overlayMode.checked=true;const overlayLabel=el('label','画像に訳を重ねる');overlayLabel.prepend(overlayMode);const zoom=el('input');zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='.5';zoom.value='1';zoom.setAttribute('aria-label','翻訳画像の拡大');const zoomLabel=el('label','拡大');zoomLabel.append(zoom);settings.append(overlayLabel,zoomLabel);const overlayNote=el('p',undefined,'photo-help');overlayNote.hidden=true;overlay.append(viewport,settings,overlayNote);overlayMode.onchange=paintOverlay;zoom.oninput=()=>{overlayCanvas.style.width=Number(zoom.value)*100+'%';};
  root.append(file,pick,preview,languageRow,translate,notice,overlay,details);modal('写真を翻訳',root);
  let image=null,objectURL=null,busy=false,closed=false,epoch=0,controller=null,requestId=null,currentHash=null,ocrText='',ocrBlocks=[],overlayData=null;
  root.closest('dialog').addEventListener('close',()=>{closed=true;epoch++;controller?.abort();for(const active of controllers)active.abort();if(objectURL)URL.revokeObjectURL(objectURL);image=null;preview.width=preview.height=overlayCanvas.width=overlayCanvas.height=1;},{once:true});
  function say(value=''){notice.textContent=value;notice.hidden=!value;}
  function buttons(){pick.disabled=busy;file.disabled=busy;translate.disabled=busy||!image;source.disabled=target.disabled=text.disabled=busy;translate.textContent=busy?'翻訳しています…':'翻訳する';root.setAttribute('aria-busy',String(busy));}
  function clearTranslation(){result.replaceChildren();overlay.hidden=true;overlayData=null;preview.hidden=!image;say();}
  function paintOverlay(){if(!overlayData)return;const painted=drawPhotoOverlay(overlayCanvas,preview,overlayMode.checked?overlayData.blocks:[],overlayData.translated,overlayData.to);overlayCanvas.setAttribute('aria-label',overlayMode.checked?'写真に重ねた翻訳。全文は原文・訳文を見るで確認できます。':'原文の写真');overlayNote.textContent=overlayMode.checked&&painted.clipped?'入りきらない訳は「…」で表示しています。全文は「原文・訳文を見る」で確認できます。':'';overlayNote.hidden=!overlayNote.textContent;}
  text.oninput=()=>{clearTranslation();buttons();};source.onchange=target.onchange=clearTranslation;
  file.onchange=async()=>{
   const selected=file.files?.[0];if(!selected)return;const version=++epoch;busy=true;image=null;buttons();text.value='';ocrText='';ocrBlocks=[];details.hidden=true;details.open=false;clearTranslation();requestId=currentHash=null;say('写真を準備しています…');
   try{if(selected.size>15000000)throw Error('15MB以内の写真を選んでください。');if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(selected);const next=new Image();next.src=objectURL;await next.decode();if(closed||version!==epoch)return;if(next.naturalWidth*next.naturalHeight>50000000)throw Error('画像が大きすぎます。小さくして選び直してください。');image=next;const scale=Math.min(1,1800/Math.max(next.naturalWidth,next.naturalHeight));preview.width=Math.round(next.naturalWidth*scale);preview.height=Math.round(next.naturalHeight*scale);const ctx=preview.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,preview.width,preview.height);ctx.drawImage(image,0,0,preview.width,preview.height);preview.hidden=false;pick.textContent='画像を変更';pick.title=selected.name;say();}
   catch(e){if(!closed&&version===epoch)say('写真を開けませんでした。'+(e.message&&/[ぁ-んァ-ヶ一-龠]/.test(e.message)?e.message:'JPEG・PNG形式の画像を選び直してください。'));}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
  const controllers=new Set();
  async function bounded(operation){const active=new AbortController();controllers.add(active);controller=active;let timer;try{return await Promise.race([operation(active.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{active.abort();reject(Error('翻訳が時間内に完了しませんでした。表示済みの訳は残しています。もう一度押すと未完了の部分を再試行します。'));},22000);})]);}finally{clearTimeout(timer);controllers.delete(active);}}
  async function readPhoto(){
   const base64=preview.toDataURL('image/jpeg',.9).split(',')[1];if(base64.length>2800000)throw Error('画像が大きすぎます。小さい画像を選んでください。');
   const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base64)));currentHash=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');let data=images.get(currentHash);
   if(!data){requestId||=crypto.randomUUID();data=photoReadResult(await bounded(signal=>api('/photo/recognize',{image:base64,id:requestId},{signal})));remember(images,currentHash,data);}
   if(closed)return;text.value=data.text;ocrText=data.text;ocrBlocks=data.blocks||[];details.hidden=!data.text;
   if(!data.text)throw Error('文字が見つかりませんでした。写真を選び直してください。');if(data.truncated){details.open=true;throw Error('文字が多いため一部だけ読み取りました。原文を確認し、訳す部分を選択してください。');}
  }
  translate.onclick=async()=>{
   if(busy||!image)return;busy=true;buttons();clearTranslation();const version=epoch;
   try{
    if(!text.value.trim()){say('文字を読み取っています…');await readPhoto();}if(closed||version!==epoch)return;
    let original;try{original=photoTranslationText(text.value,text.selectionStart,text.selectionEnd);}catch(e){details.hidden=false;details.open=true;throw e;}
    const from=source.value,to=target.value,blocks=matchingPhotoBlocks(original,ocrText,ocrBlocks),inputBlocks=blocks||[{id:'b0',text:original}],key=JSON.stringify([original,from,to,inputBlocks.map(b=>b.text)]);
    function show(data){
     result.replaceChildren();const incomplete=data.blocks.length<inputBlocks.length||data.blocks.some(b=>b.partial);if(incomplete)result.append(el('p','翻訳途中です。まだ訳されていない部分があります。','photo-help'));
     if(blocks&&data.blocks.length){overlayData={blocks,translated:data.blocks,to};overlay.hidden=false;preview.hidden=true;paintOverlay();details.open=false;}else details.open=true;
     const translated=data.blocks.map(b=>b.translations[to]).join('\n\n');
     for(const [code,value] of from===to?[[from,original]]:[[from,original],[to,translated]]){if(!value)continue;const section=el('section',undefined,'reference-language'),name=languages().find(l=>l.code===code)?.labelJa||code;section.setAttribute('aria-label',name);const paragraph=el('p',value,'reference-language-text');paragraph.lang=code==='ja-easy'?'ja':code;section.append(el('h3',name),paragraph,speechControls(value,code,'photo:'+crypto.randomUUID()+':'+code));if(incomplete&&code===to)for(const button of section.querySelectorAll('[data-play]'))button.disabled=true;result.append(section);}
     details.hidden=false;updateSpeechControls();
    }
    say('翻訳しています…');let data=translations.get(key);
    if(!data&&from===to){data={blocks:inputBlocks.map(b=>({id:b.id,translations:{[from]:b.text},quality:{warnings:[]}}))};remember(translations,key,data);}
    if(!data){data=await translatePhotoProgressively({blocks:inputBlocks,source:from,target:to,cache:segments,valid:()=>!closed&&version===epoch,request:body=>bounded(signal=>api('/photo/translate',body,{signal})),onProgress:(partial,done,total)=>{show(partial);say('翻訳しています… '+done+' / '+total);}});remember(translations,key,data);}
    if(closed||version!==epoch)return;show(data);say(data.blocks.some(b=>b.quality?.warnings?.length)?'数字・日付など、訳の確認が必要な箇所があります。':'');
   }catch(e){if(!closed&&version===epoch)say((e.message||'翻訳できませんでした。')+(result.childElementCount?' 完成した部分は残しています。もう一度押すと未完了の部分を再試行します。':''));}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
 };
}

export function photoUsageSection({api,el}){
 const section=el('section'),value=el('p','取得中…'),refresh=el('button','写真読取の残量を更新');section.append(el('h3','写真の文字読取'),value,refresh,el('p','全端末合計で月900回、認証IDごとに月100回。UTC月初（日本時間9時）に月の集計を更新します。月境界の集中利用を防ぐため直近32日間も900回で停止します。送信後の失敗も数えます。Googleの無料枠・請求額を直接取得した値ではありません。翻訳は既存のAI日次上限を共有します。'));
 refresh.onclick=async()=>{refresh.disabled=true;try{const data=await api('/photo/status');value.textContent=(data.enabled?'利用可能':'未接続')+(data.blocked?'・サービス停止中':'')+'・'+data.month+'：全体 '+data.used+' / '+data.limit+'回、残り '+data.remaining+'回。この認証IDは残り '+data.userRemaining+'回。';}catch{value.textContent='写真読取の利用状況を取得できませんでした。';}finally{refresh.disabled=false;}};void refresh.onclick();return section;
}
