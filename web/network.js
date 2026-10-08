const STAGES=new Set(['api','auth','turn','api_simple','api_headers','asr','browser_speech']);
const OPERATIONS=new Set(['capture','translation','transcribe','room_create','lesson_join','catalog','dictionary_translate','dictionary_candidate','token','initial_auth','turn_credentials','health','other']);
const RESULTS=new Set(['filtered','queue_overflow','ok','network_or_cors','timeout','http_error','invalid_response','auth_unavailable','no_turn_server','browser_speech_started','browser_speech_error']);
export function connectionFailure(error,{stage='api',endpoint='',operation='other',status}={}){
 const code=error?.code&&RESULTS.has(error.code)?error.code:error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':Number.isInteger(status)?'http_error':'network_or_cors';
 const subject=stage==='auth'?'参加の認証':stage==='turn'?'音声中継サーバー':'字幕・翻訳サーバー';
 const explanation=code==='timeout'?'への接続が時間内に完了しませんでした。':code==='invalid_response'?'からアプリ用の応答を受け取れませんでした。':code==='http_error'?'が通信を受け付けませんでした（HTTP '+status+'）。':'に接続できませんでした。';
 return Object.assign(new Error(subject+explanation+'「接続を確認」で診断できます。'),{connectionIssue:true,connection:{stage,endpoint,operation,code,...(Number.isInteger(status)?{status}:{})}});
}
export function safeConnectionRecord(value){
 let endpoint='';try{const u=new URL(value.endpoint);if(['https:','http:'].includes(u.protocol))endpoint=u.origin;}catch{}
 return {...(['empty','model_no_speech','nonverbal'].includes(value.filterReason)?{filterReason:value.filterReason}:{}),at:Number.isFinite(value.at)?value.at:Date.now(),stage:STAGES.has(value.stage)?value.stage:'api',operation:OPERATIONS.has(value.operation)?value.operation:'other',code:RESULTS.has(value.code)?value.code:'network_or_cors',endpoint,...(Number.isInteger(value.status)&&value.status>=100&&value.status<=599?{status:value.status}:{}),...(Number.isFinite(value.elapsedMs)&&value.elapsedMs>=0?{elapsedMs:Math.round(value.elapsedMs)}:{}),...(Number.isFinite(value.queueMs)&&value.queueMs>=0&&value.queueMs<=60000?{queueMs:Math.round(value.queueMs)}:{}),...(Number.isFinite(value.audioSeconds)&&value.audioSeconds>=0&&value.audioSeconds<=16?{audioSeconds:Math.round(value.audioSeconds*1000)/1000}:{}),...(['pause','limit'].includes(value.segmentBoundary)?{segmentBoundary:value.segmentBoundary}:{}),...(typeof value.online==='boolean'?{online:value.online}:{}),...(['quota','billing','overloaded','input','model','auth','timeout','service'].includes(value.aiReason)?{aiReason:value.aiReason}:{}),...(Number.isInteger(value.aiCode)&&value.aiCode>=1000&&value.aiCode<=9999?{aiCode:value.aiCode}:{}),...(['provider_code','provider_message','unclassified'].includes(value.aiEvidence)?{aiEvidence:value.aiEvidence}:{}),...(['@cf/google/gemma-4-26b-a4b-it','@cf/openai/whisper-large-v3-turbo','@cf/openai/whisper'].includes(value.aiModel)?{aiModel:value.aiModel}:{})};
}
export class ConnectionDiary{
 constructor(storage){this.storage=storage;this.key='tsuyaku-connection-v1';}
 list(){try{const rows=JSON.parse(this.storage.getItem(this.key)||'[]');return Array.isArray(rows)?rows.slice(-50).map(safeConnectionRecord):[];}catch{return [];}}
 add(value){const record=safeConnectionRecord(value);try{this.storage.setItem(this.key,JSON.stringify([...this.list(),record].slice(-50)));}catch{}return record;}
}
export async function requestJson(url,options={}, {fetcher=fetch,stage='api',operation='other',onFailure=()=>{}}={}){
 let response;
 try{response=await fetcher(url,options);}catch(error){const failure=connectionFailure(error,{stage,endpoint:url,operation});onFailure(failure.connection);throw failure;}
 let result;
 try{result=await response.json();}catch{const failure=connectionFailure({code:'invalid_response'},{stage,endpoint:url,operation,status:response.status});onFailure(failure.connection);throw failure;}
 if(!response.ok||result.error){onFailure(safeConnectionRecord({stage,operation,endpoint:url,code:'http_error',status:response.status,aiReason:result.aiFailure?.reason,aiCode:result.aiFailure?.code,aiEvidence:result.aiFailure?.evidence,aiModel:result.aiFailure?.model}));throw Object.assign(Error(result.error||'接続先が応答しました（HTTP '+response.status+'）。'),{usage:result.usage,latencyMs:result.latencyMs,httpStatus:response.status,resourceFailure:result.resourceFailure,aiFailure:result.aiFailure});}
 return result;
}
export async function probeNetwork(api,{fetcher=fetch,now=()=>Date.now()}={}){
 return Promise.all(['api_simple','api_headers'].map(async stage=>{
 const started=now(),url=api+'/health',options={method:stage==='api_simple'?'GET':'POST',signal:AbortSignal.timeout(8000),referrerPolicy:'no-referrer',...(stage==='api_headers'?{headers:{Authorization:'Bearer connectivity-check','Content-Type':'application/json'},body:'{}'}:{})};
 let response;
 try{response=await fetcher(url,options);let valid=false;try{const data=await response.json();valid=data.ok===true&&data.app==='通訳君';}catch{}return safeConnectionRecord({stage,operation:'health',endpoint:url,code:!response.ok?'http_error':valid?'ok':'invalid_response',status:response.status,elapsedMs:now()-started});}
 catch(error){return safeConnectionRecord({...connectionFailure(error,{stage,endpoint:url,operation:'health'}).connection,elapsedMs:now()-started});}
 }));
}

export function explainConnection(checks,{authentication='unavailable',online=true,now=Date.now(),sessions=[]}={}){
 const history=checks.map(r=>safeConnectionRecord({...r,at:Number.isFinite(r.at)?r.at:now})),records=history.filter(r=>r.at<=now&&now-r.at<=300000),latest=stage=>records.filter(r=>r.stage===stage).sort((a,b)=>a.at-b.at).at(-1),simple=latest('api_simple'),headers=latest('api_headers'),turn=latest('turn'),transcribe=records.filter(r=>r.operation==='transcribe').sort((a,b)=>a.at-b.at).at(-1);
 const translation=records.filter(r=>r.operation==='translation').sort((a,b)=>a.at-b.at).at(-1);
 const facts=[],candidates=[],nextSteps=[];const recentSessions=summarizeSessions(sessions);facts.push('接続診断の判定対象は過去5分の記録です。利用結果とは別の検査です。');if(history.length>records.length)facts.push('5分より古い通信記録 '+(history.length-records.length)+'件は現在の原因判定から除外しています。');if(recentSessions.length){const s=recentSessions[0];facts.push('最新の利用：翻訳成功 '+s.translatedCaptions+'文、翻訳失敗 '+s.failedCaptions+'文、再接続 '+s.reconnectCount+'回。');if(s.slowTranslationCount>0)facts.push('最新の利用で5秒以上の翻訳 '+s.slowTranslationCount+'文、最初の翻訳 '+s.firstTranslationMs+'ms。処理内訳は未計測で、原因は断定できません。');if(s.relayBytes>0)facts.push('最新の利用でTURN中継通信 '+s.relayBytes+' bytesを観測しました。相手の音声再生成功までは判定しません。');}
 facts.push(authentication==='ready'?'匿名認証の準備は完了しています。':'匿名認証の準備完了を確認できていません。');
 if(!online)facts.push('端末がオフラインと報告しています。');
 for(const r of [simple,headers,turn,transcribe,translation].filter(Boolean))facts.push((r.stage==='browser_speech'?'ブラウザー音声認識':r.operation==='translation'?'翻訳AI':r.operation==='transcribe'?'音声認識API':({api_simple:'APIの通常通信',api_headers:'APIの認証ヘッダー付き通信',turn:'TURN接続情報の取得'})[r.stage])+'：'+r.code+(r.status?'（HTTP '+r.status+'）':'')+'。');
 const failed=records.filter(r=>!['ok','filtered','browser_speech_started'].includes(r.code));
 const recent=sessions.filter(s=>Number.isFinite(s.updatedAt)&&s.updatedAt<=now&&now-s.updatedAt<=300000),errors=recent.flatMap(s=>s.events||[]).filter(e=>e.type==='recognition_error'),drops=recent.flatMap(s=>s.events||[]).filter(e=>e.type==='asr_queue_drop');
 if(errors.length){facts.push('直近の利用中に音声認識エラー '+errors.length+'回を観測しました。最後のAPI成功とは別に扱います。');candidates.push({cause:'利用中の音声認識の中断',confidence:'イベントを観測・原因は未確定',evidence:[...new Set(errors.map(e=>e.recognitionCode||'unknown'))].join(', ')});nextSteps.push('音声認識の自動復旧回数と復旧後の字幕を確認してください。');}
 if(drops.length)facts.push('直近の利用で待機音声の破棄 '+drops.length+'回。該当部分はもう一度話す必要があります。');
 if(failed.some(r=>r.operation==='room_create'))facts.push('ルーム作成の失敗記録があります。QR表示前の段階です。');
 if(simple?.code==='network_or_cors'&&headers?.code==='network_or_cors')candidates.push({cause:'接続先への通信制限・DNS・TLS・CORS',confidence:'未確定',evidence:'通常通信とヘッダー付き通信の両方が失敗しています。認証ヘッダーだけの問題とは絞れません。'});
 else if(simple?.code==='ok'&&headers&&headers.code!=='ok')candidates.push({cause:'認証ヘッダーを含む通信・CORSプリフライトの制限',confidence:'候補',evidence:'通常通信は成功し、ヘッダー付き通信は失敗しています。'});
 if(simple?.code==='ok'&&headers?.code==='ok')facts.push('直近の健康確認は成功しています。認証更新・ルーム作成・WebSocket・音声通信の成功は別途確認が必要です。');
 if(turn&&turn.code!=='ok')facts.push('TURN情報を取得できないため、音声中継の利用を確認できません。');
 for(const r of failed){
 if(r.code==='queue_overflow')candidates.push({cause:'端末内の音声認識待ち行列の増加',confidence:'アプリ内で観測',evidence:'古い待機音声を破棄しました。AIサービスの混雑とは区別しています。'});
 if(r.code==='timeout')candidates.push({cause:'応答の遅延・無応答',confidence:'候補',evidence:r.stage+' が制限時間内に完了していません。'});
 if(r.aiReason)candidates.push({cause:({quota:'AIの無料枠上限',billing:'AIモデルの有料プラン要件',overloaded:'AIサービスの混雑',input:'AIへの入力形式',model:'AIモデルの利用不可',auth:'AIサービスのアクセス拒否',timeout:'AI処理の時間切れ',service:'AI内部エラー'})[r.aiReason],confidence:r.aiCode?'AIエラーコードを観測':r.aiEvidence==='provider_message'?'AI側の報告・残量は未確認':'分類のみ・未確定',evidence:r.operation+' AI code '+(r.aiCode??'未取得')+(r.aiModel?' model '+r.aiModel:'')+'。'});
 if(r.code==='http_error'&&Number.isInteger(r.status))candidates.push({cause:r.status===401?'認証の拒否':r.status===403?'アクセスの拒否':r.status===429?'呼び出し制限':r.status>=500?'サーバー側のエラー':'HTTPエラー',confidence:'HTTP状態のみ確定',evidence:r.stage+' HTTP '+r.status+'。拒否した機器・理由はこの状態だけでは分かりません。'});
 if(r.code==='invalid_response')candidates.push({cause:'フィルター画面・プロキシ・想定外の応答',confidence:'候補',evidence:r.stage+' は期待するアプリ用JSONではありません。'});
 }
 if(records.some(r=>r.aiReason==='quota'))nextSteps.push('AI側は上限を報告しています。管理画面の当日残量・アカウント・時刻と照合してください。この診断だけで実際の残量は断定しません。');
 if(records.some(r=>r.aiReason==='input'))nextSteps.push('音声形式・モデルの入力仕様を確認してください。回線の変更だけで直るとは限りません。');
 if(failed.some(r=>['network_or_cors','timeout','invalid_response'].includes(r.code))){nextSteps.push('同じ端末で学校Wi-Fiと許可された別回線を比較し、それぞれの診断結果を保存する。別回線だけ成功する場合は回線側の制限が候補になります。');nextSteps.push('ネットワーク管理者に下記接続先のDNS解決・HTTPS/TLS・フィルターの拒否ログを確認してもらう。');nextSteps.push('PCの開発者ツールのNetwork/Consoleで失敗したリクエストのHTTP状態・CORS表示・証明書エラーを確認する。共有時はAuthorization・token・招待URL・本文を削除する。');}
 nextSteps.push('APIが成功してからルーム作成、相手の参加、WebSocket、最後に音声のTURN経路を順に確認する。');
 return {generatedAt:new Date(now).toISOString(),observationWindowSeconds:300,pastRecordCount:history.length-records.length,sessionResults:recentSessions,facts,candidates,nextSteps,requiredEndpoints:[...new Set(records.map(r=>r.endpoint).filter(Boolean))],notMeasured:['DNSの解決結果','TLS証明書・ハンドシェイク','学校フィルター・プロキシの拒否理由','CORSの詳細な拒否理由','実際のTURN中継経路と学校端末間の音声到達'],limitations:'ブラウザーのfetchは通信失敗の詳細を公開しません。network_or_corsだけでは原因を確定できません。過去の失敗記録は現在の障害を証明しません。健康確認はルームを作成せず、音声・WebSocketも検査しません。'};
}

export function summarizeSessions(sessions=[]){
 const number=v=>Number.isFinite(v)&&v>=0?v:0;
 return sessions.filter(s=>Number.isFinite(s.startedAt)).sort((a,b)=>b.startedAt-a.startedAt).slice(0,10).map(s=>{const times=(s.latencies||[]).filter(v=>Number.isFinite(v)&&v>=0),events=s.events||[];return {startedAt:new Date(s.startedAt).toISOString(),updatedAt:Number.isFinite(s.updatedAt)?new Date(s.updatedAt).toISOString():null,ended:s.ended===true,translatedCaptions:Math.max(0,number(s.captionCount)-number(s.failedCaptions)),failedCaptions:number(s.failedCaptions),reconnectCount:events.filter(e=>e.type==='reconnect').length,relayBytes:number(s.relayBytes),firstTranslationMs:times[0]??null,maxTranslationMs:times.length?Math.max(...times):null,slowTranslationCount:times.filter(v=>v>=5000).length,speechTimingSamples:(s.speechLatencies||[]).length,recognitionErrorCount:events.filter(e=>e.type==='recognition_error').length,recognitionRestartCount:events.filter(e=>e.type==='asr_restart').length,queueDropCount:events.filter(e=>e.type==='asr_queue_drop').length,interpretation:'翻訳・中継の観測値です。通話全体が成功したか、相手に聞こえたか、翻訳品質は自動判定しません。'};});
}
