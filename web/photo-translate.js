export function photoTranslationText(text,start=0,end=0){const selected=end>start?text.slice(start,end):text;const value=selected.trim();if(!value||value.length>1200)throw Error('訳す部分を選択するか、原文を1200文字以内に直してください。');return value;}
export function cropRect(width,height,crop){
 const [left,top,right,bottom]=crop.map(Number);if(![width,height,...crop].every(n=>Number.isFinite(Number(n)))||width<1||height<1||left<0||top<0||right>100||bottom>100||right-left<5||bottom-top<5)throw Error('読取範囲を広げてください。');
 return {x:Math.round(width*left/100),y:Math.round(height*top/100),width:Math.max(1,Math.round(width*(right-left)/100)),height:Math.max(1,Math.round(height*(bottom-top)/100))};
}
export function installPhotoTranslate({button,api,modal,el,languages,viewLanguage,speechControls,updateSpeechControls}){
 const images=new Map(),translations=new Map(); // Page-only cache; never persist photographs on shared devices.
 const remember=(map,key,value)=>{map.delete(key);map.set(key,value);while(map.size>24)map.delete(map.keys().next().value);};
 button.onclick=()=>{
  const root=el('div',undefined,'photo-translate'),help=el('p','写真の文字を読み取り、原文を確認してから訳します。','photo-help');
  const file=el('input');file.type='file';file.accept='image/*';file.setAttribute('aria-label','撮影した写真・画像を選ぶ');
  const preview=el('canvas');preview.hidden=true;preview.setAttribute('aria-label','Googleに送る範囲のプレビュー');
  const crop=el('details'),cropValues=[0,0,100,100],ranges=[];crop.hidden=true;crop.append(el('summary','読取範囲を絞る'));
  for(const [i,name]of ['左端','上端','右端','下端'].entries()){const input=el('input'),row=el('label',name);input.type='range';input.min='0';input.max='100';input.step='1';input.value=cropValues[i];input.setAttribute('aria-label',name+'（％）');const value=el('output',input.value+'%');input.oninput=()=>{cropValues[i]=Number(input.value);value.value=input.value+'%';try{draw();notice.textContent='範囲を変えました。「文字を読み取る」を押してください。';}catch(e){notice.textContent=e.message;}};row.append(input,value);crop.append(row);ranges.push(input);}
  const consent=el('input');consent.type='checkbox';const consentLabel=el('label','選んだ範囲の写真をGoogleへ送り、文字を読み取る');consentLabel.className='photo-consent';consentLabel.prepend(consent);
  const recognize=el('button','文字を読み取る');recognize.type='button';recognize.disabled=true;
  const notice=el('p','写真全体ではなく、必要な文字がはっきり写る範囲を選んでください。');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const textLabel=el('label','読み取った原文（確認・修正できます）'),text=el('textarea');text.rows=7;text.maxLength=12000;text.setAttribute('aria-label','読み取った原文');textLabel.append(text);textLabel.hidden=true;
  const source=el('select'),target=el('select');for(const language of languages().filter(l=>l.code!=='ja-easy')){for(const select of [source,target]){const o=el('option',language.labelJa+(language.labelNative&&language.labelNative!==language.labelJa?' / '+language.labelNative:''));o.value=language.code;select.append(o);}}source.value='ja';target.value=viewLanguage()==='ja-easy'?'ja':viewLanguage();
  const sourceLabel=el('label','原文の言語'),targetLabel=el('label','訳す言語');sourceLabel.append(source);targetLabel.append(target);const languageRow=el('div',undefined,'photo-languages');languageRow.append(sourceLabel,targetLabel);
  const translate=el('button','確認した原文を翻訳する');translate.type='button';translate.disabled=true;
  const count=el('p','1200文字まで。長い場合は、原文の訳したい部分を選択してから翻訳できます。','photo-help'),result=el('div',undefined,'photo-results');
  root.append(help,file,preview,crop,consentLabel,recognize,notice,textLabel,count,languageRow,translate,result,el('p','写真はサーバーに保存しません。読取結果・訳はこのページを開いている間だけ再利用します。ページを閉じる・再読み込みすると消えます。','photo-help'));
  modal('写真を翻訳',root);
  let image=null,objectURL=null,busy=false,closed=false,epoch=0,controller=null,requestId=null,currentHash=null;
  const dialog=root.closest('dialog');
  const close=()=>{closed=true;epoch++;controller?.abort();if(objectURL)URL.revokeObjectURL(objectURL);image=null;preview.width=preview.height=1;};dialog.addEventListener('close',close,{once:true});
  function buttons(){file.disabled=busy;consent.disabled=busy;ranges.forEach(r=>r.disabled=busy);recognize.disabled=busy||!image||!consent.checked;translate.disabled=busy||!text.value.trim();source.disabled=target.disabled=text.disabled=busy;root.setAttribute('aria-busy',String(busy));}
  function draw(){if(!image)return;const area=cropRect(image.naturalWidth,image.naturalHeight,cropValues),scale=Math.min(1,1800/Math.max(area.width,area.height));preview.width=Math.round(area.width*scale);preview.height=Math.round(area.height*scale);const ctx=preview.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,preview.width,preview.height);ctx.drawImage(image,area.x,area.y,area.width,area.height,0,0,preview.width,preview.height);currentHash=null;requestId=null;text.value='';textLabel.hidden=true;result.replaceChildren();buttons();}
  consent.onchange=buttons;text.oninput=()=>{result.replaceChildren();buttons();};
  file.onchange=async()=>{
   const selected=file.files?.[0];if(!selected)return;const version=++epoch;busy=true;buttons();text.value='';textLabel.hidden=true;result.replaceChildren();preview.hidden=true;crop.hidden=true;image=null;requestId=currentHash=null;notice.textContent='写真を準備しています…';
   try{if(selected.size>15000000)throw Error('15MB以内の写真を選んでください。');if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(selected);const next=new Image();next.src=objectURL;await next.decode();if(closed||version!==epoch)return;if(next.naturalWidth*next.naturalHeight>50000000)throw Error('画像が大きすぎます。小さくして選び直してください。');image=next;cropValues.splice(0,4,0,0,100,100);ranges.forEach((r,i)=>{r.value=cropValues[i];r.nextElementSibling.value=r.value+'%';});draw();preview.hidden=crop.hidden=false;notice.textContent='範囲と写りを確認し、写真の送信にチェックを入れてください。';}
   catch(e){if(!closed&&version===epoch)notice.textContent='写真を開けませんでした。'+(e.message||'JPEG・PNGの写真をお試しください。');}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
  async function bounded(operation){controller=new AbortController();let timer;try{return await Promise.race([operation(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('時間内に完了しませんでした。通信を確認してください。'));},22000);})]);}finally{clearTimeout(timer);}}
  recognize.onclick=async()=>{
   if(busy||!image||!consent.checked)return;busy=true;buttons();const version=epoch;notice.textContent='文字を読み取っています…';result.replaceChildren();
   try{
    const dataURL=preview.toDataURL('image/jpeg',.9),base64=dataURL.split(',')[1];if(base64.length>2800000)throw Error('画像が大きすぎます。読取範囲を絞ってください。');
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base64)));currentHash=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    let data=images.get(currentHash),cached=!!data;
    if(!data){requestId||=crypto.randomUUID();data=await bounded(signal=>api('/photo/recognize',{image:base64,id:requestId},{signal}));remember(images,currentHash,data);}
    if(closed||version!==epoch)return;text.value=data.text;textLabel.hidden=false;notice.textContent=!data.text?'文字が見つかりませんでした。写真を選び直してください。':(cached?'保存中の読取結果を使いました。':'読み取れました。')+(data.truncated?'長い原文のため、一部だけ表示しています。範囲を絞ってください。':'原文の数字・日付・名前を確認してから翻訳してください。');
   }catch(e){if(!closed&&version===epoch)notice.textContent=e.message||'文字を読み取れませんでした。';}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
  translate.onclick=async()=>{
   if(busy)return;let original;try{original=photoTranslationText(text.value,text.selectionStart,text.selectionEnd);}catch(e){notice.textContent=e.message;return;}
   busy=true;buttons();result.replaceChildren();notice.textContent='翻訳しています…';const version=epoch,from=source.value,to=target.value,targets=[...new Set(['ja',to,'en'])],key=JSON.stringify([original,from,targets]);
   try{
    let data=translations.get(key),cached=!!data;if(!data){data=await bounded(signal=>api('/translate',{text:original,source:from,targets,unit:'学校の配布物。原文の段落・箇条書き・数字・日付・否定を保ち、読めない箇所を推測で補わない。'},{signal}));remember(translations,key,data);}
    if(closed||version!==epoch)return;
    for(const code of [...new Set([from,...targets])]){const translated=code===from?original:data.translations?.[code];if(!translated)continue;const section=el('section',undefined,'reference-language'),name=languages().find(l=>l.code===code)?.labelJa||code;section.setAttribute('aria-label',name);section.append(el('h3',name),el('p',translated,'reference-language-text'),speechControls(translated,code,'photo:'+crypto.randomUUID()+':'+code));result.append(section);}
    notice.textContent=(cached?'保存中の訳を使いました。':'翻訳しました。')+(data.quality?.warnings?.length?'数字・日付など、訳の確認が必要な箇所があります。':'原文と訳を見比べて確認してください。');updateSpeechControls();
   }catch(e){if(!closed&&version===epoch)notice.textContent=e.message||'翻訳できませんでした。原文は残しています。';}
   finally{if(!closed&&version===epoch){busy=false;buttons();}}
  };
 };
}

export function photoUsageSection({api,el}){
 const section=el('section'),value=el('p','取得中…'),refresh=el('button','写真読取の残量を更新');section.append(el('h3','写真の文字読取'),value,refresh,el('p','全端末合計で月900回、認証IDごとに月100回。UTC月初（日本時間9時）に月の集計を更新します。月境界の集中利用を防ぐため直近32日間も900回で停止します。送信後の失敗も数えます。Googleの無料枠・請求額を直接取得した値ではありません。翻訳は既存のAI日次上限を共有します。'));
 refresh.onclick=async()=>{refresh.disabled=true;try{const data=await api('/photo/status');value.textContent=(data.enabled?'利用可能':'未接続')+(data.blocked?'・サービス停止中':'')+'・'+data.month+'：全体 '+data.used+' / '+data.limit+'回、残り '+data.remaining+'回。この認証IDは残り '+data.userRemaining+'回。';}catch{value.textContent='写真読取の利用状況を取得できませんでした。';}finally{refresh.disabled=false;}};void refresh.onclick();return section;
}
