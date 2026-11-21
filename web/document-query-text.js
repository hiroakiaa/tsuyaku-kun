const invisible=/[\u00ad\u200b\u2060\ufeff]/gu;
export function evidenceMatchText(value){return String(value).normalize('NFKC').replace(invisible,'').replace(/\s+/gu,'');}
export function documentSearchText(value){return String(value).normalize('NFKC').replace(invisible,'').replace(/(?<=[A-Za-z])-\s*\n\s*(?=[A-Za-z])/gu,'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC').toLowerCase();}
export function requestedDocumentPages(question,count){
 const text=String(question).normalize('NFKC');if(!Number.isInteger(count)||count<1)return null;
 if(/(?:資料|文書|PDF).{0,6}(?:何ページ|\d+ページ(?:です|あります|ある|で構成))/u.test(text))return null;
 const spans=[],range=/(?:第)?(\d+)\s*(?:〜|~|–|—|-)\s*(\d+)\s*(?:ページ|頁)|\bpages?\s+(\d+)\s*(?:to|through|–|—|-)\s*(\d+)\b/giu;
 for(const m of text.matchAll(range))spans.push([Number(m[1]??m[3]),Number(m[2]??m[4])]);
 for(const m of text.matchAll(/(?:第)?(\d+)\s*(?:ページ|頁)(?!\s*(?:です|あります|ある))|\bpage\s+(\d+)\b|\bp\.\s*(\d+)\b/giu)){if(!spans.some(([a,b])=>Number(m[1]??m[2]??m[3])>=a&&Number(m[1]??m[2]??m[3])<=b))spans.push([Number(m[1]??m[2]??m[3]),Number(m[1]??m[2]??m[3])]);}
 if(!spans.length)return null;if(spans.some(([a,b])=>!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b>count||b<a))return {pages:[],invalid:true};
 return {pages:[...new Set(spans.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i)))].sort((a,b)=>a-b),invalid:false};
}
