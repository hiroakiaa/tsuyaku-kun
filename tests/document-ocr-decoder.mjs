import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../web/ocr/assets/recognition.worker-CFphUR-D.js',import.meta.url),'utf8'),body=source.split('decodeOutput(r){')[1]?.split('dispose(){')[0];assert.ok(body&&body.endsWith('}'));const decode=new Function('r',body.slice(0,-1));
const chars=[...' !"014円こではAword'],list=[...new Set(chars)],size=list.length+1;
for(const text of ['400円','10000円','ここでは','AA11','word word','!"']){const ids=[...text].map(char=>list.indexOf(char)+1);ids.push(0,1);const logits=new Float32Array(ids.length*size);ids.forEach((id,i)=>logits[i*size+id]=1);const result=decode.call({session:{outputNames:['output']},config:{charList:list}},{output:{data:logits,dims:[1,ids.length,size]}});assert.equal(result.text,text,text);}
console.log('PASS actual bundled PARSEQ decoder retains repeated digits/characters, interior spaces and punctuation; stops at EOS');
