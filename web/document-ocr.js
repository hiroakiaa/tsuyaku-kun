const timingNames = ['initialization','render','recognition','native-recognition','full-recognition','horizontal-recognition'].map(stage=>'document-ocr:'+stage);

function recordTiming(name,start) {
  try { performance.measure(name,{start,end:performance.now()}); } catch { /* Optional browser timing. */ }
}

const supportedScanOperations = [
  'save','restore','transform','dependency','setStrokeRGBColor','setFillRGBColor',
  'setGState','beginText','endText','setFont','setTextMatrix','showText',
  'clip','eoClip','constructPath','paintImageXObject',
];

function nativeScanImage(page, ops, operatorList) {
  if (page.rotate || !page.objs || !ops) return null;
  try {
    const {fnArray,argsArray} = operatorList;
    const supported = new Set(supportedScanOperations.map(name=>ops[name]));
    let imageId, clip;
    let matrix = [1,1,0,0];
    const stack = [];
    const bounds = ([left,bottom,right,top]) => {
      const [x,y,tx,ty] = matrix;
      return [Math.min(left*x,right*x)+tx,Math.min(bottom*y,top*y)+ty,
        Math.max(left*x,right*x)+tx,Math.max(bottom*y,top*y)+ty];
    };
    for (let i=0; i<fnArray.length; i++) {
      const op = fnArray[i], args = argsArray[i];
      if (!supported.has(op)) return null;
      if (op===ops.save) stack.push({matrix,clip});
      if (op===ops.restore) ({matrix,clip} = stack.pop());
      if (op===ops.transform) {
        const [a,b,c,d,e,f] = args;
        if (b || c || a<=0 || !d) return null;
        const [x,y,tx,ty] = matrix;
        matrix = [x*a,y*d,x*e+tx,y*f+ty];
      }
      if (op===ops.setGState && args[0].some(([key,value])=>
        !((key==='ca' && value===1) || (key==='BM' && value==='source-over')))) return null;
      if ((op===ops.clip || op===ops.eoClip) && fnArray[i+1]!==ops.constructPath) return null;
      if (op===ops.constructPath) {
        if (clip || imageId || args[0]!==ops.endPath || args[1]?.[0]?.length!==13 ||
            ![ops.clip,ops.eoClip].includes(fnArray[i-1])) return null;
        const path = args[1][0], box = args[2];
        if (!box) return null;
        const [left,bottom,right,top] = box;
        if (path[0]!==0 || path[3]!==1 || path[6]!==1 || path[9]!==1 || path[12]!==4 ||
            path[1]!==left || path[2]!==bottom || path[4]!==right || path[5]!==bottom ||
            path[7]!==right || path[8]!==top || path[10]!==left || path[11]!==top) return null;
        clip = bounds(box);
      }
      if (op===ops.paintImageXObject) {
        if (imageId || matrix[1]<=0) return null;
        const imageBounds = bounds([0,0,1,1]);
        const contains = box=>imageBounds[0]>=box[0] && imageBounds[1]>=box[1] &&
          imageBounds[2]<=box[2] && imageBounds[3]<=box[3];
        if (!contains(page.view) || (clip && !contains(clip))) return null;
        imageId = args[0];
      }
    }
    const image = imageId && page.objs.has(imageId) ? page.objs.get(imageId) : null;
    return image && image.width<=4096 && image.height<=4096 ? image : null;
  } catch {
    return null;
  }
}

export async function createPdfOcr(ops) {
  for (const name of timingNames) performance.clearMeasures(name);
  let standard, horizontal, vertical, disabled=false;
  async function standardWorker() {
    standard ??= (async()=>{
      const started=performance.now();
      const {default:{createWorker}} = await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
      const worker=await createWorker(['jpn','eng'],1,{
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      });
      if (!horizontal && !vertical) recordTiming(timingNames[0],started);
      return worker;
    })();
    return standard;
  }
  async function verticalWorker() {
    if (!vertical) {
      const started=performance.now();
      const {default:{createWorker}}=await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
      vertical=await createWorker('jpn_vert',1,{
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      });
      await vertical.setParameters({tessedit_pageseg_mode:'5'});
      if (!standard && !horizontal) recordTiming(timingNames[0],started);
    }
    return vertical;
  }
  return {
    async readLayout(page,pageNumberItems=[],{diagram=false}={}) {
      const size=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(3,2400/Math.max(size.width,size.height))});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      try {
        await page.render({canvas,viewport}).promise;
        const context=canvas.getContext('2d');
        context.fillStyle='#fff';
        for (const item of pageNumberItems) {
          if (!item.str?.trim()) continue;
          const [a,b,c,d,x,y]=item.transform;
          const horizontal=Math.hypot(a,b), vertical=Math.hypot(c,d);
          if (!horizontal || !vertical) continue;
          const corners=[0,item.width].flatMap(across=>[-item.height*.2,item.height*1.2].map(up=>
            viewport.convertToViewportPoint(x+across*a/horizontal+up*c/vertical,
              y+across*b/horizontal+up*d/vertical)));
          const xs=corners.map(point=>point[0]), ys=corners.map(point=>point[1]);
          const left=Math.min(...xs), top=Math.min(...ys);
          context.fillRect(left-2,top-2,Math.max(...xs)-left+4,Math.max(...ys)-top+4);
        }
        let lines,verticalLayout=false;
        if (diagram) {
          const worker=await standardWorker();
          const {data}=await worker.recognize(canvas,{tessedit_pageseg_mode:'11'},{blocks:true});
          lines=(data.blocks ?? []).flatMap(block=>block.paragraphs).flatMap(paragraph=>paragraph.lines)
            .flatMap(line=>{
              const groups=[];
              for (const word of line.words ?? []) {
                if (!word.text.trim() || word.bbox.x1<=word.bbox.x0) continue;
                const group=groups.at(-1);
                const previous=group?.at(-1);
                const height=word.bbox.y1-word.bbox.y0;
                if (!previous || word.bbox.x0-previous.bbox.x1>height*1.6) groups.push([word]);
                else group.push(word);
              }
              return groups.flatMap(group=>{
                const first=group.findIndex(word=>word.confidence>=45 && /[\p{L}\p{N}]/u.test(word.text));
                if (first<0) return [];
                const last=group.findLastIndex(word=>word.confidence>=45 && /[\p{L}\p{N}]/u.test(word.text));
                const words=group.slice(first,last+1);
                return [{
                  text:words.map(word=>word.text).join(' '),
                  bbox:{
                    x0:Math.min(...words.map(word=>word.bbox.x0)),
                    x1:Math.max(...words.map(word=>word.bbox.x1)),
                    y0:Math.min(...words.map(word=>word.bbox.y0)),
                    y1:Math.max(...words.map(word=>word.bbox.y1)),
                  },
                }];
              });
            });
        }

        if (!diagram) try {
          const pixels=context.getImageData(0,0,canvas.width,canvas.height);
          const {findVerticalScanRegion}=await import('./document-ocr-lines.js?v=3');
          if (findVerticalScanRegion(pixels)?.wholePage) {
            const {data}=await (await verticalWorker()).recognize(canvas,{}, {blocks:true});
            if (data.confidence>=70) lines=(data.blocks ?? []).flatMap(block=>block.paragraphs)
              .flatMap(paragraph=>paragraph.lines).sort((a,b)=>b.bbox.x0-a.bbox.x0 || a.bbox.y0-b.bbox.y0);
            verticalLayout=Boolean(lines?.length);
          }
          if (!lines?.length) {
            const {createHorizontalScanReader}=await import('./document-ocr-horizontal.js?v=2');
            horizontal ??= await createHorizontalScanReader(new URL('./ocr/assets/recognition.worker-CFphUR-D.js?v=2',import.meta.url));
            const recognized=await horizontal.read(pixels,{withLayout:true});
            lines=recognized?.map(({text,box:{x,y,width,height}})=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+height}}));
          }
        } catch { /* Fall back to the general OCR reader. */ }
        if (!lines?.length) {
          const {data}=await (await standardWorker()).recognize(canvas,{}, {blocks:true});
          lines=(data.blocks ?? []).flatMap(block=>block.paragraphs).flatMap(paragraph=>paragraph.lines);
        }
        return lines
          .flatMap(({text,bbox})=>{
            const str=typeof text==='string' ? text.trim() : '';
            if (!str || !bbox || ![bbox.x0,bbox.y0,bbox.x1,bbox.y1].every(Number.isFinite) ||
                bbox.x0<0 || bbox.y0<0 || bbox.x1>canvas.width || bbox.y1>canvas.height) return [];
            const width=(bbox.x1-bbox.x0)/viewport.scale;
            const height=(bbox.y1-bbox.y0)/viewport.scale;
            if (width<=0 || height<=0) return [];
            const [x,y]=viewport.convertToPdfPoint(bbox.x0,bbox.y1);
            const ocrBox=[bbox.x0/viewport.width,bbox.y0/viewport.height,
              (bbox.x1-bbox.x0)/viewport.width,(bbox.y1-bbox.y0)/viewport.height];
            return [{str,width,height,ocr:true,ocrBox,verticalLayout,transform:[height,0,0,height,x,y]}];
          });
      } finally {
        canvas.width=canvas.height=0;
      }
    },
    async read(page,{pageNumberOnly=false}={}) {
      const size = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(3,2400/Math.max(size.width,size.height))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        const renderStarted = performance.now();
        const operatorList=await page.getOperatorList().catch(()=>null);
        await page.render({canvas,viewport}).promise;
        recordTiming(timingNames[1],renderStarted);
        const recognitionStarted = performance.now();
        const image = operatorList && nativeScanImage(page,ops,operatorList);
        let text = '';
        const {findVerticalScanRegion}=await import('./document-ocr-lines.js?v=3');
        const context=canvas.getContext('2d');
        const layout=findVerticalScanRegion(context.getImageData(0,0,canvas.width,canvas.height));
        if (layout) {
          try {
            const {data}=await (await verticalWorker()).recognize(canvas,layout.vertical ? {rectangle:layout.vertical} : {});
            if (data.confidence>=70 && data.text.replace(/\s/gu,'').length>=8) {
              recordTiming(timingNames[2],recognitionStarted);
              if (layout.wholePage) return data.text.trim();
              const horizontalText=(await (await standardWorker()).recognize(canvas,{rectangle:layout.horizontal})).data.text.trim();
              if(horizontalText) return [data.text.trim(),horizontalText].join("\n");
            }
          } catch { /* Use the standard reader if vertical recognition is unavailable. */ }
        }
        if (image) {
          const native = document.createElement('canvas');
          native.width = image.width;
          native.height = image.height;
          try {
            const context = native.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0,0,native.width,native.height);
            if (image.bitmap) context.drawImage(image.bitmap,0,0);
            else {
              const pixels=context.createImageData(image.width,image.height);
              if (image.data?.length===pixels.data.length) pixels.data.set(image.data);
              else if (image.data?.length===image.width*image.height*3) {
                for(let source=0,target=0; source<image.data.length; source+=3,target+=4) {
                  pixels.data[target]=image.data[source];
                  pixels.data[target+1]=image.data[source+1];
                  pixels.data[target+2]=image.data[source+2];
                  pixels.data[target+3]=255;
                }
              } else pixels.data.fill(255);
              context.putImageData(pixels,0,0);
            }
            if (pageNumberOnly && !disabled && typeof DecompressionStream==='function') {
              const pixels=context.getImageData(0,0,native.width,native.height);
              const {findHorizontalScanLines}=await import('./document-ocr-lines.js');
              if (findHorizontalScanLines(pixels)) {
                try {
                  if (!horizontal) {
                    const started=performance.now();
                    const {createHorizontalScanReader}=await import('./document-ocr-horizontal.js');
                    const workerUrl=new URL('./ocr/assets/recognition.worker-CFphUR-D.js?v=2',import.meta.url);
                    horizontal=await createHorizontalScanReader(workerUrl);
                    if (!standard) recordTiming(timingNames[0],started);
                  }
                  const started=performance.now();
                  text=(await horizontal.read(pixels)) ?? '';
                  recordTiming('document-ocr:horizontal-recognition',started);
                } catch {
                  horizontal?.close();
                  horizontal=undefined;
                  disabled=true;
                }
              }
            }
            const nativeStarted = performance.now();
            const compact=value=>value.normalize('NFKC').replace(/\s/gu,'');
            const malformedMonth=/(?:[ァ-ヶー]{2,4}月[0-9一二三四五六七八九十]{1,3}日|[0-9一二三四五六七八九十]{1,3}月[一二三四五六七八九十]*ニ[ニ一二三四五六七八九十]*日)/u;
            const calendarDate=/(?:1[0-2]|[1-9]|十[一二]?|[一二三四五六七八九])月[0-9一二三四五六七八九十]{1,3}日/u;
            if (compact(text).length<8 || malformedMonth.test(compact(text))) {
              const alternative=(await (await standardWorker()).recognize(native)).data.text.trim();
              if (compact(text).length<8 || (!malformedMonth.test(compact(alternative)) && calendarDate.test(compact(alternative)))) text=alternative;
              if (malformedMonth.test(compact(text))) {
                const rendered=(await (await standardWorker()).recognize(canvas)).data.text.trim();
                if (!malformedMonth.test(compact(rendered)) && calendarDate.test(compact(rendered))) text=rendered;
              }
            }
            recordTiming('document-ocr:native-recognition',nativeStarted);
          } finally {
            native.width = native.height = 0;
          }
        }
        if (text.replace(/\s/gu,'').length<8) {
          const fullStarted = performance.now();
          text = (await (await standardWorker()).recognize(canvas)).data.text.trim();
          recordTiming('document-ocr:full-recognition',fullStarted);
        }
        recordTiming(timingNames[2],recognitionStarted);
        // In a complete kanji date, katakana ニ can be a glyph-level OCR error.
        return text.replace(/((?:十一|十二|十|[一二三四五六七八九])\s*月\s*)([一二三四五六七八九十\s]*ニ[ニ一二三四五六七八九十\s]*)(\s*日)/gu,
          (original,month,day,suffix)=>{
            const normalized=day.replaceAll('ニ','二');
            const valid=/^(?:[一二三四五六七八九]|十[一二三四五六七八九]?|二十[一二三四五六七八九]?|三十[一]?)$/u;
            return valid.test(normalized.replace(/\s/gu,'')) ? month+normalized+suffix : original;
          });
      } catch (error) {
        throw new Error('スキャンページの文字を読み取れませんでした。',{cause:error});
      } finally {
        canvas.width = canvas.height = 0;
      }
    },
    async close() {
      horizontal?.close();
      await vertical?.terminate();
      const worker=await standard?.catch(()=>null);
      await worker?.terminate();
    },
  };
}

