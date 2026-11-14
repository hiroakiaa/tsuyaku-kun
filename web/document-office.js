async function entries(file) {
  const bytes = await file.arrayBuffer();
  const view = new DataView(bytes);
  let end = bytes.byteLength-22;
  while (end>=Math.max(0,bytes.byteLength-65557) && view.getUint32(end,true)!==0x06054b50) end--;
  if (end<0 || view.getUint32(end,true)!==0x06054b50) throw Error('Officeファイルを開けません。');
  let offset = view.getUint32(end+16,true);
  const files = new Map();
  for(let i=0;i<view.getUint16(end+10,true);i++){
    if(view.getUint32(offset,true)!==0x02014b50) throw Error('Officeファイルを開けません。');
    const length=view.getUint16(offset+28,true);
    const name=new TextDecoder().decode(bytes.slice(offset+46,offset+46+length));
    files.set(name,offset);
    offset+=46+length+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
  }
  return {files,async read(name){
    const entry=files.get(name);
    if(entry===undefined) return null;
    const size=view.getUint32(entry+24,true);
    if(size>2_000_000) throw Error('Officeファイルの内容が大きすぎます。');
    const local=view.getUint32(entry+42,true);
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    const data=bytes.slice(start,start+view.getUint32(entry+20,true));
    const method=view.getUint16(entry+10,true);
    if(method!==0 && method!==8) throw Error('Officeファイルの圧縮方式に対応していません。');
    let text;
    if(method===0) text=new TextDecoder().decode(data);
    else {
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const decoder=new TextDecoder();
      let count=0;
      text='';
      try {
        for(;;){
          const {done,value}=await reader.read();
          if(done) break;
          count+=value.length;
          if(count>2_000_000) throw Error('Officeファイルの内容が大きすぎます。');
          text+=decoder.decode(value,{stream:true});
        }
        text+=decoder.decode();
      } finally { await reader.cancel(); }
    }
    return new DOMParser().parseFromString(text,'application/xml');
  }};
}
const tags=(node,name)=>Array.from(node?.getElementsByTagNameNS('*',name) ?? []);
const strings=node=>tags(node,'t').map(t=>t.textContent).join('');

export async function officePages(file){
  const zip=await entries(file);
  if(/\.docx$/i.test(file.name)){
    const doc=await zip.read('word/document.xml');
    return [tags(doc,'p').map(strings).join('\n')];
  }
  const shared=tags(await zip.read('xl/sharedStrings.xml'),'si').map(strings);
  const book=await zip.read('xl/workbook.xml');
  const relationships=tags(await zip.read('xl/_rels/workbook.xml.rels'),'Relationship');
  const sheets=tags(book,'sheet');
  if(sheets.length>40) throw Error('Excelは40シートまでです。');
  const pages=await Promise.all(sheets.map(async sheet=>{
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target=relationships.find(rel=>rel.getAttribute('Id')===id)?.getAttribute('Target');
    if(!target) return '';
    const path=new URL(target,'https://office.invalid/xl/').pathname.slice(1);
    if(!path.startsWith('xl/worksheets/')) return '';
    const xml=await zip.read(path);
    return sheet.getAttribute('name')+'\n'+tags(xml,'row').map(row=>tags(row,'c').map(cell=>{
      const value=tags(cell,'v')[0]?.textContent;
      const type=cell.getAttribute('t');
      const content=type==='s' ? shared[Number(value)] ?? '' : type==='inlineStr' ? strings(cell) : value ?? '';
      return content.trim() ? cell.getAttribute('r')+' '+content : '';
    }).filter(Boolean).join(' | ')).filter(Boolean).join('\n');
  }));
  if(pages.reduce((total,page)=>total+page.length,0)>22_000) {
    throw Error('Excelの本文が22,000文字を超えています。必要なシートや行だけを別のExcelに保存して登録してください。');
  }
  return pages;
}
