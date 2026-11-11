import fs from 'node:fs/promises';
const base=new URL(process.argv[2]||'https://hiroakiaa.github.io/tsuyaku-kun/');
const local=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),expected=local.match(/src="(web\/app\.js\?v=[^"]+)"/)?.[1];if(!expected)throw Error('Local app version missing');
const response=await fetch(new URL('index.html?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error('Published page unavailable');const html=await response.text();if(!html.includes(expected))throw Error('Published app version differs from tested source');
const assets=[expected,...[...html.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g)].map(m=>m[1])];
for(const match of local.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g))if(!html.includes(match[1]))throw Error('Published style version differs: '+match[1]);
const app=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
for(const match of app.matchAll(/from '(\.\/[a-z0-9-]+\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
for(const match of app.matchAll(/import\('(\.\/[a-z0-9-]+\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
assets.push('web/realtime-protocol.js?v=20261030-realtime-1','web/caption-stream-pcm.js?v=20261030-realtime-1','web/cost-policy.js?v=20261030-realtime-1');
assets.push('web/statistics.js?v=20261029-faithful-pipeline-1');
for(const module of ['admin.js','analysis-focus.js','live-translation-face.js','live-translation-client.js']){
 const source=await fs.readFile(new URL('../web/'+module,import.meta.url),'utf8');
 for(const match of source.matchAll(/from '(\.\/[a-z0-9-]+\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
}
assets.push('web/cost-policy.js?v=20261022-cost-accounting-1','web/billing-data.js?v=20261022-billing-auto-1');
const guides=await fs.readFile(new URL('../web/ui-english.js',import.meta.url),'utf8');for(const match of guides.matchAll(/from '(\.\/ui-labels\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
const recognition=await fs.readFile(new URL('../web/caption-server.js',import.meta.url),'utf8');for(const match of recognition.matchAll(/new URL\('(\.\/caption-pcm\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
assets.push('web/recognition-metrics.js?v=20261029-communication50-1','web/audio-trim.js?v=20261029-communication50-1','web/speech-continuity.js?v=20261029-communication50-1');
const moduleMap=JSON.parse(/<script type="importmap" id="tsuyaku-module-map">([\s\S]*?)<\/script>/.exec(local)[1]);for(const path of Object.values(moduleMap.imports)){if(typeof path!=='string'||!/^\.\/(?:web|server)\/[A-Za-z0-9./_-]+\.js\?v=[A-Za-z0-9-]+$/.test(path)||path.includes('/../'))throw Error('Unexpected shared module path');assets.push(path.slice(2));}
for(const path of new Set(assets)){const result=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});if(!result.ok)throw Error('Missing published asset: '+path);const published=await result.text(),source=await fs.readFile(new URL('../'+path.split('?')[0],import.meta.url),'utf8');if(published.replace(/\r\n/g,'\n')!==source.replace(/\r\n/g,'\n'))throw Error('Published content differs from tested source: '+path);}
console.log('Published entry and styles verified: '+expected);

const api=process.argv[3]||(base.href==='https://hiroakiaa.github.io/tsuyaku-kun/'?'https://tsuyaku-kun-api.allinone-hiroakiaa.workers.dev/health':null);if(api){const r=await fetch(api,{signal:AbortSignal.timeout(10000),cache:'no-store'}),health=await r.json(),build=new URL(expected,base).searchParams.get('v');if(!r.ok||health.ok!==true||health.build!==build)throw Error('Published API build differs from tested client');console.log('Published API build verified: '+health.build);}
