// Counts only: images and extracted text are never persisted here.
export const PHOTO_MONTH_LIMIT=900,PHOTO_USER_LIMIT=100;
const problem=(message,status=400)=>Object.assign(Error(message),{status});
export async function photoBudget(storage,data,now=Date.now()){
 return storage.transaction(async tx=>{
  const month=new Date(now).toISOString().slice(0,7),reset=new Date(month+'-01T00:00:00Z');reset.setUTCMonth(reset.getUTCMonth()+1);
  let state=await tx.get('photo-budget');const recent=(state?.recent||[]).filter(at=>at>now-32*86400000);
  if(state?.month!==month)state={month,used:0,users:{},leases:{},receipts:{},blocked:false};state.recent=recent;
  const uid=String(data.uid||'').slice(0,64),status=()=>({month,resetsAt:reset.getTime(),limit:PHOTO_MONTH_LIMIT,used:state.used,rollingUsed:recent.length,remaining:Math.max(0,Math.min(PHOTO_MONTH_LIMIT-state.used,PHOTO_MONTH_LIMIT-recent.length)),userLimit:PHOTO_USER_LIMIT,userUsed:state.users[uid]||0,userRemaining:Math.max(0,PHOTO_USER_LIMIT-(state.users[uid]||0)),blocked:state.blocked});
  if(data.action==='status')return status();
  for(const [id,l]of Object.entries(state.leases))if(l.expires<=now)delete state.leases[id];
  if(data.action==='reserve'){
   if(!/^[a-f0-9]{32}$/.test(uid)||!/^[-a-zA-Z0-9]{16,64}$/.test(data.id||''))throw problem('読取データを確認してください。');
   const id=uid+':'+data.id;if(state.receipts[id])throw problem('この読取は送信済みです。結果が表示されない場合は画像を選び直してください。',409);
   if(state.blocked||state.used>=PHOTO_MONTH_LIMIT||recent.length>=PHOTO_MONTH_LIMIT||(state.users[uid]||0)>=PHOTO_USER_LIMIT)throw problem('写真読取の利用上限に達しました。保存中の結果は引き続き使えます。月初でも直近32日間の上限が残る場合があります。',429);
   const leases=Object.values(state.leases);if(leases.length>=4||leases.some(l=>l.uid===uid))throw problem('写真を読み取り中です。少し待ってください。',429);
   state.used++;recent.push(now);state.users[uid]=(state.users[uid]||0)+1;state.receipts[id]=true;state.leases[id]={uid,expires:now+45000};await tx.put('photo-budget',state);return {id,...status()};
  }
  if(data.action==='release'){delete state.leases[data.id];await tx.put('photo-budget',state);return status();}
  if(data.action==='block'){state.blocked=true;await tx.put('photo-budget',state);return status();}
  throw problem('読取操作を確認してください。');
 });
}
export async function photoUid(uid){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);}
export async function photoOperation(env,data){
 const stub=env.ROOMS.get(env.ROOMS.idFromName('__photo_budget_v1__'));
 const r=await stub.fetch(new Request('https://photo/photo-budget',{method:'POST',body:JSON.stringify(data)})),j=await r.json();if(!r.ok)throw problem(j.error||'写真を読み取れませんでした。',r.status);return j;
}
export function photoInput(data){
 const image=data.image;if(typeof image!=='string'||image.length<100||image.length>2800000||image.length%4||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image))throw problem('2MB以内のJPEG画像を選んでください。');
 if(!/^[-a-zA-Z0-9]{16,64}$/.test(data.id||''))throw problem('読取データを確認してください。');return image;
}
export async function recognizePhoto(env,data,fetcher=fetch){
 const image=photoInput(data);if(!env.GOOGLE_VISION_API_KEY)throw problem('写真の読取は接続準備中です。',503);
 const uid=await photoUid(env.budgetUid),reservation=await photoOperation(env,{action:'reserve',uid,id:data.id});
 try{
  const r=await fetcher('https://vision.googleapis.com/v1/images:annotate',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_VISION_API_KEY},body:JSON.stringify({requests:[{image:{content:image},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]}),signal:AbortSignal.timeout(15000)});
  if(!r.ok){if([401,403,429].includes(r.status))await photoOperation(env,{action:'block'});throw problem('写真の読取サービスを利用できません。管理者にお知らせください。',502);}
  const j=await r.json(),result=j.responses?.[0];if(!result||result.error){if([7,8,16].includes(result?.error?.code))await photoOperation(env,{action:'block'});throw problem('写真を読み取れませんでした。文字がはっきり写った写真を選んでください。',502);}
  const raw=result.fullTextAnnotation?.text||result.textAnnotations?.[0]?.description||'',text=String(raw).trim();
  return {text:text.slice(0,12000),truncated:text.length>12000,budget:{month:reservation.month,remaining:reservation.remaining,userRemaining:reservation.userRemaining}};
 }finally{await photoOperation(env,{action:'release',id:reservation.id}).catch(()=>{});}
}
