export async function createPdfOcr() {
  const {default: {createWorker}} = await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
  const worker = await createWorker(['jpn','eng'],1,{
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
  });
  return {
    async read(page) {
      const size = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(3,2400/Math.max(size.width,size.height))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({canvas,viewport}).promise;
        const {data} = await worker.recognize(canvas);
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

