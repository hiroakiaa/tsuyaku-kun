export function lookupPdfTableValue(pages,question) {
  const query=question.normalize('NFKC').trim().toLowerCase().replace(/[?。]$/u,'');
  const verb=/^when does (?:the )?(.+?) (open|close)$/u.exec(query);
  const field=/^when is the (.+?) for (?:the )?(.+)$/u.exec(query);
  const japanese=/^([^の、]+)の([^の、]+?時刻)(?:は(?:何時(?:ですか)?)?)?$/u.exec(query);
  const fee=/^([^の、]+)の([^、]+?(?:利用料|料金|手数料))(?:はいくら(?:ですか)?|は)?$/u.exec(query);
  if (!verb && !field && !japanese && !fee) return null;
  const subject=verb?.[1] ?? field?.[2] ?? japanese?.[1] ?? fee[1];
  const column=verb ? (verb[2]==='open' ? 'opening' : 'closing') : field?.[1] ?? japanese?.[2] ?? fee[2].replace(/の/gu,'');
  const columnNames = new Set([column, japanese ? column.replace(/時刻$/u,'') : column+' time']);
  const matches=[];
  const isTime = value=>/^(?:\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|\d{1,2}:\d{2}|(?:午前|午後)?\s*\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?)$/iu.test(value.normalize('NFKC').trim());
  const isValue = fee ? value=>/^(?:\d[\d,]*(?:\.\d+)?\s*(?:万)?円)$/u.test(value.normalize('NFKC').trim()) : isTime;
  let continuation;
  for (const [index,page] of pages.entries()) {
    const lines=page.split('\n').filter(line=>line.trim());
    const cells=lines.map(line=>line.split(' | '));
    const header=cells[0] ?? [];
    const headingText = value=>value.normalize('NFKC').trim().toLowerCase();
    const lower = cells[1];
    let start=1;
    let headings=header;
    if (lower?.length===header.length && lower.slice(1).every(cell=>cell.trim() && !isValue(cell)) &&
        cells[2]?.length===header.length && cells[2].slice(1).every(isValue) &&
        new Set(lower.slice(1).map(headingText)).size<lower.length-1) {
      let group='';
      headings=header.map((cell,i)=>{
        if (!i) return lower[0] || cell;
        if (cell.trim()) group=cell.trim();
        return group+lower[i].trim();
      });
      start=2;
    }
    const columns=headings.flatMap((cell,i)=>i>0 && columnNames.has(headingText(cell)) ? [i] : []);
    const ownHeading=columns.length===1;
    const table=ownHeading ? {
      header:lines.slice(0,start).join('\n'),page:index+1,width:header.length,
      column:columns[0],label:headings[columns[0]],
    } : continuation;
    continuation=undefined;
    if (!table) continue;
    if (!ownHeading) start=0;
    const rows=cells.slice(start);
    if (!rows.length || rows.some(row=>row.length!==table.width)) continue;
    // Carry headings only when every row on both sides has the same value column.
    const consistent=rows.every(row=>row[0].trim() && isValue(row[table.column]));
    if (!ownHeading && !consistent) continue;
    if (consistent) continuation=table;
    for (const [offset,row] of rows.entries()) {
      if (row[0].normalize('NFKC').trim().toLowerCase()!==subject || !isValue(row[table.column])) continue;
      matches.push({label:table.label,answer:row[table.column].trim(),evidence:[
        {page:index+1,quote:lines[start+offset]},{page:table.page,quote:table.header},
      ]});
    }
  }
  return matches.length===1 ? matches[0] : null;
}
