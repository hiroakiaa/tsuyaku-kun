import fs from 'node:fs/promises';
const base=new URL(process.argv[2]||'https://hiroakiaa.github.io/tsuyaku-kun/');
const local=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),expected=local.match(/src="(web\/app\.js\?v=[^"]+)"/)?.[1];if(!expected)throw Error('Local app version missing');
const response=await fetch(new URL('index.html?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error('Published page unavailable');const html=await response.text();if(!html.includes(expected))throw Error('Published app version differs from tested source');
const assets=[expected,...[...html.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g)].map(m=>m[1])];
for(const path of assets){const result=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});if(!result.ok)throw Error('Missing published asset: '+path);}
console.log('Published entry and styles verified: '+expected);
