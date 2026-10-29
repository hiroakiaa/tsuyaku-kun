// Shared output safeguards. No model call, text logging or automatic source rewriting.
export const QUALITY_VERSION=3;
export const REVIEW_LABELS={ja:'訳を確認してください','ja-easy':'意味を確認してください',en:'Translation needs review',es:'Revisar traducción',pt:'Rever tradução',de:'Übersetzung prüfen',vi:'Kiểm tra bản dịch','zh-CN':'请核对翻译',ko:'번역 확인 필요',tl:'Suriin ang salin',fil:'Suriin ang salin',id:'Periksa terjemahan',ne:'अनुवाद जाँच गर्नुहोस्'};
export const markerPattern=()=>/[_＿]{1,2}\s*UNCLEAR\s*[_＿]\s*([0-9０-９]+)\s*[_＿]{1,2}/gi;
export function hasInternalMarker(value){return typeof value==='string'&&markerPattern().test(value);}
export function reviewFallback(source,language){return '〔'+(REVIEW_LABELS[language]||REVIEW_LABELS.en)+'〕 '+source;}
export function needsTranslationReview(value){return typeof value==='string'&&Object.values(REVIEW_LABELS).some(label=>value.startsWith('〔'+label+'〕'));}
export function usableTranslation(value){return typeof value==='string'&&!!value.trim()&&!/^[#=]/.test(value)&&!hasInternalMarker(value)&&!needsTranslationReview(value)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
export function guardCaptionTranslation(record){
 const invalid=Object.entries(record.translations||{}).some(([code,value])=>code!==record.source&&(hasInternalMarker(value)||needsTranslationReview(value)||typeof value==='string'&&/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)));
 if(!invalid)return record;
 return {...record,status:'failed',continuing:false,failureRecorded:true,qualityFailure:true,translations:{[record.source]:record.text},error:'訳を確認できませんでした。原文を残しています。',quality:{...record.quality,version:record.quality?.version||QUALITY_VERSION,unmeasuredLanguages:record.quality?.unmeasuredLanguages||[],warnings:[...(record.quality?.warnings||[]),{code:'internal_marker'}]}};
}
