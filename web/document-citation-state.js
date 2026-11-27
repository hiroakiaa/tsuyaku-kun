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
