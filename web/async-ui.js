// Share one in-flight attempt, but permit an explicit retry once it has settled.
export function singleFlight(work){
 let pending=null;
 return (...args)=>pending||(pending=Promise.resolve().then(()=>work(...args)).finally(()=>{pending=null;}));
}
