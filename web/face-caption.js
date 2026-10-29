// Presentation only: keep the original text, translations and playback actions.
export function compactFaceCaption(article,record,{el,icon,modal,englishOpen=false}){
 article.classList.add('caption-face');
 const other=record.speaker==='相手';article.dataset.faceSide=other?'other':'self';
 const meta=article.querySelector('.caption-meta'),oldSpeaker=meta.firstElementChild;
 const speaker=el('span',undefined,'face-caption-speaker'),circle=el('span',undefined,'face-caption-avatar');
 circle.setAttribute('aria-hidden','true');
 const person=article.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
 person.setAttribute('viewBox','0 0 24 24');person.setAttribute('width','16');person.setAttribute('height','16');person.setAttribute('fill','currentColor');person.setAttribute('focusable','false');
 const shape=article.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d','M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 8 0 0 1 16 0v2Z');person.append(shape);circle.append(person);
 speaker.append(circle,el('span',other?'相手':'自分'));oldSpeaker?.replaceWith(speaker);
 const actions=[...meta.querySelectorAll('button[aria-label="日本語を直す"],button[aria-label="訳を確認して覚える"]')];
 const header=el('div',undefined,'face-caption-header');
 if(actions.length){const more=el('button','…','face-caption-more');more.type='button';more.setAttribute('aria-label','この発言の操作');more.setAttribute('aria-haspopup','dialog');
  for(const action of actions){action.remove();action.append(el('span',action.getAttribute('aria-label')));}
  more.onclick=()=>{const content=el('div',undefined,'face-caption-actions');content.append(...actions);modal('この発言の操作',content);};header.append(more);
 }
 header.append(speaker);meta.prepend(header);
 const rows=[...article.querySelectorAll(':scope > .caption-line')];
 for(const row of rows)row.querySelector('.caption-language')?.setAttribute('hidden','');
 const source=rows.find(row=>row.classList.contains('caption-line-source'));
 const primary=rows.find(row=>row.classList.contains('caption-line-primary'));
 for(const row of [source,primary,...rows].filter((row,i,a)=>row&&a.indexOf(row)===i))article.append(row);
 const english=rows.find(row=>row.dataset.language==='en'&&row!==source&&row!==primary);
 if(english){const detail=el('details',undefined,'face-caption-english');detail.open=englishOpen;detail.append(el('summary','英語訳'),english);article.append(detail);}
}
