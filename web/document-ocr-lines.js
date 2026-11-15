/** Find line crops in a clean, horizontal text raster. Ambiguous layouts use page OCR. */
export function findHorizontalScanLines({data,width,height}) {
  const bands = [];
  for (let y=0; y<height; y++) {
    let left=width, right=-1;
    for (let x=0; x<width; x++) {
      const offset=(y*width+x)*4;
      if (data[offset+3]<128 || data[offset]+data[offset+1]+data[offset+2]>600) continue;
      left=Math.min(left,x);
      right=x;
    }
    if (right<left) continue;
    let band=bands.at(-1);
    if (!band || y-band.bottom>4) {
      band={left,right,top:y,bottom:y};
      bands.push(band);
    }
    band.left=Math.min(left,band.left);
    band.right=Math.max(right,band.right);
    band.bottom=y;
  }

  if (!bands.length || bands.length>12) return null;
  const lines=[];
  for (const {left,right,top,bottom} of bands) {
    const lineHeight=bottom-top+1;
    const lineWidth=right-left+1;
    if (lineHeight<10 || lineWidth<2*lineHeight || lineWidth>45*lineHeight) return null;
    let gap=0;
    for (let x=left; x<=right; x++) {
      let occupied=false;
      for (let y=top; y<=bottom && !occupied; y++) {
        const offset=(y*width+x)*4;
        occupied=data[offset+3]>=128 && data[offset]+data[offset+1]+data[offset+2]<=600;
      }
      gap=occupied ? 0 : gap+1;
      if (gap>2*lineHeight) return null;
    }
    const x=Math.max(0,left-4), y=Math.max(0,top-4);
    lines.push({x,y,width:Math.min(width,right+5)-x,height:Math.min(height,bottom+5)-y});
  }
  return lines;
}
