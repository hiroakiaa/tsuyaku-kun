// Conservative checks: warnings are review prompts, never accuracy scores.
export const QUALITY_VERSION=1;
export function inspectTranslations(text,source,targets,translations={}){
 const normalize=s=>String(s||'').normalize('NFKC');
 const numbers=s=>(normalize(s).replaceAll('−','-').replace(/(?<=\d)[,\s](?=\d{3}(?:\D|$))/g,'').match(/-?\d+(?:[.,]\d+)?/g)||[]).map(n=>String(Number(n.replace(',','.')))).sort();
 const original=numbers(text),warnings=[],checkedLanguages=[],unmeasuredLanguages=[];
 const negative=source==='ja'&&/(?:必要(?:あり|はあり)ません|必要ない|不要|禁止|しないで|持ってこないで)/.test(text)&&!/(?:ないわけ|ないことはない)/.test(text);
 const negation={en:/\b(?:not|no|never|without|don['’]t|mustn['’]t|unnecessary|prohibited|forbidden)\b/i,es:/\b(?:no|nunca|sin|innecesari[oa]|prohibid[oa])\b/i,pt:/\b(?:não|nunca|sem|desnecessári[oa]|proibid[oa])\b/i,'ja-easy':/ない|ません|不要|禁止/};
 for(const language of new Set(targets||[])){
  if(language===source)continue;
  const value=translations?.[language];
  if(typeof value!=='string'||!value.trim()){warnings.push({language,code:'missing_translation'});continue;}
  checkedLanguages.push(language);
  if(source==='ja'&&['en','es','pt'].includes(language)&&/[\u3040-\u30ff\u3400-\u9fff]/u.test(value))warnings.push({language,code:'source_script_remaining'});
  // Word-form numbers and dates require semantic interpretation: do not guess.
  const wordNumbers=/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|january|february|march|april|may|june|july|august|september|october|november|december|uno|dos|tres|cuatro|cinco|um|dois|três|quatro|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|mayo|junio|julio|septiembre|octubre|diciembre)\b/i;
  if(original.length){if(!['en','es','pt','ja-easy'].includes(language)||wordNumbers.test(value))unmeasuredLanguages.push(language);else if(JSON.stringify(original)!==JSON.stringify(numbers(value)))warnings.push({language,code:'number_mismatch'});}
  if(negative){if(!negation[language]){if(!unmeasuredLanguages.includes(language))unmeasuredLanguages.push(language);}else if(!negation[language].test(normalize(value)))warnings.push({language,code:'negation_check'});}
 }
 return {version:QUALITY_VERSION,checkedLanguages,unmeasuredLanguages,warnings};
}
export function qualityMessage(code){return {source_script_remaining:'日本語の文字が残っています。訳を確認してください',number_mismatch:'数字・日付を確認してください',negation_check:'否定の意味を確認してください',missing_translation:'訳がありません'}[code]||'訳を確認してください';}
