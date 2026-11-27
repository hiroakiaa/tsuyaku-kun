export function answerCitations(items,pageCount){
  const seen=new Set();return items.flatMap(item=>item.answer?item.evidence??[]:[]).filter(source=>{
    if(!Number.isInteger(source.page)||source.page<1||source.page>pageCount||!source.quote?.trim())return false;
    const key=JSON.stringify([source.page,source.quote]);if(seen.has(key))return false;seen.add(key);return true;
  }).map(({page,quote})=>({page,quote}));
}
export function citationOnPage(sequence,page){
  const quotes=sequence.filter(source=>source.page===page).map(source=>source.quote);
  return quotes.length?{page,quote:[...new Set(quotes)].join('\n'),quotes:[...new Set(quotes)]}:undefined;
}

export function citationRanges(text, sourceQuote, normalize) {
    if(Array.isArray(sourceQuote))return sourceQuote.flatMap(quote=>citationRanges(text,quote,normalize));
    const locate = source=>{
      const literal = normalize(source);
      const quote = text.includes(literal) ? literal : literal.replaceAll('|','');
      const start = quote ? text.indexOf(quote) : -1;
      if (start<0 || text.indexOf(quote,start+1)>=0) return null;
      return {start,end:start+quote.length};
    };
    const whole = locate(sourceQuote);
    return whole ? [whole] : sourceQuote.split(/\n|\s\|\s|[、。，．！？!?;；]/u)
      .filter(fragment=>{const text=normalize(fragment);return text.length>=8||(text.length>=7&&(text.match(/\p{Script=Han}/gu)||[]).length>=2);})
      .map(locate).filter(Boolean);
  }
