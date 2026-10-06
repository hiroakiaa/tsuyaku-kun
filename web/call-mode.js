export function callCaptionLanguages(language){return language==='en'?['en']:[language,'en'];}
// Interim and untranslated fragments never enter the transcript list.
export function isDisplayableCaption(record){return !!record?.final&&record.status==='ready'&&!!record.text?.trim()&&!!record.translations&&Object.values(record.translations).some(text=>typeof text==='string'&&!!text.trim());}
