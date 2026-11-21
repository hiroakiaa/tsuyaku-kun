const digits=new Map([...('〇零一二三四五六七八九')].map((char,index)=>[char,Math.max(0,index-1)]));
function japaneseInteger(text){
 if(/^[〇零一二三四五六七八九]+$/u.test(text))return Number([...text].map(char=>digits.get(char)).join(''));
 let total=0,section=0,value=0,lastSmall=10000,lastLarge=Infinity;
 const small={十:10,百:100,千:1000},large={万:10000,億:100000000};
 for(const char of text){
  if(digits.has(char)){if(value)return null;value=digits.get(char);}
  else if(small[char]){const unit=small[char];if(unit>=lastSmall)return null;section+=(value||1)*unit;value=0;lastSmall=unit;}
  else if(large[char]){const unit=large[char];if(unit>=lastLarge)return null;total+=(section+value||1)*unit;section=value=0;lastSmall=10000;lastLarge=unit;}
  else return null;
 }
 const result=total+section+value;return Number.isSafeInteger(result)?result:null;
}
export const CURRENCY_UNITS=['円','USD','EUR','$','GBP','CHF','CNY'];
function extendedNumericNotation(value){
 const amount='([0-9][0-9,]*(?:\\.[0-9]+)?|\\.[0-9]+)';
 for(const [code,prefix,suffix]of [['GBP','£|(?<![A-Za-z])GBP(?![A-Za-z])','British pounds?|pounds? sterling|GBP'],['CHF','(?<![A-Za-z])CHF(?![A-Za-z])','Swiss francs?|CHF'],['CNY','(?<![A-Za-z])(?:CNY|RMB)(?![A-Za-z])','Chinese yuan|renminbi|CNY|RMB']]){value=value.replace(new RegExp('(?:'+prefix+')\\s*'+amount,'giu'),(_,n)=>n+code).replace(new RegExp(amount+'\\s*(?:'+suffix+')\\b','giu'),(_,n)=>n+code);}
 value=value.replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:people|persons?|participants?|attendees?|students?)\b/giu,'$1人').replace(/(?<![0-9.])\.(\d+)(?=\s*(?:円|USD|EUR|GBP|CHF|CNY|\$))/gu,'0.$1');
 const units=['円','USD','EUR','GBP','CHF','CNY','\\$','人','名','%',...Object.keys(dimensions).sort((a,b)=>b.length-a.length)].join('|'),quantity='([+-]?(?:[0-9][0-9,]*(?:\\.[0-9]+)?|\\.[0-9]+)\\s*(?:'+units+')(?![A-Za-z]))';
 for(const [words,comparison]of [['at least|no fewer than','以上'],['at most|no more than|up to','以下'],['less than|under|below','未満'],['more than|over|above','超']])value=value.replace(new RegExp('\\b(?:'+words+')\\s+'+quantity,'giu'),(_,q)=>q+comparison);
 return value.replace(new RegExp(quantity+'\\s+or (?:more|greater)\\b','giu'),(_,q)=>q+'以上').replace(new RegExp(quantity+'\\s+or (?:less|fewer)\\b','giu'),(_,q)=>q+'以下');
}
export function numericEvidenceVersion(pages){return /(?:\b(?:GBP|CHF|CNY|RMB)\s*\d|£\s*[0-9.]|\d\s*(?:British pounds?|pounds? sterling|Swiss francs?|Chinese yuan|renminbi|GBP|CHF|CNY|RMB|people|persons?|participants?|attendees?|students?)\b|\b(?:at least|at most|no more than|no fewer than|up to|less than|more than|under|below|over|above)\s+\d|\d\s*[^\n]{0,12}\s+or (?:more|less|fewer)\b)/iu.test(pages.join('\n'))?37:35;}
export function numericText(text){return extendedNumericNotation(String(text).normalize('NFKC').replaceAll('−','-')
 .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:Japanese yen|yen|JPY)\b/giu,'$1円')
 .replace(/(?:JPY|¥)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gu,'$1円')
 .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:US dollars?|USD)\b/giu,'$1USD')
 .replace(/(?:USD|US\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gu,'$1USD')
 .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*dollars?\b/giu,'$1$')
 .replace(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gu,'$1$')
 .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:euros?|EUR)\b/giu,'$1EUR')
 .replace(/(?:EUR|€)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gu,'$1EUR')
 .replace(/(?<![0-9.])[〇零一二三四五六七八九十百千万億]+(?=円|人|名|%|年|月|日|時|分|秒|回|か月|kg|cm)/gu,value=>{const number=japaneseInteger(value);return number===null?value:String(number);}));}
const dimensions={kg:['mass',1000],g:['mass',1],mg:['mass',.001],km:['length',100000],m:['length',100],cm:['length',1],mm:['length',.1],L:['volume',1000],mL:['volume',1],TB:['bytes',1e12],GB:['bytes',1e9],MB:['bytes',1e6],KB:['bytes',1e3],B:['bytes',1],GiB:['bytes',1024**3],MiB:['bytes',1024**2],KiB:['bytes',1024]};
for(const [unit,aliases]of Object.entries({kg:['kilogram','kilograms','キログラム'],g:['gram','grams','グラム'],mg:['milligram','milligrams','ミリグラム'],km:['kilometer','kilometers','kilometre','kilometres'],m:['meter','meters','metre','metres','メートル'],cm:['centimeter','centimeters','centimetre','centimetres','センチメートル'],L:['liter','liters','litre','litres'],MB:['megabyte','megabytes','メガバイト'],GB:['gigabyte','gigabytes','ギガバイト'],KB:['kilobyte','kilobytes']}))for(const alias of aliases)dimensions[alias]=dimensions[unit];
for(const [unit,scale]of [['時間',3600],['分',60],['秒',1],['hour',3600],['hours',3600],['minute',60],['minutes',60],['second',1],['seconds',1]])dimensions[unit]=['duration',scale];
const measurePattern=new RegExp('([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)\\s*('+Object.keys(dimensions).sort((a,b)=>b.length-a.length).join('|')+')(?![A-Za-z])','gu');
export function measures(text){const value=numericText(text);return [...value.matchAll(measurePattern)].map(match=>{const [,amount,unit]=match,[kind,factor]=dimensions[unit],comparison=/^(以上|以下|未満|超)/u.exec(value.slice(match.index+match[0].length))?.[1];return {kind,value:Number(amount.replaceAll(',',''))*factor,notation:amount+' '+unit,...(comparison?{comparison}:{})};});}

export function dates(text){
 const value=numericText(text).replace(/(令和|平成|昭和|R|H|S)(元|\d{1,2})年度?/gu,(_,era,year)=>String(({令和:2018,平成:1988,昭和:1925,R:2018,H:1988,S:1925}[era])+Number(year==='元'?1:year))+'年'),result=[];
 const add=(year,month,day)=>{year=year?Number(year):null;month=month==null?null:Number(month);day=day==null?null:Number(day);if((year||month||day)&&(month===null||month>=1&&month<=12)&&(day===null||day>=1&&day<=31))result.push({year,month,day});};
 for(const [,year,month,day]of value.matchAll(/(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日/gu))add(year,month,day);
 for(const [,year,month,day]of value.matchAll(/(?<!\d)(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})(?!\d)/gu))add(year,month,day);
 for(const [,day]of value.matchAll(/(?<!\d)(?<!\d月)(\d{1,2})日(?!間)/gu))add(null,null,day);
 for(const [,month]of value.matchAll(/(?<!\d)(\d{1,2})月(?!\s*\d{1,2}日|間)/gu))add(null,month,null);
 for(const [,year]of value.matchAll(/(?<!\d)(\d{4})年(?!\s*\d{1,2}月)/gu))add(year,null,null);
 const months='January February March April May June July August September October November December'.split(' ');
 for(let i=0;i<months.length;i++){const pattern=new RegExp('\\b(?:'+months[i]+'|'+months[i].slice(0,3)+'\\.?)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b','giu');for(const [,day,year]of value.matchAll(pattern))add(year,i+1,day);}
 return result;
}
const sameValue=(a,b)=>Number.isSafeInteger(a)&&Number.isSafeInteger(b)?a===b:Math.abs(a-b)<=Number.EPSILON*16*Math.max(1,Math.abs(a),Math.abs(b));
export function requestedMeasureConversion(question,answer,evidence){
 const units=Object.keys(dimensions).sort((a,b)=>b.length-a.length),pattern=new RegExp('(?:何|how many\\s+|in\\s+|to\\s+)('+units.join('|')+')|('+units.join('|')+')(?:単位|表記|で|に換算)','iu'),match=pattern.exec(question);
 if(!match)return null;const unit=units.find(unit=>unit.toLowerCase()===(match[1]??match[2]).toLowerCase()),[kind,factor]=dimensions[unit],answerMeasures=measures(answer);
 if(!answerMeasures.length||answerMeasures.some(measure=>measure.kind!==kind))return null;
 const sources=evidence.flatMap(({quote})=>measures(quote)).filter(measure=>measure.kind===kind);
 if(!sources.length||!sources.every(source=>sameValue(source.value,sources[0].value)&&source.comparison===sources[0].comparison)||Math.abs(sources[0].value)>Number.MAX_SAFE_INTEGER)return null;
 const value=Number((sources[0].value/factor).toPrecision(12));if(!Number.isFinite(value)||/[eE]/u.test(String(value)))return null;
 const comparison=sources[0].comparison??'';return sources[0].notation+comparison+' = '+value+' '+unit+comparison;
}
export function supportsDatesAndMeasures(answer,evidence,question=''){
 const sources=evidence.map(source=>source.quote),sourceMeasures=sources.flatMap(measures);
 if(!measures(answer).every(({kind,value,comparison})=>sourceMeasures.some(source=>source.kind===kind&&sameValue(source.value,value)&&(!comparison||!source.comparison||comparison===source.comparison))))return false;
 const sourceDates=sources.flatMap(dates);
 if(!sourceDates.length&&!/いつ|何月|何日|日程|締切|予定|開催|日付|\b(?:when|date|deadline)\b/iu.test(question))return true;
 return dates(answer).every(date=>sourceDates.some(source=>(!date.month||date.month===source.month)&&(!date.day||date.day===source.day)&&(!date.year||date.year===source.year)));
}
