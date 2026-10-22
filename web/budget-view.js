import {costOf,PRICES} from './usage.js?v=20261022-cost-accounting-1';
import {AI_LIMITS,SPEECH_POLICY,PHOTO_POLICY,COST_SOURCES,scenarioKey} from './cost-policy.js?v=20261022-cost-accounting-1';
// Forecast only measured, self-originated AI calls with the same source/targets.
// Cached captions, received room costs, partial dictionary reuse and legacy rows
// cannot establish the cost of a new full AI request.
export function budgetEstimates(rows,status,current=null){
 const out=[];
 for(const [mode,label] of [['face','通訳'],['interpreter','チャット'],['lesson','授業']]){
  const samples=rows.filter(s=>s.mode===mode).sort((a,b)=>b.startedAt-a.startedAt).flatMap(s=>(s.translationSamples||[]).slice().reverse().filter(t=>t.own===true&&t.measured===true&&t.success===true&&!t.cached&&t.fullAI===true&&t.targets?.length>0&&Number.isFinite(t.characters)&&t.characters>0&&Number.isFinite(t.inputTokens)&&t.inputTokens>=0&&Number.isFinite(t.outputTokens)&&t.outputTokens>=0).map(t=>({...t,price:s.priceSnapshot||PRICES})));
  const selected=current?.mode===mode?scenarioKey(current.source,current.targets):samples[0]?scenarioKey(samples[0].source,samples[0].targets):null;
  const matching=selected?samples.filter(t=>scenarioKey(t.source,t.targets)===selected).slice(0,50):[];
  const total=matching.reduce((n,t)=>n+costOf(t,t.price).translation,0);
  if(!matching.length||!(total>0)){out.push({mode,label,samples:0,current:current?.mode===mode});continue;}
  const perAttempt=total/matching.length,remaining=Math.max(0,Math.min(Math.floor(Math.max(0,status.availableUSD)/perAttempt),Math.max(0,status.user.callsRemaining)));
  out.push({mode,label,samples:matching.length,source:matching[0].source,targets:matching[0].targets,characters:Math.round(matching.reduce((n,t)=>n+t.characters,0)/matching.length),perAttempt,remaining,ten:Math.floor(remaining/10),fifty:Math.floor(remaining/50),current:current?.mode===mode});
 }
 return out;
}
export function createBudgetView({el,api,rows,exchange,getScenario=()=>null}){
 const box=el('section',undefined,'admin-budget'),content=el('div'),refresh=el('button','残量を更新');let latest=null;
 box.append(el('h3','本日のAI利用と設定上限'),content,refresh);
 function render(){
  if(!latest)return;const s=latest,fx=exchange(),yen=v=>'約'+(v*fx).toFixed(2)+'円',amount=v=>yen(v)+'（$'+v.toFixed(5)+'）';
  content.replaceChildren(el('p','残り使える額（アプリ内の設定）'),el('strong',amount(s.availableUSD),'admin-budget-remaining'),el('p','この認証IDの本日の利用：'+amount(s.user.usedUSD)),el('p','この認証IDの1日の設定上限：'+amount(s.user.limitUSD)),el('p','この認証IDの残り：'+amount(s.user.remainingUSD)+'・AI呼び出し残り '+s.user.callsRemaining+'回'),el('p',s.blocked?'AIサービス側の制限を検知したため、本日のAI処理は停止中です。':s.user.callsRemaining===0?'この認証IDの本日の呼び出し回数上限です。金額が残っていても追加のAI処理は開始できません。':'未使用なら設定上限がそのまま残ります。残り使える額は、全端末共通とこの認証IDの残額の少ない方です。'),el('h4','全端末共通の設定'),el('p','本日の利用：'+amount(s.global.usedUSD)),el('p','1日の設定上限：'+amount(s.global.limitUSD)+' / 残り：'+amount(s.global.remainingUSD)));
  const meter=el('progress');meter.max=1;meter.value=Math.max(0,Math.min(1,s.availableUSD/Math.min(s.global.limitUSD,s.user.limitUSD)));meter.setAttribute('aria-label','今日のAI予算の残り');content.append(meter,el('p','次のリセット：'+new Date(s.resetsAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'),el('h4','同じ使い方なら、あとどのくらい？'));
  const measuredRows=typeof rows==='function'?rows():rows;
  for(const e of budgetEstimates(measuredRows,s,getScenario()))content.append(el('p',e.samples?e.label+(e.current?'（現在の言語構成）':'（最近の言語構成）')+'：あと約'+e.remaining+'回のAI翻訳。あなたが10発言する会話なら約'+e.ten+'回、50発言なら約'+e.fifty+'回。原文 '+e.source+' → '+e.targets.join('・')+'（'+e.targets.length+'訳）、平均'+e.characters+'文字・1回 '+amount(e.perAttempt)+'。最近'+e.samples+'回の実測平均。':e.label+'：'+(e.current?'現在の言語構成に合う':'対応する')+'AI実績がまだありません。古い履歴から回数を推測しません。'));
  content.append(el('p','文数ではなく、あなたの発言で実際にAIを呼んだ回数から試算します。辞書・確認済み訳・受信した発言・費用未計測・一部だけ辞書を使った記録は試算に混ぜません。文章量や言語が変わると単価も変わります。修正・再試行は追加の呼び出しです。音声認識や写真翻訳も同じ日次AI予算を使うため、この回数は保証ではありません。','admin-hint'),el('p','チャットは最大5人。同じ言語の参加者が増えても人数で翻訳費用を掛けません。原文以外の異なる言語をまとめて訳し、英語も必要に応じて含めます。英語訳を非表示にするチェックは表示のみで、翻訳費用を減らしません。費用は発言元の認証IDへ計上し、全体では1回分です。授業も発言元の認証IDと全体予算を使います。','admin-hint'),el('p','AI翻訳の追加がない登録済み辞書の表示・再利用は日次AI予算を使いません。不足する訳の生成、写真の翻訳は使います。フィリピノ語の音声生成と写真の文字読取は別の月次上限です。画像への訳文の重ね描画は端末内の処理です。','admin-hint'),el('p','これはCloudflareの無料枠残高や請求額ではありません。「本日の利用」は処理中の予約と失敗時の確保分も含みます。予約が足りなければ残額があっても開始できません。共有された同じルームの履歴を複数端末で足し合わせないでください。現在のチャット・授業は音声通話を行わず、TURN費用は旧履歴だけです。外部音声サービス・サーバー保存等は別です。','admin-hint'),el('small','取得日時：'+new Date(s.asOf).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）・処理中 '+s.inFlight+'件。最新の設定残量は「残量を更新」で確認してください。'));
 }
 refresh.type='button';refresh.onclick=async()=>{refresh.disabled=true;content.replaceChildren(el('p','残量を確認しています…'));try{latest=await api('/usage/budget');render();}catch{latest=null;content.replaceChildren(el('p','残量を取得できませんでした。「残量を更新」で再試行してください。未取得を0円として表示しません。'));}finally{refresh.disabled=false;}};
 return {box,load:()=>refresh.onclick(),render};
}
export function monthlyCostNote(service,data,exchange){
 const fx=exchange(),money=usd=>'約'+(usd*fx).toFixed(2)+'円（$'+usd.toFixed(5)+'）';
 if(service==='speech')return '無料枠適用前の単価：100万文字 $'+SPEECH_POLICY.perMillionCharacters+'。今月の観測分 '+money(data.estimatedBeforeFreeUSD??data.usedCharacters*SPEECH_POLICY.perMillionCharacters/1e6)+'。無料枠を全く使えない場合、全体の設定上限までで '+money(data.limitCharacters*SPEECH_POLICY.perMillionCharacters/1e6)+'。公式料金表の無料枠は月'+SPEECH_POLICY.providerFreeCharacters.toLocaleString()+'文字ですが、他の利用との合算や実請求は未確認です。';
 return '文字読取の無料枠適用前の単価：1000回 $'+PHOTO_POLICY.perThousandRequests+'。今月の観測分 '+money(data.used*PHOTO_POLICY.perThousandRequests/1000)+'。無料枠を全く使えない場合、全体の設定上限までで '+money(data.limit*PHOTO_POLICY.perThousandRequests/1000)+'。公式料金表の無料枠は月'+PHOTO_POLICY.providerFreeRequests.toLocaleString()+'回。翻訳は別の日次AI予算を使います。';
}
export function budgetLimitNote(){return 'アプリ全体で1日 $'+AI_LIMITS.globalUSD+'、認証IDごとに $'+AI_LIMITS.userUSD+' または'+AI_LIMITS.userCalls+'回を上限にAI呼び出し前に予算を確保します。毎日、日本時間9時にリセットします。';}
export {COST_SOURCES};
export function createMonthlyBudgetView({service,el,api,exchange}){
 const speech=service==='speech',box=el('section',undefined,'admin-service-budget'),content=el('div'),refresh=el('button',speech?'読み上げ残量を更新':'写真読取の残量を更新');let latest=null;
 box.append(el('h3',speech?'フィリピノ語の音声生成（月次）':'写真の文字読取（月次）'),content,refresh);
 function render(){if(!latest)return;const d=latest;content.replaceChildren(el('p',(d.enabled?'利用可能':'未接続')+(d.blocked?'・サービス停止中':'')+'・'+d.month));if(speech){content.append(el('p','全体 '+d.usedCharacters.toLocaleString()+' / '+d.limitCharacters.toLocaleString()+'文字・残り '+d.remainingCharacters.toLocaleString()+'文字・音声生成 '+d.requests+'回'),el('p',Number.isFinite(d.userRemainingCharacters)?'この認証ID：残り '+d.userRemainingCharacters.toLocaleString()+' / '+d.userLimitCharacters.toLocaleString()+'文字。':'この認証IDの残量は未取得です。全体残量だけでは再生可能量を判断できません。'),el('p','同じ文章の音声は、この画面に残るキャッシュを再利用できる間だけ追加生成しません。容量による削除・再読込・別端末では再生成で文字数を使います。辞書も同じです。失敗時も請求の可能性がある文字数を残します。'));}else content.append(el('p','全体 '+d.used+' / '+d.limit+'回・残り '+d.remaining+'回。この認証ID：残り '+d.userRemaining+' / '+d.userLimit+'回。'),el('p','直近'+PHOTO_POLICY.rollingDays+'日間 '+d.rollingUsed+'回も全体上限に含めます。月初でも直近の利用状況により残量が制限されます。送信後の失敗も数えます。画像を選ぶだけ、同じ画面の読取結果の再利用、訳文の重ね描画では再読取しません。'));
 content.append(el('p',monthlyCostNote(service,d,exchange),'admin-hint'),el('p','全端末共通の集計です。会話履歴の費用合計には含めません。日次AI残額との合算や無料枠の残高表示ではありません。','admin-hint'));if(Number.isFinite(d.resetsAt))content.append(el('p','月の切替：'+new Date(d.resetsAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'));const link=el('a','公式料金表（確認 '+(speech?SPEECH_POLICY:PHOTO_POLICY).checkedAt+'）');link.href=COST_SOURCES[service];link.target='_blank';link.rel='noopener';content.append(link);}
 refresh.type='button';refresh.onclick=async()=>{refresh.disabled=true;content.replaceChildren(el('p','残量を確認しています…'));try{latest=await api(speech?'/speech/status':'/photo/status');render();}catch{latest=null;content.replaceChildren(el('p','利用状況を取得できませんでした。未取得を0円・残量なしとは表示しません。'));}finally{refresh.disabled=false;}};return {box,render,load:()=>refresh.onclick()};
}
