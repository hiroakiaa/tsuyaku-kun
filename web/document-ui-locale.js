export const documentUiLabels=[
  ['資料QA君','Document Q&A','Preguntas sobre documentos'],
  ['資料QAの保管庫','Document library','Biblioteca de documentos'],
  ['資料チャット作成','Create document chat','Crear chat del documento'],
  ['資料QAを作る','Create document Q&A','Crear preguntas sobre un documento'],
  ['保管庫に戻る','Back to library','Volver a la biblioteca'],
  ['資料名','Document name','Nombre del documento'],
  ['資料を検索','Search documents','Buscar documentos'],
  ['並べ替え','Sort','Ordenar'],
  ['最近開いた順','Recently opened','Abiertos recientemente'],
  ['登録日の新しい順','Newest first','Más recientes primero'],
  ['資料名順','By name','Por nombre'],
  ['この端末の資料','Documents on this device','Documentos en este dispositivo'],
  ['共通の資料','Shared documents','Documentos compartidos'],
  ['この端末の保管庫のみ','Only on this device','Solo en este dispositivo'],
  ['共通保管庫にも掲載（誰でも閲覧できます）','List in the shared library (visible to everyone)','Publicar en la biblioteca compartida (visible para todos)'],
  ['資料ファイル','Document file','Archivo del documento'],
  ['例：新1年生の入学案内','Example: New student guide','Ejemplo: Guía para estudiantes nuevos'],
  ['PDF（5 MB・40ページまで）、画像・Excel・Wordは1つのPDFに変換します','PDF up to 5 MB and 40 pages. Images, Excel and Word are converted to one PDF.','PDF de hasta 5 MB y 40 páginas. Las imágenes, Excel y Word se convierten en un PDF.'],
  ['保管先','Save to','Guardar en'],
  ['作成する','Create','Crear'],
  ['10～20秒ほどで完成します（目安）','Usually ready in 10–20 seconds','Normalmente listo en 10–20 segundos'],
  ['案内ページができました','Your document page is ready','Tu página del documento está lista'],
  ['資料を開いて質問する →','Open document and ask questions →','Abrir el documento y hacer preguntas →'],
  ['共有URL','Share link','Enlace para compartir'],
  ['URLをコピー','Copy link','Copiar enlace'],
  ['資料QAの利用言語','Document language','Idioma del documento'],
  ['母国語：自動','Language: automatic','Idioma: automático'],
  ['母国語を選ぶと、資料と回答をその言語で表示します','Choose the language for documents and answers','Elige el idioma de los documentos y las respuestas'],
  ['資料追加','Add material','Añadir material'],
  ['資料追加を閉じる','Close add material','Cerrar adición de material'],
  ['追加資料','Additional material','Material adicional'],
  ['追加する','Add','Añadir'],
  ['新しいPDF','New PDF','Nuevo PDF'],
  ['元のPDFを差し替える','Replace the original PDF','Reemplazar el PDF original'],
  ['共有を終了','Stop sharing','Dejar de compartir'],
  ['要点','Key points','Puntos clave'],
  ['資料の案内','Document guide','Guía del documento'],
  ['まず確認すること','What to check first','Qué revisar primero'],
  ['質問する','Ask questions','Hacer preguntas'],
  ['資料への質問','Question about the document','Pregunta sobre el documento'],
  ['質問を入力してください','Enter your question','Escribe tu pregunta'],
  ['送る','Send','Enviar'],
  ['列幅','Column width','Ancho de columna'],
  ['元のPDF','Original PDF','PDF original'],
  ['原文','Original','Original'],
  ['PDF上に訳文を表示','Show translation on PDF','Mostrar traducción sobre el PDF'],
  ['原文と比較','Compare with original','Comparar con el original'],
  ['このページに翻訳できる文字はありません。','There is no translatable text on this page.','Esta página no contiene texto traducible.'],
  ['PDF全画面','Full-screen PDF','PDF a pantalla completa'],
  ['資料データを表示','View document','Ver documento'],
  ['左右入れ替え','Swap sides','Intercambiar lados'],
  ['質問画面を閉じる','Close questions','Cerrar preguntas'],
  ['資料を閉じる','Close document','Cerrar documento'],
  ['資料の表示言語','Document viewing language','Idioma de visualización'],
  ['別タブで開く ↗','Open in a new tab ↗','Abrir en otra pestaña ↗'],
  ['検索','Search','Buscar'],
  ['目次','Contents','Índice'],
  ['PDF内検索','Search within the PDF','Buscar en el PDF'],
  ['PDF内の語句','Text in the PDF','Texto en el PDF'],
  ['PDFの目次','PDF contents','Índice del PDF'],
  ['縮小','Zoom out','Alejar'],
  ['拡大','Zoom in','Acercar'],
  ['ページ送り','Page navigation','Navegación de páginas'],
  ['前のページ','Previous page','Página anterior'],
  ['次のページ','Next page','Página siguiente'],
  ['ページ番号','Page number','Número de página'],
  ['資料内表記','Source quotation','Cita original'],
  ['再試行','Retry','Reintentar'],
  ['再読み込み','Reload','Volver a cargar'],
  ['読み込んでいます…','Loading…','Cargando…'],
  ['翻訳しています…','Translating…','Traduciendo…'],
  ['資料全体を確認しています…','Checking the whole document…','Revisando todo el documento…'],
  ['資料から質問に関係する箇所を探しています…','Searching for relevant passages…','Buscando pasajes relevantes…'],
  ['資料を参照して回答を作成しています…','Preparing an answer from the document…','Preparando una respuesta a partir del documento…'],
  ['この項目の根拠は資料内で確認できませんでした。','No supporting passage was found in the document.','No se encontró un pasaje de respaldo en el documento.'],
  ['公開されている資料はありません。','No shared documents yet.','Aún no hay documentos compartidos.'],
  ['一致する資料がありません。','No matching documents.','No hay documentos coincidentes.'],
];

export function createDocumentUiLocale(root,loadLanguage) {
  const originals=new WeakMap();
  const attributes=['aria-label','title','placeholder'];
  const dictionaries=Object.fromEntries(['en','es'].map((code,index)=>[code,new Map(documentUiLabels.map(row=>[row[0],row[index+1]]))]));
  const pending=new Map();
  let selected='';
  let language='';
  const translate=text=>{
    const word=text.trim();
    const page=/^元のPDF (\d+)ページ$/u.exec(word)?.[1];
    const result=dictionaries[language]?.get(word) ??
      (page && language==='en' ? 'Original PDF, page '+page : page && language==='es' ? 'PDF original, página '+page : undefined);
    return result ? text.replace(word,result) : text;
  };
  function translateValue(node,key,value,write) {
    const entries=originals.get(node)??{};
    const previous=entries[key];
    const source=previous?.rendered===value ? previous.source : value;
    const rendered=translate(source);
    entries[key]={source,rendered};
    originals.set(node,entries);
    if(rendered!==value) write(rendered);
  }
  function visit(node) {
    if(node.nodeType===Node.TEXT_NODE){
      if(node.parentElement?.closest('blockquote,#pdf-translation,.answer-text,.answer-english,.bubble.user,#doc-title,#ask-heading,#pdf-heading,.library-card a,#cards'))return;
      translateValue(node,'text',node.data,value=>{node.data=value;});
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    for(const attribute of attributes){
      if(node.hasAttribute(attribute))translateValue(node,attribute,node.getAttribute(attribute),value=>node.setAttribute(attribute,value));
    }
    for(const child of node.childNodes)visit(child);
  }
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='childList')record.addedNodes.forEach(visit);
      else visit(record.target);
    }
  });
  observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  function apply(code) {
    language=code;
    document.documentElement.lang=dictionaries[code]?(code==='ja-easy'?'ja':code):'ja';
    document.title=translate('資料QA君');
    visit(root);
  }
  return async code=>{
    selected=code;
    if (!code || code==='ja' || dictionaries[code]) return apply(code);
    apply('');
    if (!pending.has(code)) pending.set(code,loadLanguage(code).finally(()=>pending.delete(code)));
    try {
      const {lines}=await pending.get(code);
      if (lines.length!==documentUiLabels.length) return;
      dictionaries[code]=new Map(documentUiLabels.map(([original],i)=>[original,lines[i]]));
      if (selected===code) apply(code);
    } catch {}
  };
}
