// Only vocabulary is sent as recognition context, never past personal speech.
const school=['教科書','ページ','問い','問題','答え','丸付け','正解','整列','体育館','集合','出席番号','縦二列'];
export function recognitionHints(data,language='ja',unit=''){
  const japanese=language==='ja'||language==='ja-easy';
  const field=({en:'enText',es:'esText',pt:'ptText',vi:'viText','zh-CN':'zhText',ko:'koText',tl:'tlText',fil:'tlText',id:'idText',ne:'neText'})[language];
  if(!japanese&&!field)return [];
  const word=r=>japanese?r.ja:(r[field]||(language==='en'?r.en:''));
  const math=unit==='数学'||/方程式|関数|図形/.test(unit);
  const words=[...(japanese&&math?['方程式','一次方程式','関数','小数','分数','平方根']:[]),...(japanese?school:[]),...(data.glossary||[]).map(r=>word(r)),...(data.terms||[]).filter(r=>math?r.category==='数学':r.category==='学校生活').slice(0,8).map(r=>word(r))];
  return [...new Set(words.filter(x=>typeof x==='string').map(x=>x.normalize('NFKC').trim()).filter(x=>x&&x.length<=40))].slice(0,30);
}
export function safeRecognitionHints(header){
  let value;try{value=decodeURIComponent(String(header||'').slice(0,2400));}catch{return [];}
  return [...new Set(value.split(',').map(x=>x.trim()).filter(x=>x&&x.length<=40&&/^[\p{L}\p{M}\p{N} ()（）・ー＋−=]+$/u.test(x)))].slice(0,30);
}
