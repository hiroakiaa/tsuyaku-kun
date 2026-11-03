const numeric=value=>Number.isFinite(value)&&value>=0&&value<=60000?value:null;
const identified=row=>Number.isSafeInteger(row.recognitionRun)&&row.recognitionRun>0&&Number.isSafeInteger(row.segmentSequence)&&row.segmentSequence>0;
const key=row=>row.recognitionRun+':'+row.segmentSequence;
const sequence=(a,b)=>a.recognitionRun-b.recognitionRun||a.segmentSequence-b.segmentSequence;
export function recognitionAnalysis(session,requests,diagnostics){
 const unique=new Set(requests.filter(identified).map(key));
 const expected=session?.recognitionByPair?.reduce((n,row)=>n+(Number.isFinite(row.requests)?row.requests:0),0);
 const complete=Number.isSafeInteger(expected)&&expected>0&&expected===requests.length&&unique.size===requests.length&&requests.every(identified);
 const ordered=requests.filter(identified).slice().sort(sequence),first=complete?ordered[0]:null;
 const outcome=row=>{if(!row)return null;const excluded=diagnostics.find(d=>identified(d)&&key(d)===key(row)&&d.code==='filtered');return {status:row.code==='ok'?(excluded?'excluded':'response_without_recorded_exclusion'):'request_failed',excluded:excluded?.filterReason??null,languageDecision:excluded?.languageDecision??null};};
 const captions=(session?.recognitionSegments||[]).filter(r=>identified(r)&&Number.isFinite(r.firstDisplayMs)&&r.firstDisplayMs>=0);
 // This is the first recorded caption timing, not proof that a person read it.
 const caption=captions[0],prior=complete&&caption&&ordered.some(r=>key(r)===key(caption))?ordered.filter(r=>sequence(r,caption)<0):null;
 const stages=ordered.slice(-20).map(row=>{const order=diagnostics.filter(d=>identified(d)&&key(d)===key(row)&&d.code==='recognition_order').map(d=>numeric(d.orderWaitMs)).filter(n=>n!==null),request=numeric(row.clientRequestMs),provider=numeric(row.serverProviderMs);return {run:row.recognitionRun,segment:row.segmentSequence,requestMs:request,providerMs:provider,outsideProviderMs:request!==null&&provider!==null&&provider<=request?request-provider:null,captureTailMs:numeric(row.captureTailMs),slotWaitMs:numeric(row.clientSlotWaitMs),authMs:numeric(row.clientAuthMs),budgetWaitMs:numeric(row.serverBudgetWaitMs),orderWaitMs:order.length?Math.max(...order):null,budgetSettleDeferred:typeof row.budgetSettleDeferred==='boolean'?row.budgetSettleDeferred:null,outcome:outcome(row)};});
 return {first,ordered,complete,startup:{firstRequestOutcome:outcome(first),firstCaptionTiming:caption?{run:caption.recognitionRun,segment:caption.segmentSequence,firstDisplayMs:numeric(caption.firstDisplayMs),speechEndToDisplayMs:numeric(caption.totalMs)}:null,requestsBeforeFirstCaption:prior?.length??null,excludedBeforeFirstCaption:prior?prior.filter(r=>outcome(r)?.status==='excluded').length:null,note:'初回要求は全要求と区間番号が揃う場合だけ送信順で判定。初回字幕は保持した先頭の表示時間記録で、描画完了・読了を保証しません。'},stages:{requests:stages,note:'同じ認識開始番号・区間番号で対応付け。outsideProviderMsは同一HTTP要求の往復時間から提供元待ちを引いた値で、認証・予算予約・通信等を含みます。通信だけの時間ではありません。区間を合算せず、未計測・矛盾する差はnullです。'}};
}
