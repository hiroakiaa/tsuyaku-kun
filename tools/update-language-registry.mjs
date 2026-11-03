// Refresh only public language metadata; never sends audio, text or credentials.
import fs from 'node:fs/promises';
const endpoint='https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation';
const load=async language=>{const r=await fetch(endpoint,{headers:{'Accept-Language':language},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Language metadata unavailable: '+r.status);return (await r.json()).translation;};
const [ja,en]=await Promise.all([load('ja'),load('en')]);if(!ja||Object.keys(ja).length<100||Object.keys(ja).length>300)throw Error('Unexpected language count');
const rows=Object.entries(ja).map(([azureCode,row])=>({code:azureCode==='zh-Hans'?'zh-CN':azureCode,azureCode,labelJa:row.name,labelNative:row.nativeName,labelEn:en?.[azureCode]?.name,dir:row.dir}));
if(!rows.every(r=>/^[a-z]{2,3}(?:-[A-Za-z]+)?$/.test(r.code)&&[r.labelJa,r.labelNative,r.labelEn].every(s=>typeof s==='string'&&s.length>0&&s.length<=100)&&['ltr','rtl'].includes(r.dir)))throw Error('Invalid language metadata');
const file=new URL('../web/language-registry.js',import.meta.url),old=await fs.readFile(file,'utf8'),next=old.replace(/const rows=.*?;\nconst byCode/s,'const rows='+JSON.stringify(rows)+';\nconst byCode');if(next===old){console.log('Language metadata unchanged');}else{await fs.writeFile(file,next);console.log('Updated '+rows.length+' public translation-language entries. Review, test and publish before users receive the change.');}
