// Reservations are charged before provider work. Cleanup never grants new credit.
export async function completeBudgetCleanup(env,work,timing,now=Date.now){
 if(typeof env.backgroundBudgetCleanup==='function'){
  const pending=Promise.resolve().then(work).catch(()=>{});
  try{env.backgroundBudgetCleanup(pending);if(timing){timing.budgetSettleDeferred=true;timing.budgetSettleMs=null;}return;}catch{await pending;return;}
 }
 const started=now();try{await work();}catch{}finally{if(timing)timing.budgetSettleMs=(timing.budgetSettleMs||0)+Math.max(0,now()-started);}
}
