// Share only OCR engines, never document text, images, or recognition results.
export function createOcrEnginePool({idleMs=5000,maxIdle=2}={}){
 const entries=new Map(),metrics={created:0,reused:0,terminated:0};let serial=0;
 async function retire(key,entry){if(entry.retired||entry.refs||entry.pending)return;clearTimeout(entry.timer);if(entries.get(key)===entry)entries.delete(key);entry.retired=true;try{const worker=await entry.ready;await worker[entry.dispose]?.();}catch{}metrics.terminated++;}
 function trim(){const idle=[...entries].filter(([,e])=>!e.refs&&!e.pending).sort(([,a],[,b])=>a.priority-b.priority||a.used-b.used);while(idle.length>maxIdle){const [key,entry]=idle.shift();void retire(key,entry);}}
 function schedule(key,entry){if(entry.refs||entry.pending||entry.retired)return;if(entry.broken){void retire(key,entry);return;}clearTimeout(entry.timer);entry.timer=setTimeout(()=>void retire(key,entry),idleMs);trim();}
 async function acquire(key,factory,{methods=['recognize','setParameters'],dispose='terminate',priority=1}={}){
  let entry=entries.get(key);if(entry?.broken){entries.delete(key);entry=undefined;}const reused=Boolean(entry),mode=entry?(entry.completed?'ready':'in-flight'):'new';if(entry){metrics.reused++;clearTimeout(entry.timer);}else{metrics.created++;entry={refs:0,pending:0,tail:Promise.resolve(),dispose,priority,used:++serial};entries.set(key,entry);entry.ready=Promise.resolve().then(factory).then(worker=>{entry.completed=true;return worker;});void entry.ready.catch(()=>{if(entries.get(key)===entry)entries.delete(key);});}
  entry.refs++;entry.used=++serial;let worker;try{worker=await entry.ready;}catch(error){entry.refs--;throw error;}let released=false;
  const release=async()=>{if(released)return;released=true;entry.refs--;entry.used=++serial;schedule(key,entry);};
  const lease={ocrPoolReused:reused,ocrPoolMode:mode,terminate:release,close:release};
  for(const method of methods)lease[method]=(...args)=>{if(released||entry.retired)return Promise.reject(new DOMException('OCR lease is closed','AbortError'));entry.pending++;const task=entry.tail.then(()=>{if(entry.broken)throw Error('OCR engine needs reinitialization');if(released||entry.retired)throw new DOMException('OCR lease is closed','AbortError');return worker[method](...args);});entry.tail=task.then(()=>{},()=>{});return task.catch(error=>{if(error.name!=='AbortError')entry.broken=true;throw error;}).finally(()=>{entry.pending--;schedule(key,entry);});};
  return lease;
 }
 return {acquire,stats:()=>({...metrics,maxIdle,idleMs,workers:entries.size,leases:[...entries.values()].reduce((n,e)=>n+e.refs,0),pending:[...entries.values()].reduce((n,e)=>n+e.pending,0)}),async clearIdle(){await Promise.all([...entries].filter(([,e])=>!e.refs&&!e.pending).map(([k,e])=>retire(k,e)));}};
}
export function ocrPoolPolicy({maxTouchPoints=0,deviceMemory}={}){return maxTouchPoints>0||Number.isFinite(deviceMemory)&&deviceMemory<=2?{idleMs:1500,maxIdle:1}:{idleMs:5000,maxIdle:2};}
export const documentOcrPool=createOcrEnginePool(ocrPoolPolicy(typeof navigator==='object'?navigator:{}));
