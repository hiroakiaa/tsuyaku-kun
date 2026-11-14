export function layoutPdfText(items) {
  const rows = [];
  const vertical = [];
  const rotated = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [a,b,c,d,x,y] = item.transform;
    if (item.dir==='ttb') {
      const column = vertical.find(candidate=>Math.abs(candidate.x-x)<=2);
      const fragment = {y,text:item.str};
      if (column) column.fragments.push(fragment);
      else vertical.push({x,fragments:[fragment]});
      continue;
    }
    if (Math.abs(b)+Math.abs(c)>0.5 || a<=0 || d<=0) {
      rotated.push(item.str);
      continue;
    }
    const row = rows.find(candidate=>Math.abs(candidate.y-y)<=2);
    const cell = {text:item.str,x,end:x+item.width,size:d};
    if (row) row.cells.push(cell);
    else rows.push({y,cells:[cell]});
  }
  // Some PDF generators position upright Japanese glyphs individually as horizontal text.
  const glyphs = rows.flatMap(({y,cells})=>cells.map(cell=>({...cell,y})));
  if (!vertical.length && !rotated.length && glyphs.length>=6 &&
      glyphs.every(({text})=>/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}]$/u.test(text.trim()))) {
    const columns = [];
    for (const glyph of glyphs) {
      const column = columns.find(candidate=>Math.abs(candidate[0].x-glyph.x)<=2);
      if (column) column.push(glyph);
      else columns.push([glyph]);
    }
    if (columns.every(column=>column.length>=3 && new Set(column.map(glyph=>glyph.y)).size===column.length)) {
      return columns.sort((a,b)=>b[0].x-a[0].x).map(column=>
        column.sort((a,b)=>b.y-a.y).map(glyph=>glyph.text.trim()).join('')).join('');
    }
  }
  const horizontal = rows.sort((a,b)=>b.y-a.y).map(({cells})=>{
    cells.sort((a,b)=>a.x-b.x);
    return cells.map((cell,i)=>{
      if (!i) return cell.text;
      const previous = cells[i-1];
      const gap = cell.x-previous.end;
      if (gap>Math.max(8,cell.size*0.8)) return ' | '+cell.text;
      return (gap>cell.size*0.16 ? ' ' : '')+cell.text;
    }).join('').trim();
  });
  const columns = vertical.sort((a,b)=>b.x-a.x).map(column=>
    column.fragments.sort((a,b)=>b.y-a.y).map(fragment=>fragment.text).join(''));
  return [...horizontal,...columns,...rotated].join('\n');
}
