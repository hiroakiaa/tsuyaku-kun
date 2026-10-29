// An explicit, flat allowlist prevents provider payloads/text from entering diagnostics.
const fields={authMs:'serverAuthMs',uploadMs:'serverUploadMs',preprocessMs:'serverPreprocessMs',providerMs:'serverProviderMs',budgetWaitMs:'serverBudgetWaitMs',budgetSettleMs:'serverBudgetSettleMs',totalMs:'serverTotalMs'};
export function recognitionMetrics(value){
 if(!value||typeof value!=='object')return {};
 const out={};for(const [from,to] of Object.entries(fields)){const n=value[from];if(Number.isFinite(n)&&n>=0&&n<=60000)out[to]=Math.round(n);}
 if(typeof value.aiCalled==='boolean')out.aiCalled=value.aiCalled;
 if(typeof value.serverBuild==='string'&&/^\d{8}-[a-z0-9-]{1,60}$/.test(value.serverBuild))out.serverBuild=value.serverBuild;
 return out;
}
