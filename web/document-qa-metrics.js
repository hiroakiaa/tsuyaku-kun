const key = 'document-qa-metrics-v1';
const counts=['answers','items','unsupported','translations','reused'];
function validRow(row){
 return row && typeof row.id==='string' && row.id && typeof row.title==='string' &&
  counts.every(name=>Number.isSafeInteger(row[name])&&row[name]>=0) &&
  Number.isFinite(row.answerMs)&&row.answerMs>=0&&row.unsupported<=row.items&&row.reused<=row.translations;
}

export function documentQaMetrics() {
  try {
    const rows = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(rows) ? rows.filter(validRow).slice(0,100) : [];
  } catch { return []; }
}

export function recordDocumentQaMetric(id,title,sample) {
  if (typeof id!=='string'||!id||typeof title!=='string'||!sample) return;
  if(sample.translation){if(!['cache','in-flight','generated'].includes(sample.translation))return;}
  else if(!Number.isFinite(sample.ms)||sample.ms<0||!Number.isSafeInteger(sample.items)||sample.items<0||!Number.isSafeInteger(sample.unsupported)||sample.unsupported<0||sample.unsupported>sample.items)return;
  const rows = documentQaMetrics();
  const row = rows.find(entry=>entry.id===id) ?? {
    id,title,answers:0,answerMs:0,items:0,unsupported:0,translations:0,reused:0,
  };
  row.title = title;
  if (sample.translation) {
    row.translations++;
    if (['cache','in-flight'].includes(sample.translation)) row.reused++;
  } else {
    row.answers++;
    row.answerMs += sample.ms;
    row.items += sample.items;
    row.unsupported += sample.unsupported;
  }
  if(!validRow(row))return;
  try { localStorage.setItem(key,JSON.stringify([row,...rows.filter(entry=>entry.id!==id)].slice(0,100))); } catch {}
}

export function documentQaMetricCells(row) {
  if(!validRow(row))return [typeof row?.title==='string'?row.title:'資料','未計測','未計測','未計測'];
  const ratio=(count,total)=>total ? Math.round(count/total*100)+'％（'+count+'/'+total+'）' : '未計測';
  return [row.title,row.answers ? (row.answerMs/row.answers/1000).toFixed(2)+'秒' : '未計測',
    ratio(row.reused,row.translations),ratio(row.unsupported,row.items)];
}
