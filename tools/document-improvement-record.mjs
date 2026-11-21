export function validateImprovementRecord(data,{next=false,exists=()=>false}={}){
 const start=data.startId??1;
 if(!Array.isArray(data.items)||data.items.length!==50||new Set(data.items.map(x=>x.id)).size!==50||data.items.some((x,i)=>x.id!==i+start||!x.title?.trim()||!x.acceptance?.trim()||!['pending','in_progress','complete'].includes(x.status)||!Array.isArray(x.evidence)||x.evidence.some(e=>typeof e!=='string'||!e.trim())||(x.status==='complete'&&!x.evidence.length)))throw Error('Invalid improvement acceptance record');
 if(next)for(const item of data.items.filter(x=>x.status==='complete')){const v=item.verification,r=v?.release;if(!r||r.published!==true||!/^([a-f0-9]{7,40})$/.test(r.commit??'')||!Array.isArray(v.tests)||!v.tests.length||v.tests.some(t=>t.passed!==true||!t.scope?.trim()||typeof t.path!=='string'||!/^(?:tests|tools|docs)\/[A-Za-z0-9_./-]+$/.test(t.path)||t.path.includes('..')||!exists(t.path)))throw Error('Missing verified release/test evidence for '+item.id);}
 return Object.fromEntries(['complete','in_progress','pending'].map(s=>[s,data.items.filter(x=>x.status===s).length]));
}
