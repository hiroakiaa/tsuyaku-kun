import {PDFDocument} from './document-pdf-lib.mjs';
import {combineChatFiles} from './document-chat-bundle.js';
export async function appendDocumentBundle(baseBytes,basePages,files,prepare,onProgress){
 const base=await PDFDocument.load(baseBytes);if(base.getPageCount()!==basePages.length)throw Error('以前に文字だけ追加された資料が含まれています。元資料をすべて選び直して新規作成してください。');
 const added=await combineChatFiles(files,prepare,onProgress),incoming=await PDFDocument.load(await added.file.arrayBuffer());
 if(basePages.length+added.pages.length>160)throw Error('統合後は160ページまでです。');const pages=[...basePages,...added.pages];if(pages.join('').length>150000)throw Error('統合後は150,000文字までです。');
 for(const page of await base.copyPages(incoming,incoming.getPageIndices()))base.addPage(page);const bytes=await base.save();if(bytes.length>20000000)throw Error('統合後は20 MBまでです。');
 pages.readingQuality=[...(basePages.readingQuality??basePages.map(()=>({status:'readable'}))),...added.pages.readingQuality];return {file:new File([bytes],'appended-documents.pdf',{type:'application/pdf'}),pages,sources:added.sources.map(s=>({...s,start:s.start+basePages.length}))};
}
