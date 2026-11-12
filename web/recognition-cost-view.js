import {RECOGNITION_PRICE,TRANSLATION_PRICE,AZURE_F0_POLICY,LIVE_TRANSLATION_USD_PER_MINUTE} from './cost-policy.js';
export function recognitionComparison(rate=150){return {realtime:10*RECOGNITION_PRICE.streamPerMinute*rate,batch:10*RECOGNITION_PRICE.whisperPerMinute*rate,translation: .0001599/53*600*rate,previous:(16.8*RECOGNITION_PRICE.whisperPerMinute/60+.0002188)/73.845*600*rate};}

export function createRecognitionCostView({el,exchange}){
 const box=el('section',undefined,'admin-recognition-cost');
 const choices=el('div',undefined,'admin-tabs');
 choices.setAttribute('role','group');
 choices.setAttribute('aria-label','試算する翻訳方式');
 const content=el('div');
 const translationPerMinute=4*(250*TRANSLATION_PRICE.inputPerMillion+25*TRANSLATION_PRICE.outputPerMillion)/1e6;
 const segmented=RECOGNITION_PRICE.whisperPerMinute/2;
 const modes=[
  ['通常',segmented,segmented+translationPerMinute,'発話区間を送信。翻訳はAzure F0・辞書利用時の追加費用0円から、AI翻訳を使う場合まで。'],
  ['速さ優先',RECOGNITION_PRICE.streamPerMinute,RECOGNITION_PRICE.streamPerMinute+translationPerMinute,'リアルタイム認識では無音を含む接続時間で計算。高速区間認識に切り替わる言語では、音声認識の単価は通常と同じです。'],
  ['OpenAI Live',LIVE_TRANSLATION_USD_PER_MINUTE,LIVE_TRANSLATION_USD_PER_MINUTE*2,'1言語への翻訳から、対面の日英双方向（2接続）までの幅です。45分は接続時間の合計で試算しています。'],
 ];
 let selected=0;
 const buttons=modes.map(([label],index)=>{
  const button=el('button',label);
  button.type='button';
  button.onclick=()=>{selected=index;render();};
  return button;
 });
 choices.append(...buttons);
 box.append(el('h3','モード別の料金目安'),choices,content);
 function render(){
  buttons.forEach((button,index)=>button.setAttribute('aria-pressed',String(selected===index)));
  const [,low,high,description]=modes[selected],rate=exchange();
  const format=(a,b,digits)=>[a,b].map(n=>n.toFixed(digits)).filter((n,i,all)=>i===0||n!==all[0]).join('〜');
  const table=el('table',undefined,'admin-cost-table'),body=el('tbody');
  for(const [label,minutes] of [['1会話（5分）',5],['1分',1],['45分',45]]){
   const row=el('tr'),title=el('th',label);
   title.scope='row';
   row.append(title,el('td','$'+format(low*minutes,high*minutes,6)+' ／ 約'+format(low*minutes*rate,high*minutes*rate,2)+'円'));
   body.append(row);
  }
  table.append(body);
  const detail=el('details',undefined,'admin-detail');
  detail.open=content.querySelector('details')?.open??false;
  const perMinute=usd=>usd.toFixed(6)+' USD／約'+(usd*rate).toFixed(3)+'円';
  detail.append(el('summary','費用の内訳と無料枠'));
  if(selected===2){
   detail.append(el('p','音声認識・翻訳・字幕生成はOpenAIの音声時間単価に含まれます。音声1分・1接続 '+perMinute(LIVE_TRANSLATION_USD_PER_MINUTE)+'。日英双方向の対面モードは同じ音声を2接続に送ります。'),
    el('p','マイクから送信される無音も試算に含みます。対象組織にAPIクレジットがあれば利用額に充当されます。実残高と請求額はOpenAIで確認できます。'));
  }else{
   detail.append(el('p','短区間の音声認識（Cloudflare Whisper） 音声1分 '+perMinute(RECOGNITION_PRICE.whisperPerMinute)+'。発話を半分としたマイクON1分では '+perMinute(segmented)+'。'));
   if(selected===1)detail.append(el('p','連続音声認識（Cloudflare Nova-3 WebSocket） 無音を含む音声1分 '+perMinute(RECOGNITION_PRICE.streamPerMinute)+'。高速区間認識を使う場合の45分は '+perMinute(segmented*45)+'（音声認識のみ）。'));
   detail.append(el('p','翻訳は辞書・保存済み訳を再利用できれば追加のモデル費用は0円。通常モードのAzure Translator F0は接続済み・対象言語・無料枠内で0円（提供元は月'+AZURE_F0_POLICY.providerMonthCharacters.toLocaleString('ja-JP')+'文字。アプリ内の上限は別途表示）。'),
    el('p','Cloudflare Gemmaを使う翻訳は100万トークンあたり入力 '+TRANSLATION_PRICE.inputPerMillion+' USD、出力 '+TRANSLATION_PRICE.outputPerMillion+' USD。この試算条件で1分に約 '+perMinute(translationPerMinute)+'を加算します。文章量や訳先で変動します。'),
    el('p','Cloudflare Workers AIの無料枠はアカウント内で共有されます。表の認識・Gemma費用は無料枠適用前です。'));
  }
  detail.append(el('p','別計上の項目はWorkers・Durable Objectsの通信や保存、Firebase、写真の文字読取、クラウド読み上げ、他の端末で個別に開始した音声処理です。管理者画面の今月の費用・請求データで取得できた分を確認できます。'));
  const sources=selected===2
   ? [['OpenAI Live翻訳の単価','https://developers.openai.com/api/docs/models/gpt-realtime-translate']]
   : [['Cloudflare Workers AI料金','https://developers.cloudflare.com/workers-ai/platform/pricing/'],['Azure Translator料金','https://azure.microsoft.com/en-us/pricing/details/translator/']];
  for(const [label,url]of sources){
   const link=el('a',label);
   link.href=url;
   link.target='_blank';
   link.rel='noopener';
   const paragraph=el('p');
   paragraph.append(link);
   detail.append(paragraph);
  }
  const market=el('details',undefined,'admin-detail');
  market.open=content.querySelector('[data-market]')?.open??true;
  market.dataset.market='';
  market.append(el('summary','有料翻訳サービスとの月額比較'));
  const yen=usd=>Math.round(usd*rate).toLocaleString('ja-JP')+'円';
  const minutes=100000/300;
  const rows=[
   ['DeepL Pro Individual','年払いの月額換算 $8.74／30万文字まで',yen(8.74),'https://www.deepl.com/ja/pro'],
   ['DeepL Pro Team','年払いの月額換算 $28.74／100万文字まで（1人）',yen(28.74),'https://www.deepl.com/ja/pro'],
   ['iTranslate PRO','月額2,000〜2,100円／文字枠の掲載なし','2,000〜2,100円','https://apps.apple.com/jp/app/id288113403'],
   ['Google Cloud Translation NMT','$20／100万入力文字',yen(2),'https://cloud.google.com/products/translate/pricing'],
   ['Amazon Translate 標準テキスト','$15／100万入力文字',yen(1.5),'https://aws.amazon.com/translate/pricing/'],
   ...modes.map(([label,min,max],i)=>['通訳君 '+label,
    i===2?'$'+LIVE_TRANSLATION_USD_PER_MINUTE+'／送信音声1分・1接続':'音声時間＋必要に応じて翻訳トークン',
    [...new Set([yen(min*minutes),yen(max*minutes)])].join('〜')])
  ];
  const marketTable=el('table',undefined,'admin-cost-table');
  const head=el('thead'),heading=el('tr'),marketBody=el('tbody');
  for(const label of ['サービス','料金と対象量','月10万文字の目安']){
   const cell=el('th',label);
   cell.scope='col';
   heading.append(cell);
  }
  head.append(heading);
  for(const [label,unit,total,url] of rows){
   const row=el('tr'),name=el('th',url?undefined:label);
   name.scope='row';
   if(url){
    const link=el('a',label);
    link.href=url;
    name.append(link);
   }
   row.append(name,el('td',unit),el('td',total));
   marketBody.append(row);
  }
  marketTable.append(head,marketBody);
  market.append(marketTable,
   el('p','2026年11月12日確認。外部の定額プランは契約料金、APIは訳先1言語の無料枠適用前。Google NMTとAmazonには条件付きの無料枠があります。','admin-caption'),
   el('p','通訳君はマイクON1分あたり原文300文字、月10万文字で約333分と仮定した運用変動費。Liveは1〜2接続。話す速度、無音、言語、接続数で変動します。為替は管理者画面の設定を使用します。','admin-caption'));
  content.replaceChildren(table,detail,market,el('p',description,'admin-caption'),el('p','マイクON時間で比較。通常は発話が半分、AI翻訳は1分4回（各入力250・出力25トークン）を仮定。1ドル＝'+rate+'円。変動費の試算で、固定費・再試行・写真・読み上げは含みません。','admin-caption'));
 }
 render();
 return {box,render};
}
