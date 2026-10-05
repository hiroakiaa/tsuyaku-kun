export const ROOM_TTL=24*60*60*1000;
export function normalizeRoomCode(value){return String(value??'').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296)).trim();}
export class LessonCodes{
 constructor(storage,now=()=>Date.now(),random=()=>crypto.getRandomValues(new Uint32Array(1))[0]%10000){this.storage=storage;this.now=now;this.random=random;}
 async allocate(data){const now=this.now();const row=await this.storage.transaction(async tx=>{const slots=await tx.list({prefix:'code:',limit:10000});const start=this.random();for(let offset=0;offset<10000;offset++){const code=String((start+offset)%10000).padStart(4,'0'),old=slots.get('code:'+code);if(old&&old.expires>now)continue;const next={id:data.id,key:data.key,code,mode:'lesson',expires:now+ROOM_TTL};await tx.put('code:'+code,next);await tx.put('codesDirectory',true);return next;}throw Error('授業ルームが満員です。期限切れ後にもう一度お試しください。');});const alarm=await this.storage.getAlarm();if(!alarm||alarm>row.expires)await this.storage.setAlarm(row.expires);return row;}
 async lookup(value){const code=normalizeRoomCode(value);if(!/^\d{4}$/.test(code))throw Error('ルームIDは4桁で入力してください。');const row=await this.storage.get('code:'+code);if(!row||row.expires<=this.now())throw Error('このルームIDは見つからないか、期限が切れています。');return row;}
 async release(code,id){await this.storage.transaction(async tx=>{const row=await tx.get('code:'+code);if(row?.id===id)await tx.delete('code:'+code);});}
 async cleanup(){let next=Infinity;const now=this.now();await this.storage.transaction(async tx=>{for(const [key,row]of await tx.list({prefix:'code:',limit:10000})){if(row.expires<=now)await tx.delete(key);else next=Math.min(next,row.expires);}});if(Number.isFinite(next))await this.storage.setAlarm(next);}
}
