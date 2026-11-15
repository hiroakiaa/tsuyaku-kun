const timingNames = ['initialization','render','recognition'].map(stage=>'document-ocr:'+stage);

function recordTiming(name,start) {
  try { performance.measure(name,{start,end:performance.now()}); } catch { /* Optional browser timing. */ }
}

export async function createPdfOcr() {
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
        const {data} = await worker.recognize(canvas);
        recordTiming(timingNames[2],recognitionStarted);
        return data.text.trim();
      } catch (error) {
        throw new Error('スキャンページの文字を読み取れませんでした。',{cause:error});
      } finally {
        canvas.width = canvas.height = 0;
      }
    },
    close:()=>worker.terminate(),
  };
}

