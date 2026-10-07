export function resourceFailure(error){
 const message=String(error?.message||'');
 if(/(?:daily|free tier|free-tier).*(?:limit|quota)|(?:limit|quota).*(?:exceeded|exhausted)|100000.*requests/i.test(message))return {reason:'quota',status:503,message:'サーバーの本日の利用上限に達しました。回復するまで接続を停止します。'};
 return null;
}
export function mayReconnect(code,attempt,online=true){return online&&code!==1008&&attempt<=5;}
