？='quota'))nextSteps.push('AI側は上限を報告しています。管理画面の当日残量・アカウント・時刻と照合してください。この診断だけで実際の残量は断定しません。');
 if(records.some(r=>r.aiReason==='input'))nextSteps.push('音声形式・モデルの入力仕様を確認してください。回線の変更だけで直るとは限りません。');
 if(failed.some(r=>['network_or_cors','timeout','invalid_response'].includes(r.code))){nextSteps.push('同じ端末で学校Wi-Fiと許可された別回線を比較し、それぞれの診断結果を保存する。別回線だけ成功する場合は回線側の制限が候補になります。');nextSteps.push('ネットワーク管理者に下記接続先のDNS解決・HTTPS/TLS・フィルターの拒否ログを確認してもらう。');nextSteps.push('PCの開発者ツールのNetwork/Consoleで失敗したリクエストのHTTP状態・CORS表示・証明書エラーを確認する。共有時はAuthorization・token・招待URL・本文を削除する。');}
 nextSteps.push('APIが成功してからルーム作成、相手の参加、WebSocket、最後に音声のTURN経路を順に確認する。');
 return {generatedAt:new Date(now).toISOString(),observationWindowSeconds:300,pastRecordCount:history.length-records.length,sessionResults:recentSessions,facts,candidates,nextSteps,requiredEndpoints:[...new Set(records.map(r=>r.endpoint).filter(Boolean))],notMeasured:['DNSの解決結果','TLS証明書・ハンドシェイク','学校フィルター・プロキシの拒否理由','CORSの詳細な拒否理由','実際のTURN中継経路と学校端末間の音声到達'],limitations:'ブラウザーのfetchは通信失敗の詳細を公開しません。network_or_corsだけでは原因を確定できません。過去の失敗記録は現在の障害を証明しません。健康確認はルームを作成せず、音声・WebSocketも検査しません。'};
}

export function summarizeSessions(sessions=[]){
 const number=v=>Number.isFinite(v)&&v>=0?v:0;
 return sessions.filter(s=>Number.isFinite(s.startedAt)).sort((a,b)=>b.startedAt-a.startedAt).slice(0,10).map(s=>{const times=(s.latencies||[]).filter(v=>Number.isFinite(v)&&v>=0),events=s.events||[];return {startedAt:new Date(s.startedAt).toISOString(),updatedAt:Number.isFinite(s.updatedAt)?new Date(s.updatedAt).toISOString():null,ended:s.ended===true,translatedCaptions:Math.max(0,number(s.captionCount)-number(s.failedCaptions)),failedCaptions:number(s.failedCaptions),reconnectCount:events.filter(e=>e.type==='reconnect').length,relayBytes:number(s.relayBytes),firstTranslationMs:times[0]??null,maxTranslationMs:times.length?Math.max(...times):null,slowTranslationCount:times.filter(v=>v>=5000).length,speechTimingSamples:(s.speechLatencies||[]).length,interpretation:'翻訳・中継の観測値です。通話全体が成功したか、相手に聞こえたか、翻訳品質は自動判定しません。'};});
}
