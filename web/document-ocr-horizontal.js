import {findHorizontalScanLines} from './document-ocr-lines.js';

export async function createHorizontalScanReader(workerUrl) {
  const worker = new Worker(workerUrl,{type:'module'});
  function request(message, expected, transfer=[]) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('OCR worker timed out')),45000);
      function finish(error,result) {
        clearTimeout(timer);
        worker.onmessage=null;
        worker.onerror=null;
        if (error) reject(error);
        else resolve(result);
      }
      worker.onerror=event=>finish(new Error(event.message));
      worker.onmessage=({data})=>{
        if (data.type==='REC_ERROR') finish(new Error(data.error));
        else if (data.type===expected) finish(null,data);
      };
      try { worker.postMessage(message,transfer); }
      catch (error) { finish(error); }
    });
  }

  try { await request({type:'REC_INIT',singleModel:true},'REC_READY'); }
  catch (error) { worker.terminate(); throw error; }

  return {
    async read(imageData,{withLayout=false}={}) {
      const lines=findHorizontalScanLines(imageData);
      if (!lines) return null;
      const canvas=document.createElement('canvas');
      canvas.width=imageData.width;
      canvas.height=imageData.height;
      let jobs;
      try {
        const context=canvas.getContext('2d');
        context.putImageData(imageData,0,0);
        jobs=lines.map(({x,y,width,height},id)=>({id,croppedImageData:context.getImageData(x,y,width,height)}));
      } finally {
        canvas.width=canvas.height=0;
      }
      const {results}=await request({type:'REC_PROCESS',jobs},'REC_COMPLETE',jobs.map(job=>job.croppedImageData.data.buffer));
      const text=new Map(results.map(({id,text})=>[id,text.trim()]));
      const ordered=jobs.map(({id})=>text.get(id));
      if (!ordered.every(Boolean)) return null;
      return withLayout ? lines.map((box,index)=>({box,text:ordered[index]})) : ordered.join('\n');
    },
    close:()=>worker.terminate(),
  };
}
