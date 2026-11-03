import {matchingLanguages} from './language-registry.js';
let searchSequence=0;
export function fillLanguageOptions(select,languages,selected,query=select.dataset.languageQuery||''){
 const doc=select.ownerDocument,matches=matchingLanguages(languages,query),groups=[];
 const add=(label,rows)=>{if(!rows.length)return;const group=doc.createElement('optgroup');group.label=label;for(const l of rows){const option=doc.createElement('option');option.value=l.code;option.textContent=select.dataset.languageNative==='true'?(l.labelNative||l.labelJa):[l.labelJa,l.labelNative].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' / ');if(!l.recognition&&l.code!=='ja-easy')option.textContent+=' · Text';group.append(option);}groups.push(group);};
 const chosen=languages.find(l=>l.code===selected);if(chosen&&!matches.some(l=>l.code===selected))add('現在の言語 / Selected',[chosen]);add('よく使う言語 / Common',matches.filter(l=>l.common));add('その他の言語・文字翻訳 / More languages · text',matches.filter(l=>!l.common));select.replaceChildren(...groups);if(languages.some(l=>l.code===selected))select.value=selected;const status=select.dataset.languageStatus&&doc.getElementById(select.dataset.languageStatus);if(status)status.textContent=query.trim()?(matches.length?'候補 '+matches.length+' · Select a language':'候補なし / No matching languages'):'';return matches.length;
}
export function installLanguageSearch(select,getLanguages){
 if(select.dataset.languageSearch==='true')return;select.dataset.languageSearch='true';
 const doc=select.ownerDocument,search=doc.createElement('input'),status=doc.createElement('small');
 const title=select.getAttribute('aria-label')||(select.parentElement?.tagName==='LABEL'?[...select.parentElement.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim().slice(0,100):'言語');
 search.type='search';search.placeholder='言語を検索 / Search languages';search.setAttribute('aria-label',(title||'言語')+'を検索 / Search languages');search.autocomplete='off';search.spellcheck=false;search.maxLength=80;search.dir='auto';search.style.width='100%';
 status.id='language-search-status-'+(++searchSequence);select.dataset.languageStatus=status.id;status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');status.style.display='block';
 for(const control of [search,select])control.setAttribute('aria-describedby',[control.getAttribute('aria-describedby'),status.id].filter(Boolean).join(' '));
 select.before(search);select.after(status);
 const update=()=>{select.dataset.languageQuery=search.value;fillLanguageOptions(select,getLanguages(),select.value,search.value);};
 search.oninput=update;search.addEventListener('search',update);
 search.onkeydown=e=>{
  if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'&&search.value){e.preventDefault();e.stopPropagation();search.value='';update();return;}
  if(e.key==='ArrowDown'){e.preventDefault();select.focus();return;}
  if(e.key==='Enter'){e.preventDefault();const matches=matchingLanguages(getLanguages(),search.value);if(search.value.trim()&&matches.length===1){select.value=matches[0].code;select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));select.focus();}else select.focus();}
 };
 select.addEventListener('change',()=>{search.value='';select.dataset.languageQuery='';status.textContent='';fillLanguageOptions(select,getLanguages(),select.value);});
}
