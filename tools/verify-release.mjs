import fs from 'node:fs/promises';
const base=new URL(process.argv[2]||'https://hiroakiaa.github.io/tsuyaku-kun/');
const local=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),expected=local.match(/src="(web\/app\.js\?v=[^"]+)"/)?.[1];if(!expected)throw Error('Local app version missing');
const response=await fetch(new URL('index.html?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error('Published page unavailable');const html=await response.text();if(!html.includes(expected))throw Error('Published app version differs from tested source');
const normalize=text=>text.replace(/\r\n/g,'\n');
if(normalize(html)!==normalize(local))throw Error('Published HTML differs from tested source');
const assets=[expected,...[...local.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g)].map(m=>m[1])];
const moduleMap=JSON.parse(/<script type="importmap" id="tsuyaku-module-map">([\s\S]*?)<\/script>/.exec(local)[1]);for(const path of Object.values(moduleMap.imports)){if(typeof path!=='string'||!/^\.\/(?:web|server)\/[A-Za-z0-9./_-]+\.js\?v=[A-Za-z0-9-]+$/.test(path)||path.includes('/../'))throw Error('Unexpected shared module path');assets.push(path.slice(2));}
const releaseRoot=new URL('../',import.meta.url);
const paths=new Set([...assets,'documents.html','web/documents.js?v=1','web/documents.css?v=1','web/pdf.min.mjs','web/pdf.worker.min.mjs']);
const references=/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\bnew\s+URL\(\s*)(['"])(\.{1,2}\/[\w./-]+\.js(?:\?[\w=&.-]+)?)\1/g;
for(const path of paths){
  const sourceURL=new URL(path,releaseRoot);
  const source=await fs.readFile(new URL(path.split('?')[0],releaseRoot),'utf8');
  if(sourceURL.pathname.endsWith('.js'))for(const match of source.matchAll(references)){
    const dependency=new URL(match[2],sourceURL);
    if(!dependency.href.startsWith(releaseRoot.href))throw Error('Module outside release: '+match[2]);
    paths.add(dependency.href.slice(releaseRoot.href.length));
  }
  const result=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error('Missing published asset: '+path);
  if(normalize(await result.text())!==normalize(source))throw Error('Published content differs from tested source: '+path);
}
console.log('Published HTML and '+paths.size+' assets verified: '+expected);

const api=process.argv[3]||(base.href==='https://hiroakiaa.github.io/tsuyaku-kun/'?'https://tsuyaku-kun-api.allinone-hiroakiaa.workers.dev/health':null);if(api){const r=await fetch(api,{signal:AbortSignal.timeout(10000),cache:'no-store'}),health=await r.json(),build=new URL(expected,base).searchParams.get('v');if(!r.ok||health.ok!==true||health.build!==build)throw Error('Published API build differs from tested client');console.log('Published API build verified: '+health.build);}
