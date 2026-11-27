import {PDFDocument} from './document-pdf-lib.mjs';
export async function combineChatFiles(files,prepare,onProgress=()=>{}) {
  if(!files.length || files.length>9) throw Error('資料は1〜9ファイル選択してください。');
  const pdf=await PDFDocument.create(),pages=[],quality=[],sources=[];
  for(const [index,file] of files.entries()){
    if(!file.size || file.size>5000000)throw Error(file.name+'：1ファイル5 MB以内で選んでください。');
    onProgress(file,index);
    try {
      const prepared=await prepare(file);
      const input=await PDFDocument.load(await prepared.file.arrayBuffer());
      if(input.getPageCount()!==prepared.pages.length)throw Error('表示ページと読み取り結果が一致しません。');
      if(pages.length+prepared.pages.length>160)throw Error('全資料の合計は160ページまでです。');
      sources.push({name:file.name,start:pages.length+1,count:prepared.pages.length});
      for(const page of await pdf.copyPages(input,input.getPageIndices()))pdf.addPage(page);
      pages.push(...prepared.pages);
      quality.push(...prepared.pages.map((_,i)=>prepared.pages.readingQuality?.[i]??{status:'readable'}));
      if(pages.join('').length>150000)throw Error('全資料の合計は150,000文字までです。');
    }catch(error){throw Error(file.name+'：'+error.message+' 全資料の登録を中止しました。');}
  }
  const bytes=await pdf.save();
  if(bytes.length>20000000)throw Error('統合後の資料は20 MBまでです。全資料の登録を中止しました。');
  pages.readingQuality=quality;
  return {file:new File([bytes],'combined-documents.pdf',{type:'application/pdf'}),pages,sources};
}
