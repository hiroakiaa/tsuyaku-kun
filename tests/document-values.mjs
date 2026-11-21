import assert from 'node:assert/strict';import {numericText,supportsDatesAndMeasures,requestedMeasureConversion,numericEvidenceVersion} from '../server/document-values.js';
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

assert.equal(requestedMeasureConversion('ファイルは何KBまで？','5120 KB',[{quote:'ファイルは5 MBまでです。'}]),'5 MB = 5000 KB');
assert.equal(requestedMeasureConversion('荷物は何グラムまで？','5 kgまで',[{quote:'荷物は5 kgまでです。'}]),'5 kg = 5000 グラム');
assert.equal(requestedMeasureConversion('ファイルは何KB？','不明です。',[{quote:'ファイルは5 MBまでです。'}]),null);
assert.equal(requestedMeasureConversion('ファイルは何KB？','5 MB',[{quote:'Aは5 MB、Bは6 MBです。'}]),null,'Do not choose between ambiguous limits');
assert.equal(supportsDatesAndMeasures('5000000001 B',[{quote:'上限は5 GBです。'}]),false,'Integer values must not drift even by one byte');
console.log('PASS requested unit conversions compute only from one grounded value; ambiguous or unknown values remain unconverted');

assert.equal(requestedMeasureConversion('何グラムですか','5000 g',[{quote:'The weight is at most 5 kg.'}]),'5 kg以下 = 5000 グラム以下');assert.equal(requestedMeasureConversion('何グラムですか','5000 g',[{quote:'The weight is at most 5 kg.'},{quote:'The weight is at least 5 kg.'}]),null);console.log('PASS unit conversion preserves bounds and refuses conflicting constraints');

assert.equal(numericEvidenceVersion(['£.50']),37);assert.equal(numericEvidenceVersion(['費用は500円です。']),35);assert.equal(numericText('5 pounds of flour'),'5 pounds of flour');console.log('PASS only affected numeric evidence invalidates its answer cache; weight pounds are not treated as currency');
