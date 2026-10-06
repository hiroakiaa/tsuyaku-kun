// Only vocabulary is sent as recognition context, never past personal speech.
const school=['教科書','ページ','問い','問題','答え','丸付け','正解','整列','体育館','集合','出席番号','縦二列'];
export function recognitionHints(data,language='ja',unit=''){
  const japanese=language==='ja'||language==='ja-easy';
  if(!japanese&&language!=='en')return [];
  const math=unit==='数学'||/方程式|関数|図形/.test(unit);
  const words=[...(japanese&&math?['方程式','一次方程式','関数','小数','分数','平方根']:[]),...(japanese?school:[]),...(data.glossary||[]).map(r=>japanese?r.ja:r.en),...(data.terms||[]).filter(r=>math?r.category==='数学':r.category==='学校生活').slice(0,8).map(r=>japanese?r.ja:r.en)];
  return [...new Set(words.filter(x=>typeof x==='string').map(x=>x.normalize('NFKC').trim()).filter(x=>x&&x.length<=40))].slice(0,30);
}
export function safeRecognitionHints(header){
  let value;try{value=decodeURIComponent(String(header||'').slice(0,2400));}catch{return [];}
  return [...new Set(value.split(',').map(x=>x.trim()).filter(x=>x&&x.length<=40&&/^[\p{L}\p{M}\p{N} ()（）・ー＋−=]+$/u.test(x)))].slice(0,30);
}
