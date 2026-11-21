import assert from 'node:assert/strict';import {numericText,supportsDatesAndMeasures} from '../server/document-values.js';
assert.equal(numericText('二百円、千二百円、二〇二七年四月八日、一億二万円'),'200円、1200円、2027年4月8日、100020000円');
assert.equal(numericText('十十円'),'十十円');assert.equal(numericText('1.2万円、12万円'),'1.2万円、12万円');
for(const [source,correct,wrong,question]of [
 ['毎月の締切は8日です。','毎月8日','毎月9日','締切は何日？'],
 ['開催は2027年です。','2027年','2028年','開催年は？'],
 ['開始は4月です。','4月','5月','開始はいつ？'],
 ['説明会は2027年4月8日です。','April 8, 2027','April 9, 2027','When is the meeting?'],
 ['締切は2027年4月8日です。','2027-04-08','2028-04-08','締切はいつ？'],
 ['荷物は5 kgまでです。','5000 gまでです。','500 gまでです。','荷物の重さは？'],
 ['荷物は5 kgまでです。','5 kilograms','5 grams','荷物の重さは？'],
 ['所要時間は2時間です。','120 minutes','120 seconds','所要時間は？'],
 ['長さは300 cmです。','3 mです。','3 kmです。','長さは？'],
 ['ファイルは5 MBまでです。','5000 KBまでです。','5 GBまでです。','ファイルの上限は？'],
 ['データは1 MiBです。','1024 KiBです。','1000 KiBです。','データ量は？'],
 ]){assert.equal(supportsDatesAndMeasures(correct,[{quote:source}],question),true,correct);assert.equal(supportsDatesAndMeasures(wrong,[{quote:source}],question),false,wrong);}
console.log('PASS Japanese numeric glyphs, date notation, date/year conflicts and equivalent SI/binary units preserve values without accepting scale changes');
