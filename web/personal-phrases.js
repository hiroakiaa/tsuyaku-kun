import {translationField} from './core.js?v=20261007-progressive-1';
const key='tsuyaku-personal-phrases-v1';
export class PersonalPhrases{
 constructor(storage){this.storage=storage;try{const saved=JSON.parse(storage.getItem(key));this.rows=Array.isArray(saved?.rows)?saved.rows.slice(0,100):[];this.seen=Array.isArray(saved?.seen)?saved.seen.slice(-500):[];}catch{this.rows=[];this.seen=[];}}
 observe(record){if(record.source!=='ja'||record.status!=='ready'||record.continuing||record.final===false||record.speaker==='相手'||!record.id||this.seen.includes(record.id))return false;
 const text=String(record.text||'').normalize('NFKC').trim();if(/^(?:あ+|う+|え+|ん+|はい|いいえ|えー|あの|その)$/.test(text))return false;if(text.length<2||text.length>240||/https?:|@|\d{3}[-ー]\d{3,4}[-ー]\d{4}|認識でき|聞き取れ/.test(text))return false;
 if(!record.translations||!Object.entries(record.translations).some(([code,value])=>code!=='ja'&&value))return false;
 this.seen.push(record.id);this.seen=this.seen.slice(-500);let row=this.rows.find(r=>r.jaText===text);if(!row){const kind=text.length<=16&&!/[。！？?]|です|ます|ください|しましょう/.test(text)?'term':'phrase';row={id:'personal-'+Date.now()+'-'+this.rows.length,kind,title:text,ja:text,jaText:text,category:kind==='term'?'あなたのよく使うことば':'あなたのよく使う文',useCount:0};this.rows.push(row);}row.useCount++;row.updatedAt=Date.now();for(const [code,value]of Object.entries(record.translations)){const field=translationField(code);if(field&&typeof value==='string'&&value.trim())row[field]=value;}
 this.rows.sort((a,b)=>b.updatedAt-a.updatedAt);this.rows=this.rows.slice(0,100);try{this.storage.setItem(key,JSON.stringify({rows:this.rows,seen:this.seen}));}catch{}return row.useCount>=2;
 }
 list(kind='phrase'){return this.rows.filter(r=>r.useCount>=2&&(r.kind||'phrase')===kind).sort((a,b)=>b.useCount-a.useCount||b.updatedAt-a.updatedAt);}
}
