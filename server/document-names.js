const generic=new Set(['専門学校','高等学校','中学校','小学校','市区町村','特別区','株式会社','市役所']);
export function documentNames(text){
 const names=new Set(),source=String(text).normalize('NFC');
 const add=value=>{value=value.trim();if(value.length>=2&&value.length<=40&&!generic.has(value)&&!/(?:未定|不明|ありません|決まって|記入|入力|してください|非公開|空欄)/u.test(value))names.add(value);};
 const field=/(?:氏名|名前|申込者名|参加者名|担当者名|学校名|校名|会社名|組織名|施設名|開催場所|住所)(?:\s*[:：|]\s*|は\s*)([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}々ヶー・ \t]{2,40}?)(?=です(?:[。\n|、,]|$)|である(?:[。\n|、,]|$)|[。\n|、,]|$)/gu;
 for(const [,value]of source.matchAll(field))add(value);
 for(const [value]of source.matchAll(/[\p{Script=Han}\p{Script=Katakana}々ヶー]{2,30}(?:高等学校|技術学園|学園|中学校|小学校|高校|大学|専門学校|病院|市役所|株式会社|都|県|市|町|村|区)(?![\p{Script=Han}々])/gu))add(value);
 return [...names].sort((a,b)=>b.length-a.length||a.localeCompare(b)).slice(0,64);
}
export function protectDocumentNames(text,names=[]){
 let prefix='⟦DN';while(text.includes(prefix))prefix+='_';
 const entries=names.filter(name=>text.includes(name)).map((name,index)=>({name,token:prefix+index+'⟧'}));
 let protectedText=text;for(const {name,token}of entries)protectedText=protectedText.replaceAll(name,token);
 return {text:protectedText,restore(raw,keys){
  if(!entries.length)return raw;
  const check=(source,target)=>{for(const {token}of entries)if(source.includes(token)&&!target?.includes(token))throw Error('固有名詞の対応を再確認しています。');};
  if(keys){const parsed=JSON.parse(protectedText),source=parsed.entries??parsed,target=JSON.parse(raw);for(const key of keys)check(source[key]??'',target[key]);}
  else check(protectedText,raw);
  let restored=raw;for(const {name,token}of entries)restored=restored.replaceAll(token,name);return restored;
 }};
}
