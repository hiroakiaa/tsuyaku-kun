import {RECOGNITION_PRICE,TRANSLATION_PRICE,LIVE_TRANSLATION_USD_PER_MINUTE} from './cost-policy.js';
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
  content.replaceChildren(table,el('p',description,'admin-caption'),el('p','マイクON時間で比較。通常は発話が半分、AI翻訳は1分4回（各入力250・出力25トークン）を仮定。1ドル＝'+rate+'円。変動費の試算で、固定費・再試行・写真・読み上げは含みません。','admin-caption'));
 }
 render();
 return {box,render};
}
