export function callCaptionLanguages(language,english=true){const codes=language==='ja-easy'?['ja','ja-easy','en']:language==='en'?['en']:[language,'en'];return english||language==='en'?codes:codes.filter(code=>code!=='en');}
export function chatCaptionLanguages(record,language,selfId,english=true){return record.id.startsWith(selfId+'_')?[record.source||language]:callCaptionLanguages(language,english);}
// Interim and untranslated fragments never enter the transcript list.
export function isDisplayableCaption(record){return !!record?.final&&record.status==='ready'&&!!record.text?.trim()&&!!record.translations&&Object.values(record.translations).some(text=>typeof text==='string'&&!!text.trim());}
