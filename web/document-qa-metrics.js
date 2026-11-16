const key = 'document-qa-metrics-v1';

export function documentQaMetrics() {
  try {
    const rows = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export function recordDocumentQaMetric(id,title,sample) {
  if (!id) return;
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
  try { localStorage.setItem(key,JSON.stringify([row,...rows.filter(entry=>entry.id!==id)].slice(0,100))); } catch {}
}
