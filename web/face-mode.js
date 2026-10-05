export function speakerInfo(side,selfLanguage,otherLanguage){if(!['self','other'].includes(side))throw Error('話し手を確認してください。');return {speaker:side==='self'?'自分':'相手',language:side==='self'?selfLanguage:otherLanguage};}
export function speakerCaption(side,selfLanguage,otherLanguage){const s=speakerInfo(side,selfLanguage,otherLanguage);return {source:s.language,speakerSide:side};}
