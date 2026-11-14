export async function readTaggedTables(rendered) {
  if (!(await rendered.getMarkInfo())?.Marked) return [];
  const {PDFDocument,PDFName,PDFArray,PDFDict,PDFRef}=await import('./document-pdf-lib.mjs');
  const pdf=await PDFDocument.load(await rendered.getData());
  const root=pdf.catalog.get(PDFName.of('StructTreeRoot'));
  if (!root) return [];
  const textById=new Map();
  for(let number=1;number<=rendered.numPages;number++){
    const page=await rendered.getPage(number);
    const {items}=await page.getTextContent({includeMarkedContent:true});
    const active=[];
    for(const item of items){
      if(item.type==='beginMarkedContentProps' || item.type==='beginMarkedContent') active.push(item.id ?? active.at(-1));
      else if(item.type==='endMarkedContent') active.pop();
      else if(item.str && active.at(-1)){
        const id=active.at(-1);
        textById.set(id,(textById.get(id)??'')+item.str);
      }
    }
  }
  const tables=[];
  const pageRefs=pdf.getPages().map(page=>page.ref.toString());
  const name=PDFName.of;
  const visited=new Set();
  const walk=(entry,table,row,cell)=>{
    if (entry instanceof PDFRef) {
      if (visited.has(entry)) return;
      visited.add(entry);
    }
    const node=pdf.context.lookup(entry);
    if(node instanceof PDFArray){node.asArray().forEach(child=>walk(child,table,row,cell));return;}
    if(!(node instanceof PDFDict)) return;
    const role=node.get(name('S'))?.toString();
    if(role==='/Table'){table={ref:entry.toString(),rows:[]};tables.push(table);}
    if(table && role==='/TR'){row=[];table.rows.push(row);}
    if(row && (role==='/TH' || role==='/TD')){cell={role,text:'',page:null};row.push(cell);}
    const page=node.get(name('Pg'));
    const children=node.get(name('K'));
    if(cell && page && /^\d+$/.test(children?.toString()??'')){
      const id='p'+page.objectNumber+'R_mc'+children;
      cell.text+=textById.get(id)?.trim()??'';
      cell.page=pageRefs.indexOf(page.toString())+1;
    }
    walk(children,table,row,cell);
  };
  walk(root);
  return tables;
}

export function findTaggedTableCell(tables, question) {
  const normalize = text=>text.normalize('NFKC').trim().toLowerCase();
  const query=normalize(question);
  const match=/^([^の?？、]+)の([^?？、]+?)(?:は何ですか|はいつですか|はいくらですか|は|を教えてください)?[?？。]?$/u.exec(query)
    ?? /^what is the (.+?) (?:for|of) (.+?)[?]?$/u.exec(query);
  if (!match) return null;
  const [,first,second]=match;
  const [rowName,columnName]=query.startsWith('what is the ') ? [second,first] : [first,second];
  const matches=[];
  for (const {rows} of tables) {
    const [header,...values]=rows;
    if (!header?.length || !header.every(cell=>cell.role==='/TH')) continue;
    const columns=header.flatMap((cell,index)=>index>0 && normalize(cell.text)===columnName ? [index] : []);
    if (columns.length!==1) continue;
    const column=columns[0];
    for (const row of values) {
      if (row.length!==header.length || normalize(row[0].text)!==rowName) continue;
      const value=row[column];
      if (!value.text || !value.page || !header[column].page || row[0].page!==value.page) continue;
      matches.push({label:header[column].text,answer:value.text,evidence:[
        {page:value.page,quote:row.map(cell=>cell.text).join(' | ')},
        {page:header[column].page,quote:header[column].text},
      ]});
    }
  }
  return matches.length===1 ? matches[0] : null;
}
