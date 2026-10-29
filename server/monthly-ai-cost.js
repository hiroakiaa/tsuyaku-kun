// Counts and conservative app budget consumption only. No identity or text is stored.
const MODELS=new Set(['@cf/google/gemma-4-26b-a4b-it','@cf/openai/whisper-large-v3-turbo','@cf/openai/whisper','@cf/deepgram/nova-3']);
const bucket=model=>MODELS.has(model)?model:'legacy-unclassified';
export function monthlyAiState(previous,now){
 const month=new Date(now).toISOString().slice(0,7),existing=previous?.monthly;
 if(existing?.month===month)return existing;
 const dayMonth=Number.isFinite(previous?.day)?new Date(previous.day*86400000).toISOString().slice(0,7):null,seed=dayMonth===month?Math.max(0,previous.total||0):0,calls=dayMonth===month?Object.values(previous.users||{}).reduce((n,u)=>n+(u.calls||0),0):0;
 const start=Date.parse(month+'-01T00:00:00Z'),partial=!existing;
 const value={month,coverageStart:partial?(dayMonth===month?previous.day*86400000:now):start,partial,cost:seed,calls,models:{},leases:{}};
 if(seed||calls)value.models['legacy-unclassified']={cost:seed,calls};
 if(dayMonth===month)for(const [id,l]of Object.entries(previous.leases||{}))if(l.expires>now)value.leases[id]={cost:l.cost,model:'legacy-unclassified',day:previous.day,expires:l.expires};
 return value;
}
export function monthlyReserve(state,id,day,cost,model,now){const key=bucket(model);state.cost+=cost;state.calls++;state.models[key]??={cost:0,calls:0};state.models[key].cost+=cost;state.models[key].calls++;state.leases[id]={cost,model:key,day,expires:now+120000};}
export function monthlySettle(state,data){const lease=state.leases[data.id];if(!lease||lease.day!==data.day)return;const actual=Number.isSafeInteger(data.actual)&&data.actual>=0?data.actual:lease.cost,delta=actual-lease.cost;state.cost=Math.max(0,state.cost+delta);state.models[lease.model].cost=Math.max(0,state.models[lease.model].cost+delta);delete state.leases[data.id];}
export function monthlyAiReport(state,now){return {month:state.month,asOf:now,coverageStart:state.coverageStart,partial:state.partial,estimatedBeforeFreeUSD:state.cost/1e6,calls:state.calls,inFlight:Object.keys(state.leases).length,models:Object.entries(state.models).map(([model,v])=>({model,estimatedBeforeFreeUSD:v.cost/1e6,calls:v.calls})),basis:'app_budget_consumption',includesReservations:true};}

export function monthlyExtend(state,id,day,cost,expires){const lease=state.leases[id];if(!lease||lease.day!==day)throw Error("Missing monthly reservation");lease.cost+=cost;lease.expires=expires;state.cost+=cost;state.models[lease.model].cost+=cost;}
