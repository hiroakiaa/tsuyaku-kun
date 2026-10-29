// One device shares the existing two AI slots between speech recognition and translation.
export function createAiGate(limit=2){
 if(!Number.isInteger(limit)||limit<1)throw Error('Invalid AI slot limit');
 let active=0;const waiting=[];
 const pump=()=>{while(active<limit&&waiting.length){const entry=waiting.shift();entry.signal?.removeEventListener('abort',entry.abort);if(entry.signal?.aborted){entry.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));continue;}active++;let released=false;entry.resolve(()=>{if(released)return;released=true;active--;pump();});}};
 return {acquire(signal){return new Promise((resolve,reject)=>{const entry={signal,resolve,reject};entry.abort=()=>{const index=waiting.indexOf(entry);if(index>=0)waiting.splice(index,1);reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));};if(signal?.aborted){entry.abort();return;}waiting.push(entry);signal?.addEventListener('abort',entry.abort,{once:true});pump();});},get active(){return active;},get pending(){return waiting.length;}};
}
