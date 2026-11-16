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
  rows.sort((a,b)=>b.y-a.y);
  const formatRow = cells=>{
    cells.sort((a,b)=>a.x-b.x);
    return cells.map((cell,i)=>{
      if (!i) return cell.text;
      const previous = cells[i-1];
      const gap = cell.x-previous.end;
      if (gap>Math.max(8,cell.size*0.8)) return ' | '+cell.text;
      return (gap>cell.size*0.16 ? ' ' : '')+cell.text;
    }).join('').trim();
  };
  let horizontal = rows.map(({cells})=>formatRow(cells));
  const groupedRows = rows.map(({y,cells})=>{
    const groups=[];
    for (const cell of cells) {
      const previous=groups.at(-1);
      const gap=previous ? cell.x-previous.end : Infinity;
      if (gap>Math.max(8,cell.size*0.8)) groups.push({...cell});
      else {
        previous.text += (gap>cell.size*0.16 ? ' ' : '')+cell.text;
        previous.end = Math.max(previous.end,cell.end);
      }
    }
    return {y,cells:groups};
  });
  // Preserve empty cells when several adjacent rows share the same column anchors.
  for (let first=0; first+2<rows.length; first++) {
    const header = groupedRows[first].cells;
    const size = Math.max(...header.map(cell=>cell.size));
    // A centered header may start at a different x coordinate from its data.
    const completeRow = groupedRows.slice(first+1,first+4).find(({cells,y})=>
      rows[first].y-y<=size*6 && cells.length===header.length &&
      cells.every((cell,i)=>Math.abs(cell.x-header[i].x)<=size*2.5));
    const anchors = completeRow?.cells ?? header;
    if (anchors.length<3 || anchors.some((cell,i)=>i && cell.x-anchors[i-1].end<=Math.max(8,cell.size))) continue;
    const aligned = [];
    for (let index=first+1; index<rows.length; index++) {
      const {cells,y} = groupedRows[index];
      if (rows[index-1].y-y>Math.max(...anchors.map(cell=>cell.size))*3) break;
      const positions = cells.map(cell=>anchors.findIndex(anchor=>Math.abs(anchor.x-cell.x)<=3));
      if (positions.length<2 || positions[0]!==0 || positions.includes(-1) ||
          new Set(positions).size!==positions.length) break;
      aligned.push({index,cells,positions});
    }
    if (aligned.length<2) continue;
    for (const {index,cells,positions} of aligned) {
      const values = anchors.map((_,column)=>cells[positions.indexOf(column)]?.text.trim() ?? '');
      horizontal[index] = values.join(' | ');
    }
    first += aligned.length;
  }
  const titles = rows[0]?.cells;
  if (titles?.length===2 && rows.length>=4 && !vertical.length && !rotated.length) {
    const rightStart = titles[1].x;
    const regularSize = Math.max(...rows.slice(1).flatMap(row=>row.cells.map(cell=>cell.size)));
    const split = rows.map(({cells})=>[
      cells.filter(cell=>cell.x<rightStart-2),cells.filter(cell=>cell.x>=rightStart-2),
    ]);
    const gutter = Math.min(...split.map(([left,right])=>left.length && right.length
      ? right[0].x-Math.max(...left.map(cell=>cell.end)) : 0));
    if (titles.every(title=>title.size>=regularSize*1.2) && gutter>regularSize*2) {
      horizontal = [...split.map(([left])=>formatRow(left)), '', ...split.map(([,right])=>formatRow(right))];
    }
  }
  const columns = vertical.sort((a,b)=>b.x-a.x).map(column=>
    column.fragments.sort((a,b)=>b.y-a.y).map(fragment=>fragment.text).join(''));
  return [...horizontal,...columns,...rotated].join('\n');
}
