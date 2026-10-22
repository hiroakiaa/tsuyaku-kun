import fs from 'node:fs/promises';
const base=new URL(process.argv[2]||'https://hiroakiaa.github.io/tsuyaku-kun/');
const local=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),expected=local.match(/src="(web\/app\.js\?v=[^"]+)"/)?.[1];if(!expected)throw Error('Local app version missing');
const response=await fetch(new URL('index.html?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error('Published page unavailable');const html=await response.text();if(!html.includes(expected))throw Error('Published app version differs from tested source');
const assets=[expected,...[...html.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g)].map(m=>m[1])];
for(const match of local.matchAll(/href="(web\/[^"#]+\.css[^"#]*)"/g))if(!html.includes(match[1]))throw Error('Published style version differs: '+match[1]);
const app=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
for(const match of app.matchAll(/from '(\.\/(?:call-mode|async-ui|entry-feedback|device-check|photo-translate|entry-feedback|ui-english|conversation-ui|admin|usage)\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
for(const match of app.matchAll(/import\('(\.\/qr\.js[^']*)'\)/g))assets.push('web/'+match[1].slice(2));
const admin=await fs.readFile(new URL('../web/admin.js',import.meta.url),'utf8');for(const match of admin.matchAll(/from '(\.\/budget-view\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
const guides=await fs.readFile(new URL('../web/ui-english.js',import.meta.url),'utf8');for(const match of guides.matchAll(/from '(\.\/ui-labels\.js[^']*)'/g))assets.push('web/'+match[1].slice(2));
for(const path of new Set(assets)){const result=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});if(!result.ok)throw Error('Missing published asset: '+path);const published=await result.text(),source=await fs.readFile(new URL('../'+path.split('?')[0],import.meta.url),'utf8');if(published.replace(/\r\n/g,'\n')!==source.replace(/\r\n/g,'\n'))throw Error('Published content differs from tested source: '+path);}
console.log('Published entry and styles verified: '+expected);
