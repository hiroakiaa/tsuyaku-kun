import {SPEECH_POLICY,PHOTO_POLICY} from './cost-policy.js?v=20261022-cost-accounting-1';
const usable=(r,month,value)=>r?.month===month&&Number.isFinite(value)&&value>=0;
export function serviceMonthSummary({ai,speech,photo},month){
 const rows=[
 {key:'ai',name:'Cloudflare AI',usd:usable(ai,month,ai?.estimatedBeforeFreeUSD)?ai.estimatedBeforeFreeUSD:null,note:ai?.partial?'一部期間の記録。翻訳・写真翻訳・音声認識の予約・失敗分も含む。':'翻訳・写真翻訳・音声認識。予約・失敗分も含む。'},
 {key:'speech',name:'Google 音声生成',usd:usable(speech,month,speech?.usedCharacters)?speech.usedCharacters*SPEECH_POLICY.perMillionCharacters/1e6:null,note:'フィリピノ語の生成文字数から算出。全端末共通。'},
 {key:'photo',name:'Google 写真読取',usd:usable(photo,month,photo?.used)?photo.used*PHOTO_POLICY.perThousandRequests/1000:null,note:'月の送信回数から算出。翻訳費用はCloudflare AI側。'},
 {key:'workers',name:'Cloudflare Workers・DO',usd:null,note:'サーバー実行・保存・通信・固定料金の請求は未取得。'},
 {key:'firebase',name:'Firebase Authentication',usd:null,note:'認証に利用。プロジェクトの請求データは未連携。'},
 {key:'firestore',name:'Cloud Firestore',usd:null,note:'この版のコードには直接の読書きなし。プロジェクト全体の請求は未取得。'},
 {key:'sheets',name:'Apps Script・Sheets',usd:null,note:'辞書や画面表記の連携。契約料金・利用量は未取得。'},
 {key:'hosting',name:'GitHub Pages・Actions',usd:null,note:'配信と公開処理。アカウントの請求データは未取得。'},
 {key:'legacy',name:'旧音声サービス・TURN',usd:null,note:'現在のチャット・授業は音声通話なし。今月の旧版利用分は未取得。'}
 ];const known=rows.filter(r=>r.usd!==null);return {month,rows,known:known.length,subtotalUSD:known.length?known.reduce((n,r)=>n+r.usd,0):null,complete:false};
}
export function createServiceMonthView({el,api,exchange}){
 const box=el('section',undefined,'admin-month-costs'),head=el('div',undefined,'admin-card-heading'),content=el('div'),refresh=el('button','更新','admin-refresh');let values=null,expanded=false,asOf=null;
 head.append(el('h3','今月の費用'),refresh);refresh.type='button';refresh.setAttribute('aria-label','今月の費用を更新');box.append(head,content);
 function render(){if(!values)return;expanded=content.querySelector('details')?.open??expanded;const month=new Date(asOf).toISOString().slice(0,7),s=serviceMonthSummary(values,month),amount=usd=>'約'+(usd*exchange()).toFixed(2)+'円（$'+usd.toFixed(5)+'）';content.replaceChildren(el('strong','合計は未確定','admin-service-remaining'),el('p',s.subtotalUSD===null?'計測分を取得できませんでした。':'計測分の目安：約'+(s.subtotalUSD*exchange()).toFixed(2)+'円','admin-month-subtotal'),el('p','無料枠前の目安・未取得分あり。請求額ではありません。','admin-caption'));
 const details=el('details',undefined,'admin-detail');details.open=expanded;details.append(el('summary','サービス別・集計範囲'),el('p',month.replace('-','年')+'月の記録です。'));
 const table=el('table',undefined,'admin-cost-table'),thead=el('thead'),heading=el('tr');heading.append(el('th','サービス'),el('th','今月の目安'));thead.append(heading);const tbody=el('tbody');for(const r of s.rows){const row=el('tr'),name=el('th',r.name),value=el('td');name.scope='row';value.append(el('strong',r.usd===null?'未取得':amount(r.usd)),el('small',r.note));row.append(name,value);tbody.append(row);}table.append(thead,tbody);details.append(table);
 if(values.ai?.month===month&&Number.isFinite(values.ai.coverageStart))details.append(el('p','AIの集計開始：'+new Date(values.ai.coverageStart).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'+(values.ai.partial?'。それ以前の今月分は復元できず、合計に含みません。':'。この月のアプリ内予算消費を集計。')));
 details.append(el('p','UTC月で集計します。日本時間の月初9時が境界です。'),el('p','同じルームを複数端末で合算しません。写真の翻訳はAIに含め、写真読取に重複計上しません。実請求には無料枠・契約・税・他アプリの利用などが影響します。Firebaseなど未取得の項目を0円として扱いません。'),el('p','総額を確定するには各サービスの請求データの連携が必要です。現在はアカウントの請求額を取得していません。'));
 const links=el('p');for(const [label,url]of [['Google Cloudの請求確認','https://console.cloud.google.com/billing'],['Firebaseの利用確認','https://console.firebase.google.com/'],['Cloudflareの請求確認','https://dash.cloudflare.com/'],['GitHubの請求確認','https://github.com/settings/billing']]){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener';links.append(a,el('br'));}details.append(links,el('small','取得日時：'+new Date(asOf).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'));content.append(details);
 }
 refresh.onclick=async()=>{expanded=content.querySelector('details')?.open??expanded;refresh.disabled=true;content.replaceChildren(el('p','今月の費用を確認しています…','admin-caption'));const settled=await Promise.allSettled(['/usage/monthly','/speech/status','/photo/status'].map(path=>api(path)));values=Object.fromEntries(['ai','speech','photo'].map((k,i)=>[k,settled[i].status==='fulfilled'?settled[i].value:null]));asOf=Date.now();render();refresh.disabled=false;};return {box,render,load:()=>refresh.onclick()};
}
