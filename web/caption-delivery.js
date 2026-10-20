// Operational metadata only. Speech, names, room IDs and credentials never enter export().
export class CaptionDelivery{
 constructor(now=()=>Date.now()){this.now=now;this.rows=new Map();this.events=[];this.sequence=0;}
 update(id,revision,event,extra={}){let row=this.rows.get(id);if(row&&revision<row.revision)return row;if(!row||revision>row.revision){row={sample:++this.sequence,revision,retries:0,syncs:0,lastAttempt:0};this.rows.set(id,row);}Object.assign(row,extra);this.events.push({sample:row.sample,revision,event,at:this.now()});this.events=this.events.slice(-200);while(this.rows.size>300)this.rows.delete(this.rows.keys().next().value);return row;}
 sent(id,revision,ok){const row=this.update(id,revision,ok?'sent':'unsent',{lastAttempt:this.now()});if(!row.accepted)row.state=ok?'sending':'unsent';return row;}
 accepted(id,revision){return this.update(id,revision,'accepted',{accepted:true,state:this.rows.get(id)?.state==='delivered'?'delivered':'accepted'});}
 result(id,revision,status){return this.update(id,revision,'result',{finished:true,state:status==='failed'?'failed':this.rows.get(id)?.state==='delivered'?'delivered':'accepted'});}
 delivered(id,revision,count,total){return this.update(id,revision,'displayed',{finished:true,state:'delivered',count,total});}
 received(id,revision){this.update(id,revision,'received');}
 displayed(id,revision){this.update(id,revision,'displayed-local');}
 get(id){return this.rows.get(id);}
 due(){const now=this.now(),out=[];for(const [id,row]of this.rows){if(!['sending','unsent','accepted'].includes(row.state))continue;if(!row.accepted&&!row.finished&&row.retries<2&&now-row.lastAttempt>=6000){row.retries++;row.lastAttempt=now;out.push({id,kind:'resend'});}else if((row.accepted||row.finished)&&row.syncs<2&&now-row.lastAttempt>=20000){row.syncs++;row.lastAttempt=now;out.push({id,kind:'sync'});}else if(!row.accepted&&!row.finished&&row.retries>=2&&now-row.lastAttempt>=6000){row.state='unconfirmed';}}return out.slice(0,12);}
 export(){return {events:this.events.map(e=>({...e})),note:'この端末で観測した受付・受信・表示の時刻。本文・氏名・ルームID・字幕ID・接続キーは含みません。表示済みは相手のアプリによる確認で、人が読んだことの保証ではありません。'};}
 clear(){this.rows.clear();}
}
export function deliveryLabel(row){if(!row)return '';return ({sending:'送信中',unsent:'未送信・再接続待ち',unconfirmed:'送信確認が取れません・再送できます',accepted:'サーバー受付済み・相手の表示確認待ち',delivered:row.total>1?'相手端末に表示済み '+row.count+' / '+row.total:'相手端末に表示済み',failed:'翻訳失敗・原文を保持'})[row.state]||'';}
