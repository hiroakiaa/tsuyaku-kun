let keys,until=0,keyRequest;
const importedKeys=new Map();
async function signingKeys(){
 if(keys&&Date.now()<=until)return keys;
 if(!keyRequest)keyRequest=(async()=>{const r=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('認証を確認できませんでした。');const next=(await r.json()).keys;if(!Array.isArray(next)||!next.length)throw Error('認証を確認できませんでした。');keys=next;until=Date.now()+3600000;importedKeys.clear();return keys;})().finally(()=>{keyRequest=null;});
 return keyRequest;
}
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyToken(token,project,includeIdentity=false) {
  if(typeof token!=='string'||token.length>8192)throw Error('ログインし直してください。');
  const parts=token.split('.');if(parts.length!==3)throw Error('ログインし直してください。');
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),data=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
  if(head.alg!=='RS256'||typeof head.kid!=='string'||data.aud!==project||data.iss!=='https://securetoken.google.com/'+project||!Number.isFinite(data.exp)||data.exp<=now||!Number.isFinite(data.iat)||data.iat>now+30||typeof data.sub!=='string'||!data.sub||data.sub.length>128)throw Error('ログインし直してください。');
  const available=await signingKeys(),jwk=available.find(k=>k.kid===head.kid);if(!jwk)throw Error('認証を確認できませんでした。');
  let keyRequestForKid=importedKeys.get(jwk);if(!keyRequestForKid){keyRequestForKid=crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']).catch(error=>{importedKeys.delete(jwk);throw error;});importedKeys.set(jwk,keyRequestForKid);}const key=await keyRequestForKid;
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('認証を確認できませんでした。');
  return {uid:data.sub,provider:data.firebase?.sign_in_provider,expires:data.exp*1000,...(includeIdentity?{email:typeof data.email==='string'?data.email:null,emailVerified:data.email_verified===true}:{})};
}
