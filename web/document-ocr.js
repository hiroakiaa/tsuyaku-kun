const timingNames = ['initialization','render','recognition','native-recognition','full-recognition'].map(stage=>'document-ocr:'+stage);

function recordTiming(name,start) {
  try { performance.measure(name,{start,end:performance.now()}); } catch { /* Optional browser timing. */ }
}

const supportedScanOperations = [
  'save','restore','transform','dependency','setStrokeRGBColor','setFillRGBColor',
  'setGState','beginText','endText','setFont','setTextMatrix','showText',
  'clip','eoClip','constructPath','paintImageXObject',
];

async function nativeScanBitmap(page, ops) {
  if (page.rotate || !page.objs || !ops) return null;
  try {
    const {fnArray,argsArray} = await page.getOperatorList();
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
    const bitmap = imageId && page.objs.has(imageId) ? page.objs.get(imageId)?.bitmap : null;
    return bitmap && bitmap.width<=4096 && bitmap.height<=4096 ? bitmap : null;
  } catch {
    return null;
  }
}

export async function createPdfOcr(ops) {
  for (const name of timingNames) performance.clearMeasures(name);
  const start = performance.now();
  const {default: {createWorker}} = await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
  const worker = await createWorker(['jpn','eng'],1,{
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
  });
  recordTiming(timingNames[0],start);
  return {
    async read(page) {
      const size = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(3,2400/Math.max(size.width,size.height))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        const renderStarted = performance.now();
        await page.render({canvas,viewport}).promise;
        recordTiming(timingNames[1],renderStarted);
        const recognitionStarted = performance.now();
        const bitmap = await nativeScanBitmap(page,ops);
        let text = '';
        if (bitmap) {
          const native = document.createElement('canvas');
          native.width = bitmap.width;
          native.height = bitmap.height;
          try {
            const context = native.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0,0,native.width,native.height);
            context.drawImage(bitmap,0,0);
            const nativeStarted = performance.now();
            text = (await worker.recognize(native)).data.text.trim();
            recordTiming('document-ocr:native-recognition',nativeStarted);
          } finally {
            native.width = native.height = 0;
          }
        }
        if (text.replace(/\s/gu,'').length<8) {
          const fullStarted = performance.now();
          text = (await worker.recognize(canvas)).data.text.trim();
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
    close:()=>worker.terminate(),
  };
}

