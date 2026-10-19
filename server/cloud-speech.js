// Only counts are persisted. Speech text and generated audio stay out of storage/logs.
export const SPEECH_MONTH_LIMIT=500000;
export const SPEECH_USER_LIMIT=50000;
export function speechInput(data){
 const language=String(data.language||'').toLowerCase();
 if(!['fil','tl','fil-ph','tl-ph'].includes(language))throw Object.assign(Error('この読み上げはフィリピノ語専用です。'),{status:400});
 const text=typeof data.text==='string'?data.text.trim():'';
 const characters=[...text].length;
 if(!characters||characters>1200||new TextEncoder().encode(text).length>4800)throw Object.assign(Error('読み上げる文は1200文字以内にしてください。'),{status:400});
 return {text,characters};
}
export async function speechBudget(storage,data,now=Date.now()){
 return storage.transaction(async tx=>{
  const month=new Date(now).toISOString().slice(0,7),next=new Date(now);next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCHours(0,0,0,0);
  let state=await tx.get('speech-budget');if(state?.month!==month)state={month,used:0,requests:0,users:{},leases:{}};
  const status=()=>({month,resetsAt:next.getTime(),usedCharacters:state.used,limitCharacters:SPEECH_MONTH_LIMIT,remainingCharacters:Math.max(0,SPEECH_MONTH_LIMIT-state.used),requests:state.requests,estimatedBeforeFreeUSD:state.used*.000004});
  if(data.action==='status')return status();
  for(const [id,lease]of Object.entries(state.leases))if(lease.expires<=now)delete state.leases[id];
  if(data.action==='reserve'){
   const count=data.characters,uid=String(data.uid||'').slice(0,128);if(!uid||!Number.isSafeInteger(count)||count<1||count>1200)throw Object.assign(Error('読み上げデータを確認してください。'),{status:400});
   if(state.used+count>SPEECH_MONTH_LIMIT||(state.users[uid]||0)+count>SPEECH_USER_LIMIT)throw Object.assign(Error('今月のクラウド読み上げ上限です。'),{status:429});
   if(!Object.hasOwn(state.users,uid)&&Object.keys(state.users).length>=1000)throw Object.assign(Error('今月の読み上げ利用数の上限です。'),{status:429});
   const leases=Object.values(state.leases);if(leases.length>=6||leases.filter(l=>l.uid===uid).length>=2)throw Object.assign(Error('音声を準備中です。少し待ってください。'),{status:429});
   const id=crypto.randomUUID();state.used+=count;state.requests++;state.users[uid]=(state.users[uid]||0)+count;state.leases[id]={uid,expires:now+30000};await tx.put('speech-budget',state);return {id,...status()};
  }
  if(data.action==='release'){if(state.leases[data.id])delete state.leases[data.id];await tx.put('speech-budget',state);return status();}
  throw Object.assign(Error('読み上げ操作を確認してください。'),{status:400});
 });
}
export async function speechOperation(env,data){
 const budget=env.ROOMS.get(env.ROOMS.idFromName('__cloud_speech_budget_v1__'));
 const response=await budget.fetch(new Request('https://speech/speech-budget',{method:'POST',body:JSON.stringify(data)}));const result=await response.json();
 if(!response.ok)throw Object.assign(Error(result.error||'読み上げを準備できませんでした。'),{status:response.status});return result;
}
export async function synthesizeFilipino(env,data,fetcher=fetch){
 const {text,characters}=speechInput(data);
 if(!env.GOOGLE_TTS_API_KEY)throw Object.assign(Error('クラウド読み上げの接続を準備中です。'),{status:503});
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.budgetUid||''))),uid=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);
 const reservation=await speechOperation(env,{action:'reserve',uid,characters});
 try{
  const response=await fetcher('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_TTS_API_KEY},body:JSON.stringify({input:{text},voice:{languageCode:'fil-PH',name:'fil-PH-Wavenet-A'},audioConfig:{audioEncoding:'MP3',speakingRate:1,pitch:0}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Object.assign(Error(response.status===429?'音声サービスが混み合っています。少し待ってください。':'音声サービスとの接続を確認してください。'),{status:response.status===429?429:502});
  const result=await response.json();if(typeof result.audioContent!=='string'||!result.audioContent.length||result.audioContent.length>3000000||!/^[A-Za-z0-9+/=]+$/.test(result.audioContent))throw Object.assign(Error('音声データを受け取れませんでした。'),{status:502});
  return {audioContent:result.audioContent,mimeType:'audio/mpeg',voice:'fil-PH-Wavenet-A',characters,budget:{month:reservation.month,usedCharacters:reservation.usedCharacters,limitCharacters:reservation.limitCharacters}};
 }finally{await speechOperation(env,{action:'release',id:reservation.id}).catch(()=>{});}
}
