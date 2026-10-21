import {costOf,PRICES} from './usage.js?v=20261011-continuity-words-1';
export function budgetEstimates(rows,status){
 const out=[];
 for(const [mode,label] of [['face','通訳'],['interpreter','チャット'],['lesson','授業']]){
  const samples=rows.filter(s=>s.mode===mode&&s.attemptCount>0&&!s.unmeasuredCalls&&!s.estimatedTokenCalls&&s.inputTokens>0&&!(s.whisperSeconds>0)).sort((a,b)=>b.startedAt-a.startedAt).slice(0,20);
  const attempts=samples.reduce((n,s)=>n+s.attemptCount,0),cost=samples.reduce((n,s)=>n+costOf(s,s.priceSnapshot||PRICES).translation,0);
  if(!attempts||!(cost>0)){out.push({mode,label,samples:0});continue;}
  const perAttempt=cost/attempts,remaining=Math.max(0,Math.min(Math.floor(status.availableUSD/perAttempt),status.user.callsRemaining));
  out.push({mode,label,samples:attempts,perAttempt,remaining,ten:Math.floor(remaining/10),fifty:Math.floor(remaining/50)});
 }
 return out;
}
export function createBudgetView({el,api,rows,exchange}){
 const box=el('section',undefined,'admin-budget'),content=el('div'),refresh=el('button','残量を更新');let latest=null;
 box.append(el('h3','本日のAI利用と設定上限'),content,refresh);
 function render(){
  if(!latest)return;const s=latest,fx=exchange(),yen=v=>'約'+(v*fx).toFixed(2)+'円',amount=v=>yen(v)+'（$'+v.toFixed(5)+'）';
  content.replaceChildren(el('p','残り使える額（アプリ内の設定）'),el('strong',amount(s.availableUSD),'admin-budget-remaining'),el('p','この認証IDの本日の利用：'+amount(s.user.usedUSD)),el('p','この認証IDの1日の設定上限：'+amount(s.user.limitUSD)),el('p','この認証IDの残り：'+amount(s.user.remainingUSD)+'・AI呼び出し残り '+s.user.callsRemaining+'回'),el('p',s.blocked?'AIサービス側の制限を検知したため、本日のAI処理は停止中です。':'未使用なら設定上限がそのまま残ります。残り使える額は、全端末共通とこの認証IDの残額の少ない方です。'),el('h4','全端末共通の設定'),el('p','本日の利用：'+amount(s.global.usedUSD)),el('p','1日の設定上限：'+amount(s.global.limitUSD)+' / 残り：'+amount(s.global.remainingUSD)));
  const meter=el('progress');meter.max=1;meter.value=Math.max(0,Math.min(1,s.availableUSD/Math.min(s.global.limitUSD,s.user.limitUSD)));meter.setAttribute('aria-label','今日のAI予算の残り');content.append(meter,el('p','次のリセット：'+new Date(s.resetsAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'),el('h4','この使い方なら、あとどのくらい？'));
  for(const e of budgetEstimates(rows,s))content.append(el('p',e.samples?e.label+'：あと約'+e.remaining+'文。10文の会話なら約'+e.ten+'回、50文なら約'+e.fifty+'回（最近'+e.samples+'試行の平均）。':e.label+'：推定に必要な実績がありません。'));
  content.append(el('p','回数はAI翻訳のみの概算です。文章量・言語数・再試行・音声認識で変わります。呼び出し前に多めの予算を確保するため、表示残額があっても開始できない場合があります。辞書だけの利用はこのAI予算を消費しません。','admin-hint'),el('p','Cloudflareの無料枠残高や請求額ではありません。「本日の利用」は処理中の予約と失敗時の確保分も含む予算消費額です。実際の請求額ではありません。TURN・外部音声認識・サーバー保存等は別です。認証IDが変わると端末側の値も変わります。','admin-hint'),el('small','取得日時：'+new Date(s.asOf).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）・処理中 '+s.inFlight+'件。利用後の正確な設定残量は「残量を更新」で再確認してください。提供元の無料枠残高ではありません。'));
 }
 refresh.type='button';refresh.onclick=async()=>{refresh.disabled=true;content.replaceChildren(el('p','残量を確認しています…'));try{latest=await api('/usage/budget');render();}catch{latest=null;content.replaceChildren(el('p','残量を取得できませんでした。「残量を更新」で再試行してください。未取得を0円として表示しません。'));}finally{refresh.disabled=false;}};
 return {box,load:()=>refresh.onclick(),render};
}
