import assert from 'node:assert/strict';import {documentNames,protectDocumentNames} from '../server/document-names.js';
const names=documentNames('申込者名は朝倉澪です。\n学校名：緑風技術学園\n開催場所は青葉市星見町です。\n氏名：寺田ですみです。\n学校は専門学校です。\n名前はまだ決まっていません。');
for(const name of ['朝倉澪','緑風技術学園','青葉市星見町','寺田ですみ'])assert.ok(names.includes(name),name);assert.ok(!names.includes('専門学校'));assert.ok(!names.some(name=>name.includes('決まって')));
const input=JSON.stringify({line_0:'朝倉澪が緑風技術学園へ行きます。',line_1:'青葉市星見町で朝倉澪と会います。'}),safe=protectDocumentNames(input,names);assert.ok(!safe.text.includes('朝倉澪'));const masked=JSON.parse(safe.text),output=JSON.stringify({line_0:masked.line_0,line_1:masked.line_1});assert.equal(safe.restore(output,['line_0','line_1']),input);assert.throws(()=>safe.restore(JSON.stringify({line_0:'Someone attends a school.',line_1:masked.line_1}),['line_0','line_1']),/固有名詞/);
const collision=protectDocumentNames('⟦DN0⟧ 朝倉澪',['朝倉澪']);assert.equal(collision.restore(collision.text),'⟦DN0⟧ 朝倉澪');
console.log('PASS generic named fields/institution/place cues protect original names, reject missing placeholders and avoid source-token collisions');
