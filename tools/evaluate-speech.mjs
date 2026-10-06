import fs from 'node:fs/promises';
import {speechScore} from './speech-score.js';
const file=process.argv[2]||new URL('../tests/speech-benchmark.json',import.meta.url);
const data=JSON.parse(await fs.readFile(file,'utf8'));
const measured=data.cases.filter(r=>typeof r.recognized==='string');
console.log(JSON.stringify({schema:'tsuyaku-speech-evaluation-v1',total:data.cases.length,measured:measured.length,unmeasured:data.cases.length-measured.length,results:measured.map(r=>({id:r.id,...speechScore(r.expected,r.recognized),speechToDisplayMs:Number.isFinite(r.speechToDisplayMs)?r.speechToDisplayMs:null})),limitations:'同じ音声を使って比較する。意味の誤り・否定・専門用語・翻訳の自然さは人が確認する。未計測を成功扱いにしない。'},null,2));
