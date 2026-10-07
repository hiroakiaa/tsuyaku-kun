// Reject confirmed nonverbal Japanese outputs, never a meaningful short reply.
export function nonSpeechReason(result,language){
 const text=String(result?.text||'').normalize('NFKC').trim();
 if(!text)return 'empty';
 const segments=result?.segments||result?.transcription_info?.segments;
 if(Array.isArray(segments)&&segments.length&&segments.every(s=>Number.isFinite(s.no_speech_prob)&&s.no_speech_prob>=.6))return 'model_no_speech';
 if(!['ja','ja-easy'].includes(language))return null;
 const compact=text.replace(/[\s、。,.!！…]/g,'');
 if(/^(?:ん|ン|はっくしょん|ハックション|ハクション|くしゅん|クシュン)+$/.test(compact))return 'nonverbal';
 return null;
}
