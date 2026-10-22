import {config} from './config.js';
import {billingTotals,billingRefreshInterval} from './billing-data.js?v=20261022-billing-auto-1';
async function connectOwner(){
 const [appSdk,authSdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js')]);
 const app=appSdk.getApps().find(a=>a.name==='billing-admin')||appSdk.initializeApp(config.firebase,'billing-admin'),auth=authSdk.getAuth(app);await authSdk.setPersistence(auth,authSdk.inMemoryPersistence);
 const provider=new authSdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
 const result=await authSdk.signInWithPopup(auth,provider);
 return {token:()=>result.user.getIdToken(),close:()=>authSdk.signOut(auth)};
}
export function createBillingView({el,connect=connectOwner,fetcher=fetch,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
 const box=el('section',undefined,'admin-billing'),head=el('div',undefined,'admin-card-heading'),content=el('div'),login=el('button','Googleで請求額を確認'),refresh=el('button','更新','admin-refresh'),logout=el('button','確認を終了');
 head.append(el('h3','今月の請求データ'),refresh);box.append(head,content,login,logout);for(const button of [login,refresh,logout])button.type='button';logout.hidden=true;refresh.hidden=true;
 let owner=null,reports=[],epoch=0,busy=false,lastRead=null,lastMonth=null,expanded=false,timer=null;
 const googleReport=()=>reports.find(r=>r.provider==='google'&&r.month===new Date(now()).toISOString().slice(0,7));
 function stopTimer(){if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(){stopTimer();if(!owner||!googleReport()?.retryable||googleReport()?.status!=='pending'||document.visibilityState==='hidden'||!box.isConnected)return;timer=setTimer(()=>{timer=null;if(!owner||document.visibilityState==='hidden'||!box.isConnected)return;if(busy){schedule();return;}void update();},Math.max(1000,(lastRead??now())+billingRefreshInterval(googleReport())-now()));}
 async function update(){if(!owner||busy)return;busy=true;refresh.disabled=true;try{await load();}catch(e){render(e.message);}finally{busy=false;refresh.disabled=false;schedule();}}
 function visibility(){if(document.visibilityState==='hidden')stopTimer();else if(owner)void update();}
 document.addEventListener('visibilitychange',visibility);
 const amount=(n,c)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:c,maximumFractionDigits:c==='JPY'?2:5}).format(n);
 function render(message=''){
  expanded=content.querySelector('details')?.open??expanded;content.replaceChildren();const month=new Date(now()).toISOString().slice(0,7),summary=billingTotals(reports,month);
  content.append(el('strong',summary.known?'取得できた請求額の小計：'+Object.entries(summary.totals).map(([c,n])=>amount(n,c)).join(' ＋ '):'請求データは未取得です。','admin-service-remaining'));
  content.append(el('p','全体の合計は未確定です。無料枠前の試算とは別の金額です。','admin-caption'));
  if(owner&&googleReport()?.retryable&&googleReport()?.status==='pending')content.append(el('p','Googleの準備中：画面を開いている間は15分ごとに自動確認します。','admin-caption'));
  if(message)content.append(el('p',message,'admin-caption'));
  login.title='管理者本人のGoogleアカウントで確認します。通常利用の認証やチャットには影響しません。';
  const details=el('details',undefined,'admin-detail');details.open=expanded;details.append(el('summary','サービス別・取得範囲'));
  for(const [key,name] of [['google','Firebase・Google Cloud'],['cloudflare','Cloudflare']]){
   const report=reports.find(r=>r.provider===key&&r.month===month);details.append(el('h4',name));
   if(report?.status==='ready'){
    const table=el('table',undefined,'admin-cost-table'),body=el('tbody');for(const row of report.rows){const tr=el('tr'),th=el('th',row.service);th.scope='row';tr.append(th,el('td',amount(row.amount,row.currency)));body.append(tr);}table.append(body);details.append(table,el('p',report.scope||''));
   }else details.append(el('p',report?.message||'未取得'));
   if(report?.status==='ready'&&report.message)details.append(el('p',report.message));
   if(report?.fetchedAt)details.append(el('small','取得：'+new Date(report.fetchedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
   if(report?.exportedAt)details.append(el('p','Googleのデータ更新：'+new Date(report.exportedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
  }
  details.append(el('p','UTCの今月分です。Googleは対象プロジェクト、Cloudflareはアカウント共通の従量料金です。固定費・税・他アプリとの配分やGitHub・Workspace等は未取得です。'),el('p','無料のデータ閲覧だけを使用します。SQL照会や有料APIへの切替は行いません。Googleは最大5,000行・2MBを超えたら停止。Googleのデータ準備中だけ15分ごとに自動確認し、取得後は原則24時間再利用します。画面を閉じるか非表示にすると自動確認を止めます。閉じると認証と表示データを破棄します。'));
  content.append(details);login.hidden=!!owner;refresh.hidden=!owner;logout.hidden=!owner;
 }
 async function api(path){const token=await owner.token();const r=await fetcher(config.api+path,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(r.status===403?'このGoogleアカウントは請求管理者として登録されていません。':'請求接続を確認できませんでした。');return data;}
 async function load(){
  const month=new Date(now()).toISOString().slice(0,7);if(lastRead!==null&&lastMonth===month&&now()-lastRead<billingRefreshInterval(googleReport())){render('表示済みの取得結果を使用しています。');return;}
  lastRead=now();lastMonth=month;const serial=epoch;render('無料の読取APIで確認しています…');
  const access=await api('/billing/access');if(serial!==epoch)return;if(access.paidQueries!==false||access.readMethod!=='tabledata.list')throw Error('無料閲覧の設定を確認できないため停止しました。');
  const settled=await Promise.allSettled([api('/billing/google'),api('/billing/cloudflare')]);if(serial!==epoch)return;
  reports=settled.map((r,i)=>r.status==='fulfilled'?r.value:{provider:i?'cloudflare':'google',month,status:'error',message:r.reason?.message||'未取得'});render();
 }
 login.onclick=async()=>{if(busy)return;busy=true;login.disabled=true;const serial=++epoch;render('管理者本人を確認しています…');try{const connection=await connect();if(serial!==epoch){await connection.close();return;}owner=connection;await load();}catch(e){render(e?.code==='auth/popup-closed-by-user'?'確認を取り消しました。':e?.message||'確認できませんでした。');}finally{busy=false;login.disabled=false;schedule();}};
 refresh.onclick=update;
 function close(){stopTimer();epoch++;reports=[];lastRead=null;lastMonth=null;const previous=owner;owner=null;if(previous)void previous.close();render();}
 logout.onclick=close;queueMicrotask(()=>document.querySelector('#modal')?.addEventListener('close',()=>{close();document.removeEventListener('visibilitychange',visibility);},{once:true}));render();return {box,close};
}
