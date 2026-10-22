import {config} from './config.js';
import {readGoogleBillingPreview,billingTotals,BILLING_READ_LIMITS} from './billing-data.js?v=20261022-free-billing-1';
async function connectOwner(){
 const [appSdk,authSdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js')]);
 const app=appSdk.getApps().find(a=>a.name==='billing-admin')||appSdk.initializeApp(config.firebase,'billing-admin'),auth=authSdk.getAuth(app);await authSdk.setPersistence(auth,authSdk.inMemoryPersistence);
 const provider=new authSdk.GoogleAuthProvider();provider.addScope('https://www.googleapis.com/auth/bigquery.readonly');provider.setCustomParameters({prompt:'select_account'});
 const result=await authSdk.signInWithPopup(auth,provider),accessToken=authSdk.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
 if(!accessToken){await authSdk.signOut(auth);throw Error('請求データの閲覧が許可されませんでした。');}
 return {accessToken,token:()=>result.user.getIdToken(),close:()=>authSdk.signOut(auth)};
}
export function createBillingView({el,connect=connectOwner,fetcher=fetch,now=()=>Date.now()}){
 const box=el('section',undefined,'admin-billing'),head=el('div',undefined,'admin-card-heading'),content=el('div'),login=el('button','Googleで請求額を確認'),refresh=el('button','更新','admin-refresh'),logout=el('button','確認を終了');
 head.append(el('h3','今月の請求データ'),refresh);box.append(head,content,login,logout);for(const button of [login,refresh,logout])button.type='button';logout.hidden=true;refresh.hidden=true;
 let owner=null,reports=[],epoch=0,busy=false,lastRead=null,lastMonth=null,expanded=false;
 const amount=(n,c)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:c,maximumFractionDigits:c==='JPY'?2:5}).format(n);
 function render(message=''){
  expanded=content.querySelector('details')?.open??expanded;content.replaceChildren();const month=new Date(now()).toISOString().slice(0,7),summary=billingTotals(reports,month);
  content.append(el('strong',summary.known?'取得できた請求額の小計：'+Object.entries(summary.totals).map(([c,n])=>amount(n,c)).join(' ＋ '):'請求データは未取得です。','admin-service-remaining'));
  content.append(el('p','全体の合計は未確定です。無料枠前の試算とは別の金額です。','admin-caption'));
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
  details.append(el('p','UTCの今月分です。Googleは対象プロジェクト、Cloudflareはアカウント共通の従量料金です。固定費・税・他アプリとの配分やGitHub・Workspace等は未取得です。'),el('p','無料のデータ閲覧だけを使用します。SQL照会や有料APIへの切替は行いません。Googleは最大5,000行・2MBを超えたら停止。更新はこの画面で原則24時間に1回です。閉じると認証と表示データを破棄します。'));
  content.append(details);login.hidden=!!owner;refresh.hidden=!owner;logout.hidden=!owner;
 }
 async function api(path){const token=await owner.token();const r=await fetcher(config.api+path,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(r.status===403?'このGoogleアカウントは請求管理者として登録されていません。':'請求接続を確認できませんでした。');return data;}
 async function load(){
  const month=new Date(now()).toISOString().slice(0,7);if(lastRead!==null&&lastMonth===month&&now()-lastRead<BILLING_READ_LIMITS.intervalMs){render('表示済みの取得結果を使用しています。');return;}
  lastRead=now();lastMonth=month;const serial=epoch;render('無料の読取APIで確認しています…');
  const access=await api('/billing/access');if(serial!==epoch)return;if(access.paidQueries!==false||access.readMethod!=='tabledata.list')throw Error('無料閲覧の設定を確認できないため停止しました。');
  const settled=await Promise.allSettled([readGoogleBillingPreview({...access,month,accessToken:owner.accessToken,fetcher,now:now()}),api('/billing/cloudflare')]);if(serial!==epoch)return;
  reports=settled.map((r,i)=>r.status==='fulfilled'?r.value:{provider:i?'cloudflare':'google',month,status:'error',message:r.reason?.message||'未取得'});render();
 }
 login.onclick=async()=>{if(busy)return;busy=true;login.disabled=true;const serial=++epoch;render('管理者本人を確認しています…');try{const connection=await connect();if(serial!==epoch){await connection.close();return;}owner=connection;await load();}catch(e){render(e?.code==='auth/popup-closed-by-user'?'確認を取り消しました。':e?.message||'確認できませんでした。');}finally{busy=false;login.disabled=false;}};
 refresh.onclick=async()=>{if(!owner||busy)return;busy=true;refresh.disabled=true;try{await load();}catch(e){render(e.message);}finally{busy=false;refresh.disabled=false;}};
 function close(){epoch++;reports=[];lastRead=null;lastMonth=null;const previous=owner;owner=null;if(previous)void previous.close();render();}
 logout.onclick=close;queueMicrotask(()=>document.querySelector('#modal')?.addEventListener('close',close,{once:true}));render();return {box,close};
}
