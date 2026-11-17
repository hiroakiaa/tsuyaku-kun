import {recordDocumentQaMetric} from './document-qa-metrics.js?v=1';
import {layoutPdfText} from './document-table.js?v=94';
import {installLocalIcons,localIcon} from './icons.js?v=library';
import {config} from './config.js';
import {withEasyJapanese} from './core.js';
import {createDocumentUiLocale} from './document-ui-locale.js?v=3';
const $ = (selector) => document.querySelector(selector);
const content = $('#content');
const id = new URLSearchParams(location.search).get('id');
const documentLanguages=withEasyJapanese({languages:[]}).languages;
const languagePreference='tsuyaku-document-language';
const defaultDocumentLanguage='ja';
let selectedLanguage=defaultDocumentLanguage;
try { selectedLanguage=localStorage.getItem(languagePreference)??defaultDocumentLanguage; } catch {}
if (selectedLanguage && !documentLanguages.some(language=>language.code===selectedLanguage)) selectedLanguage=defaultDocumentLanguage;
const setUiLanguage=createDocumentUiLocale(content,language=>request('/documents/ui-language/'+encodeURIComponent(language)));
setUiLanguage(selectedLanguage);
window.addEventListener('document-language-change',()=>setUiLanguage(selectedLanguage));
function addLanguagePicker(parent) {
  const select=document.createElement('select');
  select.className='document-language';
  select.setAttribute('aria-label','資料QAの利用言語');
  select.title='母国語を選ぶと、資料と回答をその言語で表示します';
  select.add(new Option('母国語：自動',''));
  for (const language of documentLanguages) {
    select.add(new Option(language.labelNative,language.code));
  }
  select.value=selectedLanguage;
  select.addEventListener('change',()=>{
    selectedLanguage=select.value;
    try { localStorage.setItem(languagePreference,selectedLanguage); } catch {}
    window.dispatchEvent(new Event('document-language-change'));
  });
  window.addEventListener('storage',event=>{
    if(event.key!==languagePreference) return;
    select.value=event.newValue??defaultDocumentLanguage;
    selectedLanguage=select.value;
    window.dispatchEvent(new Event('document-language-change'));
  });
  parent.prepend(select);
}
let pdfModule;
let authModule, session;
async function authHeaders(headers={}) {
  authModule ??= Promise.all([
    import('https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js'),
  ]).then(([app,api])=>({api,auth:api.getAuth(app.initializeApp(config.firebase))}));
  const {api,auth} = await authModule;
  session ??= auth.authStateReady().then(async()=>auth.currentUser || (await api.signInAnonymously(auth)).user).catch(error=>{session=undefined;throw error;});
  const user = await session;
  return {...headers,Authorization:'Bearer ' + await user.getIdToken()};
}

async function pdfLibrary() {
  if (!pdfModule) {
    pdfModule = import('./pdf.min.mjs?v=legacy-5.6.205').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs?v=legacy-5.6.205',import.meta.url).href;
      return lib;
    }).catch(error=>{pdfModule=undefined;throw error;});
  }
  return pdfModule;
}

async function openPdf(input) {
  const lib = await pdfLibrary();
  return lib.getDocument({...input, isEvalSupported:false, stopAtErrors:true}).promise;
}

async function request(url, options) {
  const res = await fetch(config.api + url, {...options, headers:await authHeaders(options?.headers)});
  const data = await res.json().catch(()=>null);
  if (!res.ok || !data) {
    throw Object.assign(new Error(data?.error || '通信できませんでした。もう一度お試しください。'), {status:res.status});
  }
  return data;
}

function show(template) {
  content.replaceChildren($(template).content.cloneNode(true));
}

function append(parent, tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function pdfPageTextStatus(text,number) {
  const compact=text.normalize('NFKC').replace(/\s+/gu,'');
  const pageNumberOnly=[String(number),'ページ'+number,number+'ページ','-'+number+'-'].includes(compact);
  return {requiresOcr:!compact || pageNumberOnly,pageNumberOnly};
}
async function extract(file, status) {
  let pdf, ocr;
  try {
    pdf = await openPdf({data:new Uint8Array(await file.arrayBuffer())});
    if (pdf.numPages > 40) throw new Error('40ページ以内のPDFを選んでください。');
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      status.textContent = 'PDFを読んでいます… ' + n + ' / ' + pdf.numPages;
      const page = await pdf.getPage(n);
      // Older Safari supports stream readers without supporting stream iteration.
      const reader = page.streamTextContent().getReader();
      const parts = [];
      try {
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          for (const item of value.items) {
            parts.push(item);
          }
        }
      } finally {
        reader.releaseLock();
      }
      let text = layoutPdfText(parts);
      const {requiresOcr,pageNumberOnly}=pdfPageTextStatus(text,n);
      if (requiresOcr) {
        status.textContent = 'スキャンページを端末で読んでいます… ' + n + ' / ' + pdf.numPages;
        const {createPdfOcr} = await import('./document-ocr.js?v=101');
        ocr ??= await createPdfOcr((await pdfLibrary()).OPS);
        if (page.rotate) {
          const runs=await ocr.readLayout(page,pageNumberOnly ? parts : []).catch(()=>[]);
          text=runs.map(run=>run.str).join('\n');
        } else text='';
        if (text.replace(/\s/gu,'').length<8) text=await ocr.read(page,{pageNumberOnly});
      }
      pages.push(text);
    }
    if (!pages.some(page=>page.length >= 8)) throw new Error('PDFから検索できる文字を読み取れませんでした。文字が鮮明なPDFをお試しください。');
    if (pages.join('').length > 22000) throw new Error('文字数が多すぎます。資料を分けてください。');
    return pages;
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('パスワードのないPDFを使ってください。');
    if (error.name === 'InvalidPDFException') throw new Error('PDFを開けませんでした。ファイルを確認してください。');
    throw error;
  } finally {
    try { await ocr?.close(); } finally { await pdf?.destroy(); }
  }
}

function readingPosition(id, update) {
  const key = 'tsuyaku-reading:'+id;
  try {
    const previous = JSON.parse(localStorage.getItem(key) || '{}');
    if (update) localStorage.setItem(key,JSON.stringify({...previous,...update}));
    return previous;
  } catch { return {}; }
}

function filterLibrary(entries) {
  const normalize = value => value.normalize('NFKC').toLowerCase();
  const term = normalize($('#library-search').value.trim());
  const createdAt = entry => entry.createdAt ?? (entry.expires ? entry.expires-30*86400000 : 0);
  const sort = $('#library-sort').value;
  return entries.filter(entry=>normalize(entry.title).includes(term)).sort((a,b)=>{
    if (sort==='title') return a.title.localeCompare(b.title,'ja');
    if (sort==='recent') {
      const difference = (readingPosition(b.id).opened ?? 0)-(readingPosition(a.id).opened ?? 0);
      if (difference) return difference;
    }
    return createdAt(b)-createdAt(a);
  });
}

function documentLibrary() {
  const key = 'tsuyaku-document-library';
  const list = $('#library-list');
  const status = $('#library-status');
  let entries = [];
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(stored)) entries = stored.filter(entry=>typeof entry?.title==='string' && /^[a-f0-9-]{36}$/.test(entry.id));
  } catch { if (status) status.textContent = '保存済みの資料を読み込めませんでした。'; }
  function save(next) {
    try { localStorage.setItem(key,JSON.stringify(next)); }
    catch { if (status) status.textContent = 'ブラウザーに保存できませんでした。'; return false; }
    entries = next;
    if (list) render();
    return true;
  }
  function render() {
    list.replaceChildren();
    const matches = filterLibrary(entries);
    if (!matches.length) append(list,'li',entries.length ? '一致する資料がありません。' : '保管した資料はまだありません。','fine');
    for (const entry of matches) {
      const card = append(list,'li','','library-card');
      const icon = append(card,'span','','library-icon');
      icon.append(localIcon('book-open'));
      icon.setAttribute('aria-hidden','true');
      const body = append(card,'div','','library-card-body');
      const link = append(body,'a',entry.title);
      const guide = new URL('documents.html', location.href);
      guide.searchParams.set('id', entry.id);
      if (window.parent !== window) guide.searchParams.set('embedded', '1');
      guide.searchParams.set('v', '39');
      link.href = guide.href;
      if (typeof entry.shared==='boolean') append(body,'small',entry.shared?'共通保管庫に公開':'作成したブラウザーで閲覧');
      const remove = append(card,'button','','library-remove');
      remove.append(localIcon('trash'));
      remove.title = '一覧から外す';
      remove.type = 'button';
      remove.setAttribute('aria-label',entry.title+'を保管庫から外す');
      remove.onclick = ()=>{ if (save(entries.filter(item=>item.id!==entry.id))) status.textContent = '保管庫から外しました。'; };
    }
  }
  function add(entry) {
    const previous = entries.find(item=>item.id===entry.id);
    return save([{...previous,...entry},...entries.filter(item=>item.id!==entry.id)]);
  }
  if (list) {
    $('#library-search').addEventListener('input',render);
    $('#library-sort').addEventListener('change',render);
    render();
  }
  return add;
}

function teacher() {
  show('#teacher');
  installLocalIcons($('#content'));
  const saveGuide = documentLibrary();
  const status = $('#upload-status');
  const fileInput = $('#upload [name="pdf"]');
  let preflight;
  function preparePdf(file) {
    return extract(file,document.createElement('span')).then(pages=>({pages}),error=>({error}));
  }
  fileInput.addEventListener('change', async () => {
    if ($('#upload button').disabled) return;
    const file = fileInput.files[0];
    preflight = undefined;
    status.textContent = '';
    if (!file || !/\.pdf$/i.test(file.name) || file.size>5000000) return;
    const progress = document.createElement('span');
    const pending = extract(file,progress).then(pages=>({pages}),error=>({error}));
    preflight = {file,pending};
    status.textContent = 'PDFの文字を確認しています…';
    const {error} = await pending;
    if (preflight?.pending!==pending) return;
    if (error) preflight = undefined;
    if (!$('#upload button').disabled) {
      status.textContent = error?.message || 'PDFの文字を確認しました。';
    }
  });
  $('#upload').addEventListener('submit',async event=>{
    event.preventDefault();
    const button = event.submitter;
    const data = new FormData(event.currentTarget);
    const file = data.get('pdf');
    if (file.size > 5000000) { status.textContent = 'PDFは5 MBまでです。'; return; }
    button.disabled = true;
    $('#result').hidden = true;
    button.setAttribute('aria-busy','true');
    button.querySelector('span').textContent = '作成中…';
    status.textContent = '';
    $('#create-estimate').hidden = false;
    try {
      if (/\.pdf$/i.test(file.name)) {
        const {pages,error} = await (preflight?.file===fileInput.files[0] ? preflight.pending : preparePdf(file));
        if (error) throw error;
        data.set('pages',JSON.stringify(pages));
      }
      if (!/\.pdf$/i.test(file.name)) {
        const {convertDocument}=await import('./document-convert.js?v=94');
        const converted=await convertDocument(file);
        data.set('pdf',converted.file);
        data.set('converted','1');
        if (/\.xlsx$/i.test(file.name)) data.set('convertedWorksheet','1');
        const pages = converted.image ? await extract(converted.file,document.createElement('span')) : converted.pages;
        data.set('pages',JSON.stringify(pages));
      }
      const {id,createdAt} = await request('/documents',{method:'POST',body:data});
      status.textContent = '作成が完了しました。';
      const url = '?id=' + id;
      $('#open-guide').href = url;
      $('#guide-url').value = new URL(url,location.href).href;
      $('#result').hidden = false;
      const shared = data.get('visibility')==='shared';
      $('#guide-url').closest('label').hidden = !shared;
      $('#copy').hidden = !shared;
      if (!saveGuide({id,title:String(data.get('title')).trim(),createdAt,shared})) {
        status.textContent = '資料を作成しましたが、保管庫には保存できませんでした。';
        return;
      }
    } catch (error) {
      status.textContent = error.message;
    } finally {
      $('#create-estimate').hidden = true;
      button.removeAttribute('aria-busy');
      button.querySelector('span').textContent = '作成する';
      button.disabled = false;
    }
  });
  $('#copy').addEventListener('click',async ()=>{
    try { await navigator.clipboard.writeText($('#guide-url').value); status.textContent = 'URLをコピーしました。'; }
    catch { $('#guide-url').select(); status.textContent = '選択したURLをコピーしてください。'; }
  });
}

async function reader() {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('資料のURLを確認してください。');
  const api = '/documents/' + id;
  let doc;
  try {
    doc = await request(api);
  } catch (error) {
    if (!(error instanceof TypeError) && error.status !== 429 && !(error.status >= 500)) throw error;
    content.replaceChildren();
    const panel = append(content,'section','','panel');
    const message = append(panel,'p','資料を読み込めませんでした。時間をおいて再試行してください。');
    message.setAttribute('role','alert');
    const retry = append(panel,'button','再読み込み');
    retry.type = 'button';
    retry.onclick = () => location.reload();
    return;
  }
  show('#reader');
  addLanguagePicker($('.qa-actions'));
  document.title = doc.title + '｜資料QA君';
  $('#doc-title').textContent = doc.title;
  $('#ask-heading').textContent = doc.title;
  if (!doc.items.length) $('#points-title').textContent = '資料から抜き出した要点';
  const dialog = $('#pdf-dialog');
  const askDialog=$('#ask-dialog');
  if(window.parent!==window){
    const syncFullscreen=()=>{
      const open=dialog.open||askDialog.open;
      const host=window.frameElement?.closest('dialog.documents-dialog');
      if (host) host.classList.toggle('document-fullscreen',open);
      else window.parent.postMessage({type:'document-fullscreen',open},location.origin);
    };
    const observer=new MutationObserver(syncFullscreen);
    for(const panel of [dialog,askDialog])observer.observe(panel,{attributes:true,attributeFilter:['open']});
    syncFullscreen();
    window.addEventListener('pagehide',()=>window.parent.postMessage({type:'document-fullscreen',open:false},location.origin));
  }
  const tabs = [...document.querySelectorAll('.doc-tabs [role=tab]')];
  function selectTab(tab) {
    for (const t of tabs) {
      t.setAttribute('aria-selected',String(t===tab));
      t.tabIndex = t===tab ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = t!==tab;
    }
  }
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>{
      selectTab(tab);
      if (tab.id==='tab-ask') {
        $('#ask-dialog').showModal();
        syncWorkspace();
      }
    });
    tab.addEventListener('keydown',event=>{
      const index = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if (index===undefined) return;
      event.preventDefault();
      tabs[index].focus();
    });
  });
  $('#ask-dialog').addEventListener('close',()=>{
    if (dialog.open) dialog.close();
    selectTab(tabs[0]);
    tabs[0].focus();
  });
  $('#qa-source').addEventListener('click',()=>{
    if (!wide.matches && dialog.open) dialog.close();
    else void showPdf(citation?.page || selectedPage || 1);
  });
  const sourceType = doc.sourceType ?? 'pdf';
  if (sourceType!=='pdf') {
    $('#qa-source').textContent = '資料データを表示';
  }
  let opened,originalUrl,officeText,officeRender = 0;
  function getOriginalPdf() {
    return opened ??= (async()=>{
      const blob = await fetch(config.api + api + '/pdf',{headers:await authHeaders()}).then(response=>{
        if (!response.ok) throw Error();
        return response.blob();
      }).catch(()=>{throw Error('PDF取得に失敗しました。');});
      const pdf = await openPdf({data:new Uint8Array(await blob.arrayBuffer())})
        .catch(()=>{throw Error('PDFの解析に失敗しました。');});
      originalUrl = URL.createObjectURL(blob);
      return pdf;
    })().catch(error=>{opened=undefined;throw error;});
  }
  const officeType = ['xlsx','docx'].includes(sourceType);
  const previousPage = readingPosition(id,{opened:Date.now()}).page;
  let selectedPage = Number.isInteger(previousPage) && previousPage>=1 && previousPage<=doc.pageCount ? previousPage : 0;
  const tocButton = $('#pdf-toc-toggle');
  const toc = $('#pdf-toc');
  function syncContentsPage() {
    const rows = [...toc.querySelectorAll('.pdf-toc-entry')];
    const start = Math.max(0,...rows.map(row=>Number(row.dataset.page)).filter(page=>page<=selectedPage));
    for (const row of rows) {
      if (Number(row.dataset.page)===start) row.setAttribute('aria-current','page');
      else row.removeAttribute('aria-current');
    }
  }
  function showContents(open) {
    toc.inert = !open;
    toc.setAttribute('aria-hidden',String(!open));
    toc.hidden = false;
    tocButton.setAttribute('aria-expanded',String(open));
  }
  if (sourceType==='pdf') {
    const findToggle = $('#pdf-find-toggle');
    const findPanel = $('#pdf-find');
    const queryInput = $('#pdf-find-query');
    const results = findPanel.querySelector('ul');
    const status = findPanel.querySelector('[role="status"]');
    let pageText;
    function setFindOpen(open) {
      findPanel.hidden = !open;
      findToggle.setAttribute('aria-expanded',String(open));
    }
    findToggle.hidden = false;
    findToggle.onclick = () => {
      const open = findPanel.hidden;
      setFindOpen(open);
      if (open) {
        showContents(false);
        queryInput.focus();
      }
    };
    dialog.addEventListener('close',()=>setFindOpen(false));
    findPanel.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const normalize = text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
      const query = normalize(queryInput.value);
      if (!query) return;
      const submit = event.submitter;
      submit.disabled = true;
      results.replaceChildren();
      status.textContent = '検索しています…';
      try {
        pageText ??= await request(api+'/text');
        for (const [index,text] of pageText.entries()) {
          if (!normalize(text).includes(query)) continue;
          const item = append(results,'li','');
          const button = append(item,'button',(index+1)+'ページ');
          button.type = 'button';
          button.onclick = () => {
            setFindOpen(false);
            findToggle.focus();
            void showPdf(index+1);
          };
        }
        status.textContent = results.children.length ? results.children.length+'ページに一致' : '一致するページがありません。';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
    let entries = doc.toc ?? [];
    let loading = false;
    function renderContents() {
      toc.replaceChildren();
      for (const {title,page} of entries) {
        const button = append(toc,'button','','pdf-toc-entry');
        button.title = title;
        button.dataset.page = page;
        append(button,'span',String(page),'pdf-toc-page');
        append(button,'span',title,'pdf-toc-title');
        button.type = 'button';
        button.onclick = () => {
          showContents(false);
          tocButton.focus();
          void showPdf(page);
        };
      }
      syncContentsPage();
    }
    tocButton.hidden = false;
    tocButton.onclick = async () => {
      const open = tocButton.getAttribute('aria-expanded')!=='true';
      if (open) setFindOpen(false);
      showContents(open);
      if (!open || loading) return;
      if (entries.length) {
        renderContents();
        return;
      }
      loading = true;
      toc.replaceChildren();
      const status = append(toc,'p','本文から目次を作っています…');
      status.setAttribute('role','status');
      try {
        entries = await request(api+'/toc',{method:'POST'});
        renderContents();
      } catch {
        status.textContent = '目次生成に失敗しました。「目次」を開き直して再試行できます。';
      } finally {
        loading = false;
      }
    };
    document.addEventListener('pointerdown',event=>{
      if (tocButton.getAttribute('aria-expanded')==='true' &&
          !toc.contains(event.target) && !tocButton.contains(event.target) && !event.target.closest('.pdf-navigation')) showContents(false);
    });
    dialog.addEventListener('close',()=>showContents(false));
  }
  let pageViews;
  const pageList = $('#pdf-pages');
  const visiblePages = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      visiblePages.unobserve(entry.target);
      void renderPage(entry.target);
    }
  }, {root:$('#pdf-scroll'),rootMargin:'500px 0px'});
  const visibleCitationMarks = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('pdf-citation-visible');
      visibleCitationMarks.unobserve(entry.target);
    }
  }, {root:$('#pdf-scroll')});
  function removeCitationMarks(container) {
    for (const mark of container.querySelectorAll('.pdf-citation-mark')) {
      visibleCitationMarks.unobserve(mark);
      mark.remove();
    }
  }
  let citation;
  function citationRanges(text, sourceQuote, normalize) {
    const locate = source=>{
      const literal = normalize(source);
      const quote = text.includes(literal) ? literal : literal.replaceAll('|','');
      const start = quote ? text.indexOf(quote) : -1;
      if (start<0 || text.indexOf(quote,start+1)>=0) return null;
      return {start,end:start+quote.length};
    };
    const whole = locate(sourceQuote);
    return whole ? [whole] : sourceQuote.split(/\n|\s\|\s/u)
      .filter(fragment=>normalize(fragment).length>=8)
      .map(locate).filter(Boolean);
  }
  const scanLayouts=new Map();
  const pdfTextLayers=new WeakMap();
  async function pageTextRuns(page) {
    if (!pdfTextLayers.has(page)) {
      pdfTextLayers.set(page,page.getTextContent().catch(error=>{
        pdfTextLayers.delete(page);
        throw error;
      }));
    }
    const {items}=await pdfTextLayers.get(page);
    const number=page.pageNumber;
    const {requiresOcr,pageNumberOnly}=pdfPageTextStatus(layoutPdfText(items),number);
    if (!requiresOcr) return items;
    if (!scanLayouts.has(number)) {
      scanLayouts.set(number,(async()=>{
        const {createPdfOcr}=await import('./document-ocr.js?v=101');
        const reader=await createPdfOcr((await pdfLibrary()).OPS);
        try {
          const runs=await reader.readLayout(page,pageNumberOnly ? items : []);
          if (!runs.length) console.warn('Document QA: no OCR line boxes for PDF page',number);
          return runs;
        }
        finally { await reader.close(); }
      })().catch(()=>{
        console.warn('Document QA: scan layout recognition failed for PDF page',number);
        scanLayouts.delete(number);
        return [];
      }));
    }
    const runs=await scanLayouts.get(number);
    return runs.length ? runs : items;
  }
  async function highlightCitation(slot,page,viewport) {
    const selected = citation;
    if (!selected || selected.page!==Number(slot.dataset.page)) return;
    const items = await pageTextRuns(page);
    const scan = items.some(item=>item.ocr);
    const normalize = text=>text.normalize('NFKC').replace(scan ? /[\s、。]+/gu : /\s+/gu,'');
    if (citation!==selected) return;
    const runs = items.filter(item=>item.str).map(item=>({item,text:normalize(item.str)}));
    const text = runs.map(run=>run.text).join('');
    const ranges=citationRanges(text,selected.quote,normalize);
    if (scan && !ranges.length) console.warn('Document QA: citation did not match OCR lines for page',selected.page);
    removeCitationMarks(slot);
    slot.classList.toggle('pdf-citation-page',ranges.length===0);
    if (!ranges.length) return;
    let offset = 0;
    let firstMark;
    for (const run of runs) {
      const end = offset+run.text.length;
      if (ranges.some(range=>end>range.start && offset<range.end)) {
        const {item} = run;
        const [x,y] = viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const mark = append(slot,'span','','pdf-citation-mark');
        firstMark ??= mark;
        const [left,top,width,height]=item.ocrBox ?? [x/viewport.width,
          (y-item.height*viewport.scale)/viewport.height,item.width*viewport.scale/viewport.width,
          item.height*viewport.scale/viewport.height];
        mark.style.left=left*100+'%';
        mark.style.top=top*100+'%';
        mark.style.width=width*100+'%';
        mark.style.height=height*100+'%';
        visibleCitationMarks.observe(mark);
      }
      offset = end;
    }
    if (firstMark && dialog.open && selectedPage===selected.page) {
      preview.scrollTo({top:preview.scrollTop + firstMark.getBoundingClientRect().top - preview.getBoundingClientRect().top - preview.clientHeight*.25,behavior:scrollBehavior()});
    }
  }
  async function renderPage(slot) {
    try {
      const page = await (await opened).getPage(Number(slot.dataset.page));
      const scale = Math.min(3, Math.max(1, preview.clientWidth * devicePixelRatio / page.getViewport({scale:1}).width));
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({canvas,viewport}).promise;
      slot.replaceChildren(canvas);
      void highlightCitation(slot,page,viewport).catch(()=>{});
    } catch {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'PDF描画に失敗しました。このページを再読み込み';
      retry.onclick = () => {
        retry.remove();
        void renderPage(slot);
      };
      slot.replaceChildren(retry);
    }
  }
  const pagePicker = $('#pdf-page');
  for (let page=1;page<=doc.pageCount;page++) pagePicker.add(new Option(page+' / '+doc.pageCount,page));
  pagePicker.onchange = ()=>void showPdf(Number(pagePicker.value));
  $('#pdf-prev').onclick = ()=>void showPdf(selectedPage-1);
  $('#pdf-next').onclick = ()=>void showPdf(selectedPage+1);
  const preview = $('#pdf-scroll');
  const translationMode=$('#pdf-language');
  const translationToggle=document.getElementById("pdf-language-toggle");
  const translatedPage=$('#pdf-translation');
  const pageTranslations=new Map();
  const readyEnglishPages=new Set();
  const englishProgress=$('#pdf-english-progress');
  let translationRevision=0;
  let prefetching=false;
  let foregroundTranslation=0;
  const englishFailures=new Map();
  const prefetchFailures=new Set();
  function renderEnglishProgress() {
    englishProgress.hidden=translationMode.value!=='en';
    if (englishProgress.hidden) return;
    englishProgress.replaceChildren();
    const ready=readyEnglishPages.size;
    englishProgress.append(`English · ${ready} / ${doc.pageCount}`);
    if ([...englishFailures].some(([page,count])=>count>=2 && !readyEnglishPages.has(page))) {
      const retry=append(englishProgress,'button','Retry incomplete pages');
      retry.onclick=()=>{
        englishFailures.clear();
        renderEnglishProgress();
        void prefetchTranslations();
      };
    }
  }
  const diagramTextLayers=new WeakMap();
  async function diagramTextRuns(page,items) {
    if (!items.some(item=>item.str?.trim()) || items.some(item=>item.ocr)) return [];
    if (!diagramTextLayers.has(page)) diagramTextLayers.set(page,(async()=>{
      const {OPS}=await pdfLibrary();
      const {fnArray,argsArray}=await page.getOperatorList();
      if (!fnArray.some((op,index)=>op===OPS.paintImageXObject &&
          argsArray[index]?.[1]>=300 && argsArray[index]?.[2]>=150)) return [];
      const {createPdfOcr}=await import('./document-ocr.js?v=101');
      const reader=await createPdfOcr(OPS);
      try {
        const runs=await reader.readLayout(page,items,{diagram:true});
        return runs.filter(run=>/[\p{L}\p{N}]{2}/u.test(run.str.replace(/\s/gu,''))).slice(0,80);
      } finally { await reader.close(); }
    })().catch(()=>[]));
    return diagramTextLayers.get(page);
  }
  const pdfTranslationSources=new Map();
  function pdfTranslationSource(number,compact=false) {
    const key=number+":"+compact;
    if (!pdfTranslationSources.has(key)) {
      pdfTranslationSources.set(key,(async()=>{
        const page=await (await getOriginalPdf()).getPage(number);
        const items=await pageTextRuns(page);
        const lines=[];
        let last;
        for (const item of items) {
          if (!item.str?.trim()) continue;
          const [, , , ,x,y]=item.transform;
          const gap=last ? x-last.transform[4]-last.width : 0;
          if (item.ocr || !last || Math.abs(y-last.transform[5])>Math.max(1,item.height*.2) ||
              gap>item.height*(compact ? .4 : 1) || x<last.transform[4]) lines.push(item.str);
          else lines[lines.length-1]+=(gap>item.height*.22?' ':'')+item.str;
          last=item;
        }
        return {layout:lines.join('\n'),diagram:(await diagramTextRuns(page,items)).map(item=>item.str).join('\n')};
      })().catch(()=>undefined));
    }
    return pdfTranslationSources.get(key);
  }
  function loadPageTranslation(page,language,retry=false) {
    const key=page+':'+language;
    if (retry) pageTranslations.delete(key);
    if (!pageTranslations.has(key)) {
      pageTranslations.set(key,(async()=>{
        const layoutText=sourceType==='pdf' ? await pdfTranslationSource(page,retry) : undefined;
        const translate=(layout,diagramText)=>request(api+'/translate',{
          method:'POST',
          signal:AbortSignal.timeout(60_000),
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({page,language,layoutText:layout,diagramText}),
        });
        if (layoutText) {
          try { return await translate(layoutText.layout,layoutText.diagram); }
          catch { return translate(); }
        }
        return translate();
      })()
        .then(result=>{
          if (language==='en') {
            readyEnglishPages.add(page);
            englishFailures.delete(page);
            renderEnglishProgress();
          }
          return result;
        })
        .catch(error=>{pageTranslations.delete(key);throw error;}));
    }
    return pageTranslations.get(key);
  }
  async function prefetchTranslations() {
    if (prefetching || foregroundTranslation || document.hidden || navigator.onLine===false) return;
    const language=translationMode.value;
    const current=Number(pagePicker.value)||1;
    const englishPages=Array.from({length:doc.pageCount},(_,i)=>i+1);
    const near=current+1;
    const visible=dialog.open && language && language!=='en' && near<=doc.pageCount &&
      !prefetchFailures.has(near+':'+language) && !pageTranslations.has(near+':'+language) ? {page:near,language} : null;
    const english=englishPages.find(page=>!pageTranslations.has(page+':en') && (englishFailures.get(page)??0)<2);
    const next=visible ?? (english ? {page:english,language:'en'} : null);
    if (!next) return;
    prefetching=true;
    let delay=400;
    try { await loadPageTranslation(next.page,next.language); }
    catch {
      if (next.language==='en') englishFailures.set(next.page,(englishFailures.get(next.page)??0)+1);
      else prefetchFailures.add(next.page+':'+next.language);
      renderEnglishProgress();
      delay=1500;
    }
    finally { prefetching=false; }
    setTimeout(prefetchTranslations,delay);
  }
  function syncTranslationOptions() {
    const language=documentLanguages.find(option=>option.code===selectedLanguage);
    translationMode.replaceChildren(new Option('原文',''));
    if(language && language.code!=='ja') translationMode.add(new Option(language.labelNative,language.code));
    if(language && !['ja','ja-easy','en'].includes(language.code)) translationMode.add(new Option('English','en'));
    translationToggle.hidden=!language || language.code==='ja';
    translationToggle.replaceChildren();
    for (const option of translationMode.options) {
      const button=append(translationToggle,'button',option.textContent);
      button.type='button';
      button.dataset.language=option.value;
      button.onclick=()=>{
        translationMode.value=option.value;
        readingPosition(id,{translationMode:option.value});
        void updatePageTranslation();
      };
    }
    const savedMode=readingPosition(id).translationMode;
    const hasSavedMode=[...translationMode.options].some(option=>option.value===savedMode);
    translationMode.value=hasSavedMode ? savedMode : language && language.code!=='ja' ? language.code : '';
    for (const button of translationToggle.children) button.setAttribute("aria-pressed", String(button.dataset.language===translationMode.value));
    renderEnglishProgress();
    if (translatedPage.getClientRects().length || translationToggle.getClientRects().length) void updatePageTranslation();
  }
  function pageViewportPosition(scroller, surface) {
    if (!surface?.clientHeight || !surface.clientWidth) return null;
    const page=surface.getBoundingClientRect();
    const view=scroller.getBoundingClientRect();
    return {x:(view.left-page.left)/page.width,y:(view.top-page.top)/page.height};
  }
  function restorePageViewport(scroller,surface,position) {
    if (!surface || !position) return;
    const page=surface.getBoundingClientRect();
    const view=scroller.getBoundingClientRect();
    scroller.scrollLeft+=page.left-view.left+page.width*position.x;
    scroller.scrollTop+=page.top-view.top+page.height*position.y;
  }
  async function updatePageTranslation(retry=false) {
    const revision=++translationRevision;
    const language=translationMode.value;
    for (const button of translationToggle.children) button.setAttribute("aria-pressed",String(button.dataset.language===language));
    renderEnglishProgress();
    const page=Number(pagePicker.value)||1;
    const pageSelector='[data-page="'+page+'"]';
    const original=pageList.querySelector(pageSelector);
    const previous=translatedPage.querySelector('.pdf-translation-layout'+pageSelector);
    const position=pageViewportPosition(translatedPage,previous);
    translatedPage.hidden=!language;
    delete translatedPage.dataset.translationReuse;
    translatedPage.lang=language==='ja-easy'?'ja':language;
    if (!language) {
      restorePageViewport(preview,original,position);
      return;
    }
    const viewportPosition=position ?? pageViewportPosition(preview,original);
    translatedPage.textContent='翻訳しています…';
    foregroundTranslation++;
    try {
      const result=await loadPageTranslation(page,language,retry);
      if(revision===translationRevision) {
        if (result.reuse) translatedPage.dataset.translationReuse=result.reuse;
        if (['cache','in-flight','generated'].includes(result.reuse)) recordDocumentQaMetric(id,doc.title,{translation:result.reuse});
        if (sourceType==='pdf') {
          const sameText=text=>text.normalize('NFC').replace(/\s+/gu,' ').trim();
          if (Array.isArray(result.source) && result.source.length && result.source.length===result.lines?.length
              && result.source.every((line,index)=>sameText(line)===sameText(result.lines[index]))) {
            translatedPage.hidden=true;
            restorePageViewport(preview,original,viewportPosition);
            return;
          }
          if (!await renderTranslationOnPdf(result,page,revision,viewportPosition) && revision===translationRevision) {
            throw Error('このページでは訳文を元の位置に配置できませんでした。');
          }
        } else {
          renderTranslatedPage(result,page);
        }

      }
    } catch(error) {
      if(revision!==translationRevision) return;
      translatedPage.textContent=error.message+' ';
      append(translatedPage,'button','再試行').onclick=()=>void updatePageTranslation(true);
      append(translatedPage,'button','原文').onclick=()=>{
        translationMode.value='';
        void updatePageTranslation();
      };
    } finally {
      foregroundTranslation--;
      void prefetchTranslations();
    }
  }
  async function renderTranslationOnPdf(result,number,revision,position) {
    try {
      const pdf=await getOriginalPdf();
      const page=await pdf.getPage(number);
      const viewport=page.getViewport({scale:1});
      const nativeItems=await pageTextRuns(page);
      const items=result.includesDiagram ? [...nativeItems,...await diagramTextRuns(page,nativeItems)] : nativeItems;
      if (revision!==translationRevision) return;
      const normalize=text=>text.normalize('NFKC').replace(/\s/gu,'');
      let offset=0;
      const runs=items.filter(item=>item.str?.trim()).map(item=>{
        const start=offset;
        offset+=normalize(item.str).length;
        return {item,start,end:offset};
      });
      const pageText=runs.map(({item})=>normalize(item.str)).join('');
      const point=item=>{
        if (!item.ocrBox) return viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const [left,top,,height]=item.ocrBox;
        return [left*viewport.width,(top+height)*viewport.height];
      };
      const blocks=[];
      const measuringCanvas=document.createElement('canvas');
      const context=measuringCanvas.getContext('2d');
      const unit=viewport.width/100;
      const ranges=citation?.page===number ? citationRanges(pageText,citation.quote,normalize) : [];
      let from=0;
      for (const [index,original] of result.source.entries()) {
        const literal=normalize(original);
        const needle=pageText.startsWith(literal,from) ? literal : literal.replaceAll('|','');
        if (!needle) continue;
        const start=pageText.indexOf(needle,from);
        if (start!==from) return;
        from=start+needle.length;
        const matched=runs.filter(run=>run.end>start && run.start<from);
        if (matched[0]?.start!==start || matched.at(-1)?.end!==from) return;
        const first=matched[0].item;
        if (first.verticalLayout && matched.length===1) {
          const [left,top,width,height]=first.ocrBox;
          const boxWidth=width*viewport.width,boxHeight=height*viewport.height;
          const line=result.lines[index].trim();
          context.font=boxWidth+'px sans-serif';
          const measured=Math.max(1,context.measureText(line).width);
          const size=Math.min(boxWidth*.85,boxHeight/measured*boxWidth*.95);
          blocks.push({x:left*viewport.width,top:top*viewport.height,boxHeight,width:boxWidth,size,line,
            vertical:true,marked:ranges.some(range=>from>range.start && start<range.end)});
          continue;
        }
        if (result.includesDiagram && first.ocrBox && matched.length===1) {
          const [left,top,width,height]=first.ocrBox;
          const boxWidth=width*viewport.width;
          const boxHeight=height*viewport.height;
          const line=result.lines[index].trim().replace(/\s+/gu,' ');
          context.font=boxHeight+'px sans-serif';
          const measured=Math.max(1,context.measureText(line).width);
          const size=Math.min(boxHeight*.73,boxWidth/measured*boxHeight*.96);
          blocks.push({x:left*viewport.width,top:top*viewport.height,boxHeight,width:boxWidth,size,line,
            marked:ranges.some(range=>from>range.start && start<range.end)});
          continue;
        }
        const [x,y]=point(first);
        const height=Math.max(...matched.map(({item})=>item.height));
        if (!height || matched.some(({item})=>Math.abs(point(item)[1]-y)>height*.25 || item.transform[1] || item.transform[2])) return;
        const width=Math.max(...matched.map(({item})=>point(item)[0]+item.width))-x;
        if (!(width>0)) return;
        const nextX=runs.filter(({item})=>Math.abs(point(item)[1]-y)<height*.5)
          .map(({item})=>point(item)[0])
          .filter(value=>value>=x+width-.1);
        const available=Math.max(width,Math.min(viewport.width-8,...nextX)-x-2);
        context.font=height+'px sans-serif';
        let line=result.lines[index].trim();
        let measured=Math.max(1,context.measureText(line).width);
        let boxHeight=height*1.35;
        const top=y-height*1.08;
        const nextTop=Math.min(viewport.height,...runs.flatMap(({item})=>{
          const [nextLeft,nextBaseline]=point(item);
          if (nextBaseline<=y+height*.5 || nextLeft>=x+available || nextLeft+item.width<=x) return [];
          return [nextBaseline-item.height*1.08];
        }));
        const availableHeight=Math.max(boxHeight,nextTop-top);
        if (measured>available && availableHeight>=height*1.75) {
          const breaks=[...line.matchAll(/\s+/gu)].map(match=>match.index);
          const midpoint=breaks.reduce((best,offset)=>Math.abs(offset-line.length/2)<Math.abs(best-line.length/2) ? offset : best,Infinity);
          if (Number.isFinite(midpoint)) {
            const parts=[line.slice(0,midpoint),line.slice(midpoint).trimStart()];
            const wrappedWidth=Math.max(...parts.map(part=>context.measureText(part).width));
            const wrappedSize=Math.min(height,available/wrappedWidth*height,availableHeight/2.2);
            if (wrappedSize>available/measured*height*1.15) {
              line=parts.join('\n');
              measured=wrappedWidth;
              boxHeight=Math.max(boxHeight,wrappedSize*2.2);
            }
          }
        }
        const size=Math.min(height,available/measured*height,line.includes('\n') ? boxHeight/2.2 : height);
        if (!(size>0)) return;
        blocks.push({x,top,boxHeight,width:Math.max(width,measured*size/height),size,line,
          marked:ranges.some(range=>from>range.start && start<range.end)});
      }
      if (!blocks.length || from!==pageText.length) return;
      const frame=document.createElement('div');
      frame.className='pdf-page-view pdf-translation-layout';
      frame.dataset.page=number;
      frame.style.width=(fitWidth || translatedPage.clientWidth)*zoom+'px';
      if (citation?.page===number && !ranges.length) frame.classList.add('pdf-citation-page');
      const canvas=append(frame,'canvas','');
      const renderViewport=page.getViewport({scale:Math.min(3,devicePixelRatio||1)});
      canvas.width=Math.ceil(renderViewport.width);
      canvas.height=Math.ceil(renderViewport.height);
      await page.render({canvas,viewport:renderViewport}).promise;
      if (revision!==translationRevision) return;
      const rendered=canvas.getContext('2d');
      const scale=renderViewport.scale;
      for (const {x,top,boxHeight,width,size,line,marked,vertical} of blocks) {
        const block=append(frame,'span',line,'pdf-layout-line'+(marked?' pdf-translated-citation':''));
        if (vertical) block.style.writingMode='vertical-rl';
        block.style.left=x/unit+'%';
        block.style.top=top/viewport.height*100+'%';
        block.style.width=width/unit+'%';
        block.style.height=boxHeight/viewport.height*100+'%';
        block.style.fontSize=size/unit+'cqw';
        if (!marked && rendered) {
          const sampleX=Math.min(canvas.width-1,Math.max(0,Math.floor((x-.5)*scale)));
          const sampleY=Math.min(canvas.height-1,Math.max(0,Math.floor((top+boxHeight/2)*scale)));
          const [red,green,blue,alpha]=rendered.getImageData(sampleX,sampleY,1,1).data;
          if (alpha===255 && Math.min(red,green,blue)>=180) block.style.backgroundColor='rgb('+red+' '+green+' '+blue+')';
        }
        if (line.includes('\n')) { block.style.whiteSpace='pre'; block.style.lineHeight='1.1'; }
      }
      translatedPage.replaceChildren(frame);
      restorePageViewport(translatedPage,frame,position);
      return true;
    } catch {}
  }
  function renderTranslatedPage(result,page) {
    const normalize=text=>text.normalize('NFKC').replace(/[\s|]/gu,'');
    const quote=citation?.page===page ? normalize(citation.quote) : '';
    const source=result.source?.map(normalize)??[];
    const start=quote ? source.join('').indexOf(quote) : -1;
    if (start<0 || !Array.isArray(result.lines)) {
      translatedPage.textContent=result.text || 'このページに翻訳できる文字はありません。';
      return;
    }
    translatedPage.replaceChildren();
    let offset=0, firstMark;
    result.lines.forEach((line,index)=>{
      const end=offset+source[index].length;
      if (ranges.some(range=>end>range.start && offset<range.end)) {
        const mark=append(translatedPage,'mark',line,'pdf-translated-citation');
        firstMark??=mark;
      } else translatedPage.append(line);
      if(index<result.lines.length-1) translatedPage.append('\n');
      offset=end;
    });
    firstMark?.scrollIntoView({block:'center',behavior:'smooth'});
  }
  translationMode.onchange=()=>void updatePageTranslation();
  document.addEventListener('visibilitychange',()=>void prefetchTranslations());
  window.addEventListener('online',()=>{englishFailures.clear();prefetchFailures.clear();void prefetchTranslations();});
  window.addEventListener('document-language-change',syncTranslationOptions);
  syncTranslationOptions();
  const previewImage = $('#source-image');
  const imageType = /^(png|jpe?g|webp)$/.test(sourceType);
  const zoomable = sourceType==='pdf' || imageType;
  preview.classList.toggle('is-zoomable', zoomable);
  let zoom=1, fitWidth=0;
  let pinch, drag, coastFrame;
  let velocityX = 0, velocityY = 0, lastMove = 0;
  function coast(time) {
    const elapsed = Math.min(32,time-lastMove);
    lastMove = time;
    const left = preview.scrollLeft;
    const top = preview.scrollTop;
    preview.scrollLeft += velocityX*elapsed;
    preview.scrollTop += velocityY*elapsed;
    const decay = Math.exp(-elapsed/140);
    velocityX = preview.scrollLeft===left ? 0 : velocityX*decay;
    velocityY = preview.scrollTop===top ? 0 : velocityY*decay;
    if (Math.hypot(velocityX,velocityY)>.03) coastFrame=requestAnimationFrame(coast);
  }
  const workspace = $('.qa-workspace');
  const divider = $('#qa-divider');
  const wide = matchMedia('(min-width: 800px)');
  const expand = $('#qa-expand');
  const sourceButton = $('#qa-source');
  const updateMobileControls = () => {
    expand.hidden = wide.matches || !dialog.open;
    sourceButton.setAttribute('aria-expanded', String(dialog.open));
    sourceButton.textContent = dialog.open && !wide.matches ? '資料を折りたたむ' : sourceType==='pdf' ? '元のPDF' : '資料データを表示';
  };
  expand.onclick = () => {
    const full = workspace.classList.toggle('pdf-full');
    expand.textContent = full ? '上下表示に戻る' : 'PDF全画面';
  };
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    workspace.classList.remove('pdf-full');
    expand.textContent = 'PDF全画面';
    updateMobileControls();
  });
  const viewport = window.visualViewport;
  function syncKeyboard() {
    const editing = document.activeElement === $('#question');
    const available = window.parent === window ? viewport?.height : window.parent.visualViewport?.height;
    const keyboard = editing && !wide.matches && available && available < window.innerHeight - 90;
    workspace.classList.toggle('qa-keyboard', Boolean(keyboard));
    if (keyboard) askDialog.style.height = available + 'px';
    else askDialog.style.removeProperty('height');
  }
  viewport?.addEventListener('resize',syncKeyboard);
  if (window.parent !== window) window.parent.visualViewport?.addEventListener('resize',syncKeyboard);
  window.addEventListener('pagehide',()=>window.parent !== window && window.parent.visualViewport?.removeEventListener('resize',syncKeyboard));
  $('#question').addEventListener('focus',syncKeyboard);
  $('#question').addEventListener('blur',syncKeyboard);
  let reversed = false;
  let split = 50;
  function setSplit(value) {
    split = Math.max(25, Math.min(75, value));
    workspace.style.setProperty('--pdf-share', split + '%');
    divider.setAttribute('aria-valuenow', String(Math.round(split)));
  }
  $('#qa-swap').onclick = () => {
    reversed = !reversed;
    workspace.classList.toggle('pdf-right', reversed);
  };
  divider.onpointerdown = event => divider.setPointerCapture(event.pointerId);
  divider.onpointermove = event => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    const {left,width,top,height} = workspace.getBoundingClientRect();
    if (!wide.matches) { setSplit((event.clientY-top)/height*100); return; }
    const percent = (event.clientX-left)/width*100;
    setSplit(reversed ? 100-percent : percent);
  };
  divider.onkeydown = event => {
    if (!wide.matches && ['ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      setSplit(split + (event.key==='ArrowDown' ? 2 : -2));
      return;
    }
    if (!wide.matches || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    setSplit(split + (event.key==='ArrowRight' ? 2 : -2)*(reversed ? -1 : 1));
  };
  function syncWorkspace() {
    divider.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal');
    divider.setAttribute('aria-label', wide.matches ? '列幅' : 'PDFの高さ');
    workspace.classList.remove('pdf-full');
    expand.textContent = 'PDF全画面';
    updateMobileControls();
    if (!askDialog.open) return;
    if (wide.matches && dialog.open && dialog.parentElement === workspace) return;
    if (dialog.open) dialog.close();
    if (wide.matches) void showPdf(selectedPage || 1);
  }
  wide.addEventListener('change',syncWorkspace);
  new ResizeObserver(() => {
    if (!fitWidth || !preview.clientWidth || fitWidth===preview.clientWidth) return;
    fitWidth = preview.clientWidth;
    setZoom(zoom);
  }).observe(preview);
  function setZoom(value, from, to=from) {
    const bounds=preview.getBoundingClientRect();
    from ??= {x:bounds.width/2,y:bounds.height/2};
    to ??= from;
    const surface=imageType ? previewImage : pageList;
    const before=surface.getBoundingClientRect();
    const previous=zoom;
    zoom=Math.min(4,Math.max(.5,value));
    if (!fitWidth) return;
    surface.style.width=fitWidth*zoom+'px';
    const translated=translatedPage.querySelector('.pdf-translation-layout');
    if (translated && !translatedPage.hidden) {
      const position=pageViewportPosition(translatedPage,translated);
      translated.style.width=fitWidth*zoom+'px';
      restorePageViewport(translatedPage,translated,position);
    }
    const after=surface.getBoundingClientRect();
    preview.scrollLeft+=after.left-bounds.left+(bounds.left+from.x-before.left)*zoom/previous-to.x;
    preview.scrollTop+=after.top-bounds.top+(bounds.top+from.y-before.top)*zoom/previous-to.y;
  }
  $('.pdf-zoom').hidden=!zoomable;
  $('.pdf-navigation').hidden=sourceType!=='pdf';
  $('#zoom-in').onclick=()=>setZoom(zoom*1.25);
  $('#zoom-out').onclick=()=>setZoom(zoom/1.25);
  function measurePinch(event){
    const [a,b]=event.touches;
    const bounds=preview.getBoundingClientRect();
    return {x:(a.clientX+b.clientX)/2-bounds.left,y:(a.clientY+b.clientY)/2-bounds.top,
      distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};
  }
  preview.addEventListener('touchstart',event=>{
    if (!zoomable) return;
    cancelAnimationFrame(coastFrame);
    velocityX = velocityY = 0;
    lastMove = performance.now();
    if (event.touches.length===1) drag=event.touches[0];
    if (event.touches.length!==2) return;
    drag=undefined;
    event.preventDefault();
    pinch=measurePinch(event);
  },{passive:false});
  preview.addEventListener('touchmove',event=>{
    if (drag && event.touches.length===1) {
      const next=event.touches[0];
      const now = performance.now();
      const elapsed = Math.max(8,now-lastMove);
      const dx = drag.clientX-next.clientX;
      const dy = drag.clientY-next.clientY;
      velocityX = velocityX*.35 + dx/elapsed*.65;
      velocityY = velocityY*.35 + dy/elapsed*.65;
      preview.scrollLeft += dx;
      preview.scrollTop += dy;
      lastMove = now;
      drag=next;
    }
    if (!pinch || !pinch.distance || event.touches.length!==2) return;
    event.preventDefault();
    const next=measurePinch(event);
    setZoom(zoom*next.distance/pinch.distance,pinch,next);
    pinch=next;
  },{passive:false});
  for (const event of ['touchend','touchcancel']) preview.addEventListener(event,()=>{
    if (event==='touchend' && drag && performance.now()-lastMove<80) {
      lastMove=performance.now();
      coastFrame=requestAnimationFrame(coast);
    }
    pinch=undefined;
    drag=undefined;
  });
  dialog.addEventListener('close',()=>cancelAnimationFrame(coastFrame));
  let scrollFrame;
  let lastNavigation = 0;
  preview.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!pageViews || performance.now()-lastNavigation < 650) return;
      const top = preview.getBoundingClientRect().top;
      const index = pageViews.findIndex(slot => slot.getBoundingClientRect().bottom > top+1);
      if (index < 0) return;
      selectedPage = index+1;
      readingPosition(id,{page:selectedPage});
      syncContentsPage();
      pagePicker.value = selectedPage;
      $('#pdf-prev').disabled = selectedPage===1;
      $('#pdf-next').disabled = selectedPage===doc.pageCount;
      $('#pdf-file').href = originalUrl+'#page='+selectedPage;
    });
  }, {passive:true});
  const scrollBehavior = ()=>matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  async function showPdf(n) {
    if (n<1 || n>doc.pageCount) return;
    selectedPage = n;
    readingPosition(id,{page:n});
    syncContentsPage();
    pagePicker.value = n;
    if (translationMode.value) void updatePageTranslation();
    $('#pdf-prev').disabled = n===1;
    $('#pdf-next').disabled = n===doc.pageCount;
    $('#pdf-heading').textContent = doc.title;
    if (!askDialog.open) {
      selectTab($('#tab-ask'));
      askDialog.showModal();
    }
    if (!dialog.open) {
      workspace.prepend(dialog);
      dialog.show();
    }
    void prefetchTranslations();
    updateMobileControls();
    $('#pdf-file').removeAttribute('href');
    $('#pdf-status').textContent = sourceType==='pdf' ? 'PDFを表示しています…' : '資料を表示しています…';

    if (sourceType!=='pdf') {
      if (officeType) {
        const version = ++officeRender;
        try {
          officeText ??= request(api+'/text').catch(error=>{officeText=undefined;throw error;});
          const sheets = await officeText;
          if (version!==officeRender) return;
          selectedPage = Math.min(Math.max(1,n),sheets.length);
          readingPosition(id,{page:selectedPage});
          let panel = $('#office-preview');
          if (!panel) panel = append(preview,'section','','office-preview'), panel.id='office-preview';
          panel.replaceChildren();
          if (sourceType==='xlsx') {
            const picker = append(panel,'select','');
            picker.setAttribute('aria-label','表示するシート');
            sheets.forEach((sheet,i)=>{
              const name = sheet.split('\n',1)[0];
              picker.add(new Option(name || 'シート '+(i+1),String(i+1)));
            });
            picker.value=String(selectedPage);
            picker.onchange=()=>void showPdf(Number(picker.value));
          }
          const sheet = sheets[selectedPage-1] ?? '';
          append(panel,'pre',sourceType==='xlsx' ? sheet.split('\n').slice(1).join('\n') || 'このシートには表示できるセルがありません。' : sheet);
          preview.scrollTop=0;
        } catch (error) {
          if (version!==officeRender) return;
          $('#pdf-status').textContent=error.message;
          const retry=append($('#pdf-status'),'button','再読み込み');
          retry.onclick=()=>void showPdf(n);
          return;
        }
      }
      if (!imageType) $('#pdf-file').textContent = 'ダウンロード';
      $('#pdf-file').removeAttribute('href');
      for (const node of ['#pdf-prev','#pdf-next','#pdf-page','#pdf-pages']) $(node).hidden=true;
      try {
        if (officeType && originalUrl) { $('#pdf-file').href=originalUrl; $('#pdf-status').textContent=''; return; }
        const response=await fetch(config.api+api+'/pdf',{headers:await authHeaders()});
        if (!response.ok) throw Error('資料データを取得できませんでした。');
        if (originalUrl) URL.revokeObjectURL(originalUrl);
        const blob=await response.blob();
        originalUrl=URL.createObjectURL(imageType ? new Blob([blob],{type:'image/'+(sourceType==='jpg'?'jpeg':sourceType)}) : blob);
        $('#pdf-file').href=originalUrl;
        if(imageType){
          fitWidth=preview.clientWidth;
          previewImage.src=originalUrl;
          previewImage.alt=doc.title;
          previewImage.hidden=false;
          setZoom(zoom);
        }else $('#pdf-file').download='source.'+sourceType;
        $('#pdf-status').textContent='';
      } catch(error) { $('#pdf-status').textContent=error.message; }
      return;
    }

    try {
      const pdf = await getOriginalPdf();
      if (selectedPage === n) document.querySelector('#pdf-file').href = originalUrl + '#page=' + n;
      if (selectedPage !== n || !dialog.open) return;
      if (!pageViews) {
        const sizes = await Promise.all(Array.from({length:pdf.numPages},async (_,index) => {
          const page = await pdf.getPage(index+1);
          return page.getViewport({scale:1});
        }));
        if (selectedPage !== n || !dialog.open) return;
        pageViews = sizes.map(({width,height},index) => {
          const slot = document.createElement('div');
          slot.className = 'pdf-page-view';
          slot.dataset.page = index+1;
          slot.style.aspectRatio = width+' / '+height;
          visiblePages.observe(slot);
          return slot;
        });
        pageList.replaceChildren(...pageViews);
      }
      fitWidth = preview.clientWidth;
      setZoom(zoom);
      const slot = pageViews[n-1];
      lastNavigation = performance.now();
      preview.scrollTo({top:preview.scrollTop+slot.getBoundingClientRect().top-preview.getBoundingClientRect().top,behavior:scrollBehavior()});
      if (citation?.page===n && slot.querySelector('canvas')) void pdf.getPage(n).then(page=>highlightCitation(slot,page,page.getViewport({scale:1}))).catch(()=>{});
      $('#pdf-status').textContent = '';
    } catch (error) {
      if (error.name === 'RenderingCancelledException' || selectedPage !== n) return;
      $('#pdf-status').textContent = ['PDF取得に失敗しました。','PDFの解析に失敗しました。'].includes(error.message)
        ? error.message : 'PDFのページ表示に失敗しました。';
      const retry = append($('#pdf-status'),'button','再読み込み');
      retry.type = 'button';
      retry.onclick = () => void showPdf(n);
    }
  }
  const materials = doc.materials ?? [];
  const citationNavigation=document.getElementById('pdf-citation-navigation');
  const citationPrevious=document.getElementById('pdf-citation-previous');
  const citationNext=document.getElementById('pdf-citation-next');
  let citationSequence=[];
  let citationIndex=0;
  async function openCitation(index) {
    if (!citationSequence[index]) return;
    clearCitation(true);
    citationIndex=index;
    citation=citationSequence[index];
    citationNavigation.hidden=citationSequence.length<2;
    citationPrevious.disabled=index===0;
    citationNext.disabled=index===citationSequence.length-1;
    citationNavigation.querySelector('output').textContent=(index+1)+' / '+citationSequence.length;
    await showPdf(citation.page);
  }
  citationPrevious.onclick=()=>void openCitation(citationIndex-1);
  citationNext.onclick=()=>void openCitation(citationIndex+1);
  function clearCitation(keepSequence=false) {
    if (!keepSequence) {
      citationSequence=[];
      citationNavigation.hidden=true;
    }
    citation = undefined;
    removeCitationMarks(preview);
    for (const slot of document.querySelectorAll(".pdf-citation-page")) slot.classList.remove("pdf-citation-page");
    for (const mark of translatedPage.querySelectorAll('.pdf-translated-citation')) {
      if (mark.classList.contains('pdf-layout-line')) mark.classList.remove('pdf-translated-citation');
      else mark.replaceWith(mark.textContent);
    }
  }
  function sourceLink(parent,n,quote,getSequence) {
    const material = materials.find(item=>n>=item.start && n<item.start+item.count);
    if (material) {
      append(parent,'p',material.name+' · '+(n-material.start+1)+' '+material.unit,'ref');
      return;
    }
    const link = append(parent,'a',sourceType==='pdf' ? '元のPDF ' + n + 'ページ' : '資料データ'+(sourceType==='xlsx' ? ' · シート '+n : '')+' →','ref');
    link.href = '#tab-ask';
    link.addEventListener('click',async event=>{
      event.preventDefault();
      clearCitation();
      const sequence=getSequence?.();
      if (sequence?.length && quote) {
        citationSequence=sequence;
        await openCitation(sequence.findIndex(source=>source.page===n && source.quote===quote));
        return;
      }
      citation = quote && sourceType==='pdf' ? {page:n,quote} : undefined;
      await showPdf(n);
    });
  }
  for (const item of doc.items) {
    const card = append($('#cards'),'div','','card');
    append(card,'h3',item.label);
    append(card,'p',item.text);
    sourceLink(card,item.source.page);
  }
  const listMaterial = material=>append($('#materials'),'li',material.name);
  materials.forEach(listMaterial);
  const addForm = $('#add-material');
  for (const button of document.querySelectorAll('.open-material')) {
    button.hidden = !doc.canRemove;
    button.onclick = () => $('#material-dialog').showModal();
  }
  addForm.onsubmit = async event=>{
    event.preventDefault();
    const button = event.submitter;
    const status = $('#material-status');
    const file = new FormData(addForm).get('file');
    button.disabled = true;
    status.textContent = '追加資料を読み込んでいます…';
    try {
      if (file.size>5000000) throw Error('追加資料は5 MBまでです。');
      const form = new FormData();
      let upload = file;
      if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        const {convertDocument} = await import('./document-convert.js?v=94');
        upload = (await convertDocument(file)).file;
      }
      form.set('file',upload);
      if (/\.pdf$/i.test(upload.name)) form.set('pages',JSON.stringify(await extract(upload,status)));
      if (/\.(docx|xlsx)$/i.test(file.name)) {
        const {officePages} = await import('./document-office.js?v=92');
        form.set('pages',JSON.stringify(await officePages(file)));
      }
      const material = await request(api+'/material',{method:'POST',body:form});
      materials.push(material);
      listMaterial(material);
      addForm.reset();
      status.textContent = '追加しました。質問に使用できます。';
    } catch(error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  const status = $('#answer-status');
  const remove = document.querySelector('#remove-guide');
  remove.hidden = !doc.canRemove;
  remove.addEventListener('click',async ()=>{
    if (!confirm('この資料の共有を終了しますか？')) return;
    remove.disabled = true;
    try {
      await request(api+'/remove',{method:'POST'});
      const createUrl = new URL(location.href);
      createUrl.searchParams.delete('id');
      createUrl.searchParams.delete('library');
      createUrl.searchParams.set('create','1');
      createUrl.searchParams.set('v','37');
      location.replace(createUrl);
    } catch (error) {
      document.querySelector('#remove-status').textContent = error.message;
      remove.disabled = false;
    }
  });
  const askForm = $('#ask-form');
  const button = askForm.querySelector('button');
  const historyKey = 'document-qa-questions:'+id+(doc.revision ? ':'+doc.revision : '');
  const replaceForm = document.getElementById('replace-pdf');
  const reanalyseButton = document.getElementById('reanalyse-pdf');
  const replaceButton = replaceForm.querySelector('[type="submit"]');
  replaceForm.hidden = !doc.canRemove || sourceType!=='pdf';
  reanalyseButton.hidden = doc.convertedWorksheet;
  async function refreshPdf(file) {
    if (replaceButton.disabled) return;
    const replacing = Boolean(file);
    replaceButton.disabled = reanalyseButton.disabled = true;
    const status = replaceForm.querySelector('[role="status"]');
    try {
      if (!file) {
        status.textContent = '登録済みのPDFを読み込んでいます…';
        const response = await fetch(config.api+api+'/pdf',{headers:await authHeaders()});
        if (!response.ok) throw Error('登録済みのPDFを取得できませんでした。');
        file = new File([await response.blob()], 'document.pdf',{type:'application/pdf'});
      }
      const form = new FormData();
      form.set('pdf',file);
      form.set('pages',JSON.stringify(await extract(file,status)));
      status.textContent = '要点と目次を更新しています…';
      await request(api+'/replace',{method:'POST',body:form});
      try { sessionStorage.removeItem(historyKey); } catch {}
      if (replacing) readingPosition(id,{page:null});
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      replaceButton.disabled = reanalyseButton.disabled = false;
    }
  }
  replaceForm.onsubmit = event=>{
    event.preventDefault();
    const file = replaceForm.elements.pdf.files[0];
    if (file) void refreshPdf(file);
  };
  reanalyseButton.onclick = ()=>void refreshPdf();
  let history = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(historyKey) ?? '[]');
    if (Array.isArray(saved)) history = saved.filter(entry=>typeof entry?.question==='string' && Array.isArray(entry.items)).slice(-10);
  } catch {}
  let lastQuestion;
  function formatQuote(quote) {
    const lines = quote.trim().split(/\r?\n/);
    // Keep extracted table rows separate so adjacent values do not run together.
    if (lines.filter(line=>line.includes(' | ')).length>=2) return lines.map(line=>line.trim()).filter(Boolean);
    return quote.trim().split(/\n[ \t]*\n/).flatMap(paragraph=>{
      const joined = paragraph.replace(/([^\x00-\x7f])[ \t]*\n[ \t]*(?=[^\x00-\x7f])/g,'$1')
        .replace(/[ \t]*\n[ \t]*/g,' ');
      return joined.split(/(?<=。)\s*(?=・)/).filter(Boolean);
    });
  }
  function renderAnswerText(section,item,animate) {
    const body = append(section,'p','','answer-text');
    const answer = item.answer ?? 'この項目の根拠は資料内で確認できませんでした。';
    const keyFacts = /(?:[0-9０-９]+(?:[.,．][0-9０-９]+)*\s*(?:時(?:[0-9０-９]+分)?|分|円|月(?:[0-9０-９]+日)?|日|年|回|人|％|%))/gu;
    const match = item.answer && (keyFacts.exec(answer) ?? /^[^。！？\n]{1,55}(?:[。！？]|$)/u.exec(answer));
    if (!match) {
      body.textContent = answer;
      return;
    }
    body.append(answer.slice(0,match.index));
    const emphasis = append(body,'span','','answer-emphasis');
    if (animate) {
      Array.from(match[0]).forEach((character,index)=>{
        const letter = append(emphasis,'span',character);
        letter.style.animationDelay = index * 65 + 'ms';
      });
    } else emphasis.textContent = match[0];
    body.append(answer.slice(match.index + match[0].length));
  }
  const citationsBySection=new WeakMap();
  function renderAnswerItem(answer,item,animate=false) {
    const section = append(answer,'section','','answer-item');
    append(section,'h4',item.label);
    renderAnswerText(section,item,animate);
    if (item.answer && item.englishAnswer) {
      const english=append(section,'p',item.englishAnswer,'answer-english');
      english.lang='en';
    }
    if (!item.evidence?.length) return;
    const evidence = append(section,'div','','answer-evidence');
    const byPage = new Map();
    for (const {page,quote,sheet,cell} of item.evidence) {
      if (!byPage.has(page)) byPage.set(page,new Map());
      byPage.get(page).set(quote,sheet && cell ? sheet+' · '+cell : null);
    }
    const sequence=sourceType==='pdf' ? Array.from(byPage,([page,quotes])=>
      materials.some(material=>page>=material.start && page<material.start+material.count) ? [] :
      [...quotes.keys()].filter(Boolean).map(quote=>({page,quote}))).flat() : [];
    citationsBySection.set(section,sequence);
    const answerCitations=()=>[...answer.children].flatMap(child=>citationsBySection.get(child) ?? []);
    for (const [page,quotes] of byPage) {
      const source = append(evidence,'div','','answer-source');
      sourceLink(source,page,quotes.keys().next().value,answerCitations);
      const addresses = [...new Set([...quotes.values()].filter(Boolean))];
      if (addresses.length) append(source,'div',addresses.join('、'));
      const disclosure = append(source,'details','','answer-quote');
      append(disclosure,'summary','資料内表記');
      const content = append(disclosure,'div');
      for (const quote of quotes.keys()) {
        const block = append(content,'blockquote');
        for (const paragraph of formatQuote(quote)) append(block,'p',paragraph);
      }
    }
  }
  for (const entry of history) {
    const log = $('#messages');
    append(log,'div',entry.question,'bubble user');
    const answer = append(log,'div','','bubble');
    for (const item of entry.items) renderAnswerItem(answer,item);
    if (entry.fallback) append(answer,'p',entry.fallback);
    lastQuestion = entry.items.at(-1)?.worksheetContext ?? entry.question;
  }
  let taggedTables;
  async function sendQuestion(question,previousQuestion,questionBubble) {
    const answerLanguage=selectedLanguage==='ja' ? '' : selectedLanguage;
    const log = $('#messages');
    if (button.disabled) return;
    button.disabled = true;
    clearCitation();
    let followedCitation = false;
    questionBubble ??= append(log,'div',question,'bubble user');
    let box;
    log.append(status);
    const entry = {question,items:[]};
    let stage = '接続';
    let httpStatus;
    status.textContent = '資料から答えを探しています…';
    const started=performance.now();
    let reviewStarted;
    const answerTimings={};
    delete log.dataset.answerTimings;
    function recordAnswerMetrics() {
      recordDocumentQaMetric(id,doc.title,{
        ms:Math.round(performance.now()-started),
        items:entry.items.length || 1,
        unsupported:entry.items.length ? entry.items.filter(item=>!item.answer).length : 1,
      });
    }
    function measureAnswer(phase,start=started) {
      const name='document-qa:'+phase;
      if (performance.getEntriesByName(name).length>=20) performance.clearMeasures(name);
      const measurement=performance.measure(name,{start,end:performance.now()});
      answerTimings[phase]=Math.round(measurement.duration);
    }
    const updateElapsed=()=>{status.dataset.elapsed=Math.floor((performance.now()-started)/1000)+'秒 作業中…';};
    updateElapsed();
    const elapsedTimer=setInterval(updateElapsed,1000);
    log.scrollTop = log.scrollHeight;
    try {
      const barePrice=/(?:^)(?:利用料金|料金)(?:はいくら(?:ですか)?|は)?[?？。]?$/u;
      const namedPrice=/^[\p{L}\p{N}]{2,24}は(?:何円|いくら)(?:ですか)?[?？。]?$/u;
      const priceQuestion=value=>barePrice.test(value?.trim()??'') || namedPrice.test(value?.trim()??'');
      const priceContext=priceQuestion(question) || priceQuestion(previousQuestion);
      if (!answerLanguage && sourceType==='pdf' && (!doc.convertedWorksheet || materials.length) && (priceContext || /の/.test(question) || /^what is the .+ (?:for|of) /i.test(question))) {
        let item;
        try {
          const {lookupTableCell,lookupAlignedTableCell}=await import('./document-table-lookup.js?v=86');
          const pdf=await getOriginalPdf();
          if (!materials.length) {
            const {readTaggedTables,findTaggedTableCell}=await import('./document-tagged-table.js?v=2');
            taggedTables ??= readTaggedTables(pdf).catch(()=>[]);
            item=findTaggedTableCell(await taggedTables,question);
          }
          if (!item && !materials.length && (priceContext || /(?:時刻|利用料|料金|手数料|延長料)(?:はいくら(?:ですか)?|は)?[?？。]?$/.test(question))) {
            const {lookupPdfTableValue}=await import('./document-pdf-table-value.js?v=9');
            const pages=await request(api+'/text');
            item=lookupPdfTableValue(pages,question,previousQuestion);
          }
          item ??= await lookupTableCell(pdf,question);
          item ??= await lookupAlignedTableCell(pdf,question);
        } catch {}
        if (item) {
          renderAnswerItem(append(log,'div','','bubble'),item);
          entry.items.push(item);
          recordAnswerMetrics();
          lastQuestion = entry.items.at(-1)?.worksheetContext ?? question;
          history = [...history,entry].slice(-10);
          try { sessionStorage.setItem(historyKey,JSON.stringify(history)); } catch {}
          status.textContent = '';
          measureAnswer('first-grounded-answer');
          citation=item.evidence[0];
          if (wide.matches || dialog.open) void showPdf(citation.page);
          return;
        }
      }
      const response = await fetch(config.api+api+'/ask',{method:'POST',
        headers:await authHeaders({'Content-Type':'application/json',Accept:'application/x-ndjson'}),
        body:JSON.stringify({question,previousQuestion,answerLanguage:answerLanguage||undefined})});
      httpStatus = response.status;
      if (!response.ok) throw Error((await response.json().catch(()=>null))?.error || '回答を取得できませんでした。');
      stage = '回答受信';
      function answerBox() {
        if (!box) {
          box = append(log,'div','','bubble');
          log.append(status);
        }
        return box;
      }
      let definitionPages;
      async function includeAliasDefinition(item) {
        const alias=/^([\p{Script=Han}\p{Script=Katakana}\p{ASCII}]{2,12})の/u.exec(question.normalize('NFKC'))?.[1];
        if (!alias || !item.answer || !item.evidence?.length || sourceType!=='pdf' || materials.length) return item;
        definitionPages ??= request(api+'/text').catch(()=>[]);
        const pages=await definitionPages;
        const compactName=value=>value.normalize('NFKC').replaceAll('⺠','民').replace(/\s/gu,'');
        const definitions=pages.flatMap((text,index)=>text.split('\n').flatMap(quote=>{
          const line=compactName(quote);
          const match=/^([^()|。]{3,40})\(([^()]{2,12})\)$/u.exec(line);
          return match && match[2]===alias && match[1]!==alias && (match[1].startsWith(alias) || item.evidence.some(source=>compactName(source.quote).includes(match[1])))
            ? [{page:index+1,quote:quote.trim()}] : [];
        }));
        if (definitions.length!==1) return item;
        const definition=definitions[0];
        if (item.evidence.some(source=>source.page===definition.page && source.quote.includes(definition.quote))) return item;
        return {...item,evidence:[...item.evidence,definition]};
      }
      async function showItem(item) {
        if (!answerLanguage && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(question)) {
          const time=/^(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?$/iu.exec(item.answer?.trim() ?? '');
          if (time) {
            const [,hour,minute,period]=time;
            item={...item,answer:(period.toLowerCase()==='a'?'午前':'午後')+Number(hour)+'時'+
              (Number(minute) ? Number(minute)+'分' : '')};
          }
        }
        const currentHours=/^(?:現在|最新)の(?:受付|窓口)(?:時間|時刻)(?:は)?[?？。]?$/u;
        if (currentHours.test(question.normalize('NFKC').trim()) && item.answer) {
          const corrected=(item.evidence??[]).filter(source=>
            /^(?:訂正後|変更後)の(?:受付|窓口)(?:時間|時刻)?は(?:午前|午後)?[0-9一二三四五六七八九十]{1,3}時(?:[0-9一二三四五六七八九十]{1,3}分)?までです。?$/u.test(source.quote.normalize('NFKC').replace(/\s/gu,'')));
          if (corrected.length===1) item={...item,answer:corrected[0].quote,evidence:corrected};
        }
        const feeKeyword=/^([\p{Script=Han}\p{Script=Katakana}]{1,10})(?:料金|手数料)[?？。]?$/u.exec(question.normalize('NFKC').trim());
        if (feeKeyword && item.answer && item.evidence?.length) {
          const compact=text=>text.normalize('NFKC').replace(/\s/gu,'');
          const citations=item.evidence.map(source=>compact(source.quote));
          if (citations.every(quote=>!quote.includes(feeKeyword[1])) &&
              citations.some(quote=>/[\p{Script=Han}\p{Script=Katakana}]{2,}(?:料金|手数料)[^\n]*\d[\d,]*円/u.test(quote))) {
            item={...item,answer:null,evidence:[]};
          }
        }
        const isPriceItem=/(?:代金|費|料|値段|価格|金額|\b(?:fee|cost|price)\b)/iu.test(item.label);
        const freePrice=/無料|無償|(?:^|[^\d])0\s*円/u;
        if (isPriceItem && /(?:いくら|何円|費用|料金|手数料|教材費)/u.test(question) &&
            freePrice.test((item.answer??'').normalize('NFKC')) &&
            !item.evidence?.some(source=>freePrice.test(source.quote.normalize('NFKC')))) {
          item={...item,answer:null,evidence:[]};
        }
        const priceEvidence=/無料|無償|実費|要(?:問合せ|問い合わせ)|[0-9一二三四五六七八九十百千万億][0-9一二三四五六七八九十百千万億,.\s]*円|[¥￥]\s*\d/u;
        if (isPriceItem && /(?:いくら|何円)/u.test(question) &&
            item.answer && item.evidence?.length &&
            !item.evidence.some(source=>priceEvidence.test(source.quote.normalize('NFKC')))) {
          item={...item,answer:null,evidence:[]};
        }
        if (item.answer && /^(?:資料(?:内)?に|本文に)[^。！？\r\n]{1,80}(?:記載されていません|記載がありません|見当たりません)。?$/u.test(item.answer.trim())) {
          item={...item,answer:null,evidence:[]};
        }
        item=await includeAliasDefinition(item);
        const first = !box;
        const answer = answerBox();
        renderAnswerItem(answer,item,true);
        if (item.answer && !entry.items.some(previous=>previous.answer)) measureAnswer('first-grounded-answer');
        entry.items.push(item);
        const evidence = item.evidence?.find(source=>source.page>=1 && source.page<=doc.pageCount && source.quote);
        if (!followedCitation && evidence && sourceType==='pdf') {
          followedCitation = true;
          citation = {page:evidence.page,quote:evidence.quote};
          if (wide.matches || dialog.open) void showPdf(evidence.page);
        }
        if (first) answer.scrollIntoView({behavior:'smooth',block:'start'});
      }
      if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
        const result = await response.json();
        for (const item of result.items ?? []) {
          status.textContent = '確認できた回答を表示しています…';
          await showItem(item);
        }
        if (!entry.items.length) append(answerBox(),'p',entry.fallback=result.answer);
      } else {
        if (!response.body) throw Error('回答の受信を開始できませんでした。');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending='', finished=false;
        try {
          for (;;) {
            const {value,done} = await reader.read();
            pending+=decoder.decode(value,{stream:!done});
            if (done && pending) pending+='\n';
            const lines=pending.split('\n');
            pending=lines.pop();
            for (const line of lines) {
              if (!line.trim()) continue;
              const event=JSON.parse(line);
              if (event.error) throw Error(event.error);
              if (event.status) {
                status.textContent=event.status;
                if (event.status==='資料を参照して回答を作成しています…') measureAnswer('retrieval');
                if (event.status==='資料全体を確認しています…') reviewStarted=performance.now();
              }
              if (event.replaceItems) {
                answerBox().replaceChildren();
                entry.items = [];
                clearCitation();
                followedCitation = false;
                for (const item of event.replaceItems) await showItem(item);
              }
              if (event.item) {
                await showItem(event.item);
                status.textContent='続きの回答を確認しています…';
              }
              if (event.done) {
                finished=true;
                if (event.answer) append(answerBox(),'p',entry.fallback=event.answer);
              }
            }
            if (done) break;
          }
          if (!finished) throw Error('回答の受信が途中で止まりました。');
        } finally { await reader.cancel().catch(()=>{}); }
      }
      recordAnswerMetrics();
      lastQuestion = entry.items.at(-1)?.worksheetContext ?? question;
      history = [...history,entry].slice(-10);
      try { sessionStorage.setItem(historyKey,JSON.stringify(history)); } catch {}
      status.textContent = '';
    } catch (error) {
      box?.remove();
      status.textContent = error.message+'（'+stage+(httpStatus && httpStatus!==200?' / HTTP '+httpStatus:'')+'） ';
      const retry = append(status,'button','再試行');
      retry.type = 'button';
      retry.onclick = () => void sendQuestion(question,previousQuestion,questionBubble);
      const edit = append(status,'button','質問を編集');
      edit.type = 'button';
      edit.onclick = () => {
        const field = $('#question');
        if (!field.value.trim()) {
          field.value = question;
          questionBubble.remove();
          status.textContent = '';
        }
        field.focus();
        field.setSelectionRange(field.value.length,field.value.length);
      };
    }
    finally {
      clearInterval(elapsedTimer);
      if (reviewStarted!==undefined) measureAnswer('full-review',reviewStarted);
      measureAnswer('finished');
      log.dataset.answerTimings=JSON.stringify(answerTimings);
      delete status.dataset.elapsed;
      button.disabled = false;
    }
  }
  askForm.addEventListener('submit',event=>{
    event.preventDefault();
    const field = $('#question');
    const question = field.value.trim();
    if (!question || button.disabled) return;
    field.value = '';
    if (!wide.matches) field.blur();
    void sendQuestion(question,lastQuestion);
  });
  void prefetchTranslations();
}

try {
  if (!id && !new URLSearchParams(location.search).has('create')) {
    show('#library');
    addLanguagePicker($('.library-filters'));
    installLocalIcons($('#content'));
    documentLibrary();
    try {
      const entries = await request('/documents/library');
      $('#shared-status').textContent = entries.length ? '' : '公開されている資料はありません。';
      const renderShared = () => {
        const list = $('#shared-list');
        list.replaceChildren();
        const matches = filterLibrary(entries);
        $('#shared-status').textContent = matches.length ? '' : entries.length ? '一致する資料がありません。' : '公開されている資料はありません。';
        for (const entry of matches) {
        const card = append(list,'li','','library-card');
        const icon = append(card,'span','','library-icon');
        icon.append(localIcon('book-open'));
        const body = append(card,'div','','library-card-body');
        const link = append(body,'a',entry.title);
        link.href = '?id='+encodeURIComponent(entry.id)+'&v=39';
        }
      };
      $('#library-search').addEventListener('input',renderShared);
      $('#library-sort').addEventListener('change',renderShared);
      renderShared();
    } catch (error) {
      $('#shared-status').textContent = error.message;
    }
  }
  else if (!id) teacher();
  else await reader();
} catch (error) {
  content.replaceChildren();
  append(content,'p',error.message,'panel');
}
