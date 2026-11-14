export function layoutPdfText(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [a,b,c,d,x,y] = item.transform;
    if (Math.abs(b)+Math.abs(c)>0.5 || a<=0 || d<=0 || item.dir==='ttb') {
      return items.map(piece=>(piece.str ?? '')+(piece.hasEOL ? '\n' : '')).join('').trim();
    }
    const row = rows.find(candidate=>Math.abs(candidate.y-y)<=2);
    const cell = {text:item.str,x,end:x+item.width,size:d};
    if (row) row.cells.push(cell);
    else rows.push({y,cells:[cell]});
  }
  return rows.sort((a,b)=>b.y-a.y).map(({cells})=>{
    cells.sort((a,b)=>a.x-b.x);
    return cells.map((cell,i)=>{
      if (!i) return cell.text;
      const previous = cells[i-1];
      const gap = cell.x-previous.end;
      if (gap>Math.max(8,cell.size*0.8)) return ' | '+cell.text;
      return (gap>cell.size*0.16 ? ' ' : '')+cell.text;
    }).join('').trim();
  }).join('\n');
}
