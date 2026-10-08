// Conservative app-local variable-cost budget, not Cloudflare account billing.
const DAY=86400000;
export function budgetError(reason='budget'){
 const e=Error(reason==='busy'?'処理が混み合っています。少し待ってください。':'本日のアプリ内AI利用上限に達しました。辞書の訳は引き続き使えます。');
 e.appBudget=true;e.aiReason=reason;e.code=reason==='busy'?3040:3036;return e;
}
export function reserveCost(model,input){
 if(model==='@cf/google/gemma-4-26b-a4b-it')return Math.ceil((new TextEncoder().encode(JSON.stringify(input.messages||[])).length*.1+Math.min(4096,input.max_completion_tokens||4096)*.3)*1.1);
 if(model==='@cf/openai/whisper-large-v3-turbo')return Math.ceil((input.audio?.length||0)*.75/32000/60*.000513*1e6*1.1);
 if(model==='@cf/openai/whisper')return Math.ceil((input.audio?.length||0)/32000/60*.0006*1e6*1.1);
 throw budgetError();
}
export async function budgetOperation(storage,data,now=Date.now()){
 return storage.transaction(async tx=>{
  const day=Math.floor(now/DAY);let state=await tx.get('budget');
  if(!state||state.day!==day)state={day,total:0,users:{},leases:{},blockedUntil:0};
  for(const [id,l]of Object.entries(state.leases))if(l.expires<=now)delete state.leases[id];
  if(data.action==='reserve'){
   const uid=String(data.uid||'unknown').slice(0,128),cost=data.cost;
   if(!Number.isSafeInteger(cost)||cost<1||cost>10000)throw budgetError();
   const user=state.users[uid]||{cost:0,calls:0};
   if(state.blockedUntil>now||state.total+cost>80000||user.cost+cost>20000||user.calls>=1000)throw budgetError();
   const leases=Object.values(state.leases);if(leases.length>=8||leases.filter(l=>l.uid===uid).length>=2)throw budgetError('busy');
   const id=crypto.randomUUID();state.total+=cost;user.cost+=cost;user.calls++;state.users[uid]=user;state.leases[id]={uid,cost,expires:now+120000};
   await tx.put('budget',state);return {id,day,reserved:cost};
  }
  if(data.action==='settle'&&data.day===day){const lease=state.leases[data.id];if(lease){const actual=Number.isSafeInteger(data.actual)&&data.actual>=0?data.actual:lease.cost;const delta=actual-lease.cost;state.total=Math.max(0,state.total+delta);state.users[lease.uid].cost=Math.max(0,state.users[lease.uid].cost+delta);delete state.leases[data.id];}}
  if(data.action==='block')state.blockedUntil=(day+1)*DAY;
  await tx.put('budget',state);return {ok:true};
 });
}
export async function guardedAi(env,model,input,run){
 if(!env.ROOMS)return run(); // Unit fixtures do not provide Cloudflare bindings.
 const budget=env.ROOMS.get(env.ROOMS.idFromName('__ai_budget_v1__'));
 const call=async data=>{const r=await budget.fetch(new Request('https://budget/budget',{method:'POST',body:JSON.stringify(data)}));const result=await r.json();if(!r.ok)throw budgetError(result.reason);return result;};
 const reservation=await call({action:'reserve',uid:env.budgetUid||'unknown',cost:reserveCost(model,input)});
 let actual;
 try{const result=await run();const u=result?.usage;if(model.includes('gemma')&&Number.isFinite(u?.prompt_tokens)&&Number.isFinite(u?.completion_tokens))actual=Math.ceil(u.prompt_tokens*.1+u.completion_tokens*.3);return result;}
 catch(e){if([e,...(e?.errors||[]),e?.cause].some(v=>[3036,5035,3023,3041,5016,5018].includes(Number(v?.code))))await call({action:'block'}).catch(()=>{});throw e;}
 finally{await call({action:'settle',...reservation,...(actual!==undefined?{actual}:{})}).catch(()=>{});}
}
// Conservative app-local variable-cost budget, not Cloudflare account billing.
const DAY=86400000;
export function budgetError(reason='budget'){
 const e=Error(reason==='busy'?'処理が混み合っています。少し待ってください。':'本日のアプリ内AI利用上限に達しました。辞書の訳は引き続き使えます。');
 e.aiReason=reason;e.code=reason==='busy'?3040:3036;return e;
}
export function reserveCost(model,input){
 if(model==='@cf/google/gemma-4-26b-a4b-it')return Math.ceil((new TextEncoder().encode(JSON.stringify(input.messages||[])).length*.1+Math.min(4096,input.max_completion_tokens||4096)*.3)*1.1);
 if(model==='@cf/openai/whisper-large-v3-turbo')return Math.ceil((input.audio?.length||0)*.75/32000/60*.000513*1e6*1.1);
 if(model==='@cf/openai/whisper')return Math.ceil((input.audio?.length||0)/32000/60*.0006*1e6*1.1);
 throw budgetError();
}
export async function budgetOperation(storage,data,now=Date.now()){
 return storage.transaction(async tx=>{
  const day=Math.floor(now/DAY);let state=await tx.get('budget');
  if(!state||state.day!==day)state={day,total:0,users:{},leases:{},blockedUntil:0};
  for(const [id,l]of Object.entries(state.leases))if(l.expires<=now)delete state.leases[id];
  if(data.action==='reserve'){
   const uid=String(data.uid||'unknown').slice(0,128),cost=data.cost;
   if(!Number.isSafeInteger(cost)||cost<1||cost>10000)throw budgetError();
   const user=state.users[uid]||{cost:0,calls:0};
   if(state.blockedUntil>now||state.total+cost>80000||user.cost+cost>20000||user.calls>=1000)throw budgetError();
   const leases=Object.values(state.leases);if(leases.length>=8||leases.filter(l=>l.uid===uid).length>=2)throw budgetError('busy');
   const id=crypto.randomUUID();state.total+=cost;user.cost+=cost;user.calls++;state.users[uid]=user;state.leases[id]={uid,cost,expires:now+120000};
   await tx.put('budget',state);return {id,day,reserved:cost};
  }
  if(data.action==='settle'&&data.day===day){const lease=state.leases[data.id];if(lease){const actual=Number.isSafeInteger(data.actual)&&data.actual>=0?data.actual:lease.cost;const delta=actual-lease.cost;state.total=Math.max(0,state.total+delta);state.users[lease.uid].cost=Math.max(0,state.users[lease.uid].cost+delta);delete state.leases[data.id];}}
  if(data.action==='block')state.blockedUntil=(day+1)*DAY;
  await tx.put('budget',state);return {ok:true};
 });
}
export async function guardedAi(env,model,input,run){
 if(!env.ROOMS)return run(); // Unit fixtures do not provide Cloudflare bindings.
 const budget=env.ROOMS.get(env.ROOMS.idFromName('__ai_budget_v1__'));
 const call=async data=>{const r=await budget.fetch(new Request('https://budget/budget',{method:'POST',body:JSON.stringify(data)}));const result=await r.json();if(!r.ok)throw budgetError(result.reason);return result;};
 const reservation=await call({action:'reserve',uid:env.budgetUid||'unknown',cost:reserveCost(model,input)});
 let actual;
 try{const result=await run();const u=result?.usage;if(model.includes('gemma')&&Number.isFinite(u?.prompt_tokens)&&Number.isFinite(u?.completion_tokens))actual=Math.ceil(u.prompt_tokens*.1+u.completion_tokens*.3);return result;}
 catch(e){if([e,...(e?.errors||[]),e?.cause].some(v=>[3036,5035,3023,3041,5016,5018].includes(Number(v?.code))))await call({action:'block'}).catch(()=>{});throw e;}
 finally{await call({action:'settle',...reservation,...(actual!==undefined?{actual}:{})}).catch(()=>{});}
}
