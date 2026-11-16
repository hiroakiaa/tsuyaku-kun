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
  return {
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
            const {data}=await vertical.recognize(canvas,layout.vertical ? {rectangle:layout.vertical} : {});
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
                    const workerUrl=new URL('./ocr/assets/recognition.worker-CFphUR-D.js',import.meta.url);
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
            const malformedMonth=/[ァ-ヶー]{2,4}月[0-9一二三四五六七八九十]{1,3}日/u;
            const calendarDate=/(?:1[0-2]|[1-9]|十[一二]?|[一二三四五六七八九])月[0-9一二三四五六七八九十]{1,3}日/u;
            if (compact(text).length<8 || malformedMonth.test(compact(text))) {
              const alternative=(await (await standardWorker()).recognize(native)).data.text.trim();
              if (compact(text).length<8 || calendarDate.test(compact(alternative))) text=alternative;
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
        return text;
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

