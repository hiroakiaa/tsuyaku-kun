import {azureTranslate,azureLanguages} from './azure-translator.js';
import {inspectTranslations} from '../web/translation-quality.js';
// Preserve source row identity; never send page images to this provider.
export async function fastDocumentLines(env,lines,target,translate=azureTranslate){
 if(env.DOCUMENT_FAST_TRANSLATION!=='azure-consented-v1'||!env.AZURE_TRANSLATOR_F0||target==='ja-easy'||!azureLanguages('auto',[target]))return null;
 const batches=[];for(const line of lines){if(line.length>1200)return null;let batch=batches.at(-1);if(!batch||batch.length>=24||batch.reduce((n,s)=>n+s.length,0)+line.length>1200){batch=[];batches.push(batch);}batch.push(line);}
 const output=[],usage={input:0,output:0,cached:0,provider:'azure_f0',azureCharacters:0};
 for(const batch of batches){const rows=await translate(env,batch,'auto',[target],u=>usage.azureCharacters+=u.azureCharacters||0);if(rows.length!==batch.length)return null;output.push(...rows.map((row,i)=>typeof row[target]==='string'&&row[target].trim()&&!inspectTranslations(batch[i],/[\u3040-\u30ff\u3400-\u9fff]/u.test(batch[i])?'ja':'auto',[target],row).warnings?.length?row[target]:null));}
 return {lines:output,repairIndices:output.flatMap((line,i)=>line===null?[i]:[]),usage};
}
