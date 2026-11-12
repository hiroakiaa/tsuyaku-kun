import {RECOGNITION_PRICE,TRANSLATION_PRICE,AZURE_F0_POLICY,LIVE_TRANSLATION_USD_PER_MINUTE} from './cost-policy.js';
export function recognitionComparison(rate=150){return {realtime:10*RECOGNITION_PRICE.streamPerMinute*rate,batch:10*RECOGNITION_PRICE.whisperPerMinute*rate,translation: .0001599/53*600*rate,previous:(16.8*RECOGNITION_PRICE.whisperPerMinute/60+.0002188)/73.845*600*rate};}

// Public build 20261112-classroom-cost-1, measured with tools/measure-translation-display.mjs.
const displayMeasurements = [
 ['通常','5.64秒（3件）','3.33秒','3／3回'],
 ['速度','5.99秒（2件）','3.67秒','2／3回'],
 ['リアルタイム翻訳','1.77秒（6件）','2.28秒','3／6回'],
];

function createDisplayComparison(el) {
 const section=el('section');
 const table=el('table',undefined,'admin-cost-table');
 const head=el('thead'),heading=el('tr'),body=el('tbody');
 for(const title of ['モード','発話開始 → 最初の訳文','発話終了 → 内容がそろう','内容がそろった回数']){
  const cell=el('th',title);
  cell.scope='col';
  heading.append(cell);
 }
 head.append(heading);
 for(const [mode,first,complete,coverage] of displayMeasurements){
  const row=el('tr'),label=el('th',mode);
  label.scope='row';
  row.append(label,...[first,complete,coverage].map(value=>el('td',value)));
  body.append(row);
 }
 table.append(head,body);
 const scroll=el('div');
 scroll.style.overflowX='auto';
 scroll.append(table);
 section.append(el('h4','3モードの訳文表示速度（実測）'),scroll,
  el('p','公開版の対面モードで、日本語から英語へ同じ約2.3秒の録音を翻訳。同じPCのChrome・同じ回線で測定した中央値です。','admin-caption'),
  el('p','最初の訳文は画面に出た最初の英語（途中の断片を含む）。内容がそろう時刻は、受付が午後3時15分までという内容が画面にそろった時点です。発話の始まりと終わりは録音波形から推定しています。','admin-caption'),
  el('p','表示時間の中央値は、各時刻を観測できた回だけで計算しています。速度は1回で英訳を観測できず、リアルタイムは2回で意味が異なり、1回は観測終了時点で時刻表記が途中でした。測定した公開版は20261112-classroom-cost-1です。','admin-caption'));
 return section;
}

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
 let selected=0,monthlyCharacters=100000;
 const buttons=modes.map(([label],index)=>{
  const button=el('button',label);
  button.type='button';
  button.onclick=()=>{selected=index;render();};
  return button;
 });
 choices.append(...buttons);
 box.append(el('h3','モード別の料金目安'),content);
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
  const volumes=el('div',undefined,'admin-tabs');
  volumes.setAttribute('role','group');
  volumes.setAttribute('aria-label','月間の原文文字数');
  for(const amount of [100000,300000,1000000]){
   const button=el('button',amount.toLocaleString('ja-JP')+'文字');
   button.type='button';
   button.setAttribute('aria-pressed',String(amount===monthlyCharacters));
   button.onclick=()=>{monthlyCharacters=amount;render();content.querySelector('[data-market] button[aria-pressed="true"]').focus();};
   volumes.append(button);
  }
  market.append(volumes);
  const minutes=monthlyCharacters/300;
  const summaryPerMinute=(1500*TRANSLATION_PRICE.inputPerMillion+300*TRANSLATION_PRICE.outputPerMillion)/1e6;
  const monthlyPrice=(min,max)=>[...new Set([yen(min*minutes),yen(max*minutes)])].join('〜');

  const volume=monthlyCharacters/1e6;
  const time='約'+Math.round(minutes).toLocaleString('ja-JP')+'分';
  const rows=[
   ['DeepL Pro Individual','年払いの月額換算 $8.74／30万文字まで',monthlyCharacters<=300000?yen(8.74):'文字枠超過','—','https://www.deepl.com/ja/pro'],
   ['DeepL Pro Team','年払いの月額換算 $28.74／100万文字まで（1人）',yen(28.74),'—','https://www.deepl.com/ja/pro'],
   ['iTranslate PRO','月額2,000〜2,100円／文字枠の掲載なし','2,000〜2,100円','—','https://apps.apple.com/jp/app/id288113403'],
   ['Google Cloud Translation NMT','$20／100万入力文字',yen(20*volume),yen(20*Math.max(0,volume-.5)),'https://cloud.google.com/products/translate/pricing'],
   ['Amazon Translate 標準テキスト','$15／100万入力文字',yen(15*volume),'0円（対象期間内）','https://aws.amazon.com/translate/pricing/'],
   ...modes.map(([label,min,max],i)=>['通訳君 '+label,
    '$'+min.toFixed(6)+'〜'+max.toFixed(6)+'／マイクON 1分',
    monthlyPrice(min,max),
    i===2?'左記と同額（クレジット別）':'0円（全量が無料枠内の場合）',null,time,monthlyPrice(min+summaryPerMinute,max+summaryPerMinute)])
  ];
  const marketTable=el('table',undefined,'admin-cost-table');
  const head=el('thead'),heading=el('tr'),marketBody=el('tbody');
  for(const label of ['サービス','料金と対象量','月額・変動費','無料枠適用時','マイクON換算','Live要約込み']){
   const cell=el('th',label);
   cell.scope='col';
   heading.append(cell);
  }
  head.append(heading);
  for(const [label,unit,total,free,url,duration,withSummary] of rows){
   const row=el('tr'),name=el('th',url?undefined:label);
   name.scope='row';
   if(url){
    const link=el('a',label);
    link.href=url;
    name.append(link);
   }
   row.append(name,el('td',unit),el('td',total),el('td',free),el('td',duration??'—'),el('td',withSummary??'—'));
   marketBody.append(row);
  }
  marketTable.append(head,marketBody);
  const scroll=el('div');
  scroll.style.overflowX='auto';
  scroll.append(marketTable);
  market.append(scroll,
   el('p','Live要約込みは無料枠適用前の運用変動費です。1分ごとに入力1,500・出力300トークンを使う想定で、実際の字幕量と更新回数により変わります。','admin-caption'),
   el('p','2026年11月12日確認。外部の定額プランは契約料金、APIは訳先1言語の無料枠適用前。Google NMTは月50万文字相当、Amazonは対象アカウントで最初の12か月、月200万文字まで。枠を全量使える前提です。','admin-caption'),
   el('p','通訳君はマイクON1分あたり原文300文字、文字数÷300でマイクON時間を換算した運用変動費。通常・速度優先の0円はCloudflareの共有無料枠やAzure F0などで処理全量を賄える場合です。残枠や実際に無料で使える時間はアカウントの利用状況に依存します。Liveは1〜2接続。話す速度、無音、言語、接続数で変動します。為替は管理者画面の設定を使用します。','admin-caption'));
  const lesson=el('section');
  const classroom=el('section');
  const classroomTable=el('table',undefined,'admin-cost-table');
  const classroomHead=el('thead'),classroomHeading=el('tr'),classroomBody=el('tbody');
  for(const title of ['モード','1日（4コマ）','1週間（20コマ）','1か月（80コマ）']){
   const cell=el('th',title);
   cell.scope='col';
   classroomHeading.append(cell);
  }
  classroomHead.append(classroomHeading);
  const lessonTable=el('table',undefined,'admin-cost-table');
  const lessonHead=el('thead'),lessonHeading=el('tr'),lessonBody=el('tbody');
  for(const title of ['授業モード','字幕・翻訳／1回','Live要約／1回','合計／45分1回','合計／月20回']){
   const cell=el('th',title);
   cell.scope='col';
   lessonHeading.append(cell);
  }
  lessonHead.append(lessonHeading);
  const lessonYen=usd=>(usd*rate).toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})+'円';
  const summaryCost=summaryPerMinute*45;
  for(const [name,perMinute] of [
   ['通常',segmented],['速度',RECOGNITION_PRICE.streamPerMinute],['リアルタイム',LIVE_TRANSLATION_USD_PER_MINUTE],
  ]){
   const row=el('tr'),label=el('th',name);
   label.scope='row';
   const captionCost=perMinute*45;
   const total=captionCost+summaryCost;
   row.append(label,...[captionCost,summaryCost,total,total*20].map(cost=>el('td',lessonYen(cost))));
   lessonBody.append(row);
   const classroomRow=el('tr'),classroomLabel=el('th',name);
   classroomLabel.scope='row';
   classroomRow.append(classroomLabel,...[4,20,80].map(lessons=>el('td',lessonYen(total*lessons))));
   classroomBody.append(classroomRow);
  }
  classroomTable.append(classroomHead,classroomBody);
  const classroomScroll=el('div');
  classroomScroll.style.overflowX='auto';
  classroomScroll.append(classroomTable);
  classroom.append(el('h4','日本語教室1教室の運用費'),
   el('p','翻訳・Live要約込み。1コマ45分、週5日、月4週間で計算します。','admin-caption'),classroomScroll);
  lessonTable.append(lessonHead,lessonBody);
  const lessonScroll=el('div');
  lessonScroll.style.overflowX='auto';
  lessonScroll.append(lessonTable);
  lesson.append(el('h4','授業1コマの内訳と月20コマの費用'),lessonScroll,
   el('p','先生1人・訳先1言語・要約1端末の試算です。通常は45分のうち半分を音声送信、速度とリアルタイムは45分送信と仮定します。','admin-caption'),
   el('p','通常・速度の字幕翻訳はAzure F0の対応言語・無料枠内で0円とします。授業モードは有料のテキスト翻訳へ自動で切り替えません。リアルタイムは1接続の音声料金に翻訳が含まれます。','admin-caption'),
   el('p','Live要約は毎分1回、入力1,500・出力300トークンと仮定します。認識・要約は共有無料枠適用前です。複数の端末で要約を生成すると、その回数に応じて費用が増えます。固定費は含みません。','admin-caption'));
  const individual=el('section');
  individual.append(el('h4','マイク利用時間別の費用'),choices,table,detail,el('p',description,'admin-caption'),el('p','マイクON時間で比較。通常は発話が半分、AI翻訳は1分4回（各入力250・出力25トークン）を仮定。1ドル＝'+rate+'円。変動費の試算で、固定費・再試行・写真・読み上げは含みません。','admin-caption'));
  content.replaceChildren(classroom,lesson,createDisplayComparison(el),individual,market);
 }
 render();
 return {box,render};
}
