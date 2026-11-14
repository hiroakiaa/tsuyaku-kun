import {installLocalIcons,localIcon} from './icons.js?v=library';
import {config} from './config.js';
const $ = (selector) => document.querySelector(selector);
const content = $('#content');
const id = new URLSearchParams(location.search).get('id');
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
  if (!res.ok || !data) throw new Error(data?.error || '通信できませんでした。もう一度お試しください。');
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

async function extract(file, status) {
  let pdf;
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
            if (item.str) parts.push(item.str, item.hasEOL ? '\n' : '');
          }
        }
      } finally {
        reader.releaseLock();
      }
      pages.push(parts.join('').trim());
    }
    if (!pages.some(page=>page.length >= 8)) throw new Error('文字を取り出せませんでした。文字を選べるPDFを使ってください。');
    if (pages.join('').length > 22000) throw new Error('文字数が多すぎます。資料を分けてください。');
    return pages;
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('パスワードのないPDFを使ってください。');
    if (error.name === 'InvalidPDFException') throw new Error('PDFを開けませんでした。ファイルを確認してください。');
    throw error;
  } finally { if (pdf) await pdf.destroy(); }
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
  const sort = $('#library-sort').value;
  return entries.filter(entry=>normalize(entry.title).includes(term)).sort((a,b)=>{
    if (sort==='title') return a.title.localeCompare(b.title,'ja');
    if (sort==='expiry') return (a.expires ?? Infinity)-(b.expires ?? Infinity);
    if (sort==='recent') {
      const difference = (readingPosition(b.id).opened ?? 0)-(readingPosition(a.id).opened ?? 0);
      if (difference) return difference;
    }
    return (b.expires ?? 0)-(a.expires ?? 0);
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
      if (entry.expires) {
        const expired = Date.now()>=entry.expires;
        append(body,'small',expired ? '共有期限を過ぎました' : '共有期限 '+new Date(entry.expires).toLocaleDateString('ja-JP'));
      }
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
  const meter = $('#upload-progress');
  const fileInput = $('#upload [name="pdf"]');
  let preflight;
  function preparePdf(file) {
    return extract(file,status).then(pages=>({pages}),error=>({error}));
  }
  fileInput.addEventListener('change', async () => {
    if ($('#upload button').disabled) return;
    const file = fileInput.files[0];
    preflight = undefined;
    if (!$('#upload button').disabled) meter.hidden = true;
    status.textContent = '';
    if (!file || !/\.pdf$/i.test(file.name) || file.size>5000000) return;
    const progress = document.createElement('span');
    const pending = extract(file,progress).then(pages=>({pages}),error=>({error}));
    preflight = {file,pending};
    meter.removeAttribute('value');
    meter.hidden = false;
    status.textContent = 'PDFの文字を確認しています…';
    const {error} = await pending;
    if (preflight?.pending===pending && !$('#upload button').disabled) {
      meter.hidden = true;
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
    meter.hidden = false;
    meter.value = 0;
    let stage = 1;
    let previousFrame = performance.now();
    let frame;
    function animateProgress(now) {
      const ceiling = stage===1 ? 1 : 2.85;
      meter.value += (ceiling-meter.value)*(1-Math.exp(-(now-previousFrame)/1800));
      previousFrame = now;
      frame = requestAnimationFrame(animateProgress);
    }
    frame = requestAnimationFrame(animateProgress);
    status.textContent = '1 / 3　資料を確認しています…';
    try {
      if (/\.pdf$/i.test(file.name)) {
        const {pages,error} = await (preflight?.file===file ? preflight.pending : preparePdf(file));
        if (error) throw error;
        data.set('pages',JSON.stringify(pages));
      }
      if (/\.(docx|xlsx)$/i.test(file.name)) {
        const {officePages} = await import('./document-office.js');
        data.set('pages',JSON.stringify(await officePages(file)));
      }
      stage = 2;
      status.textContent = '2 / 3　要点・目次を作成しています…';
      const {id,expires} = await request('/documents',{method:'POST',body:data});
      meter.hidden = true;
      meter.value = 3;
      status.textContent = '作成が完了しました。';
      const url = '?id=' + id;
      $('#open-guide').href = url;
      $('#guide-url').value = new URL(url,location.href).href;
      $('#result').hidden = false;
      const shared = data.get('visibility')==='shared';
      $('#guide-url').closest('label').hidden = !shared;
      $('#copy').hidden = !shared;
      if (!saveGuide({id,title:String(data.get('title')).trim(),expires,shared})) {
        status.textContent = '資料を作成しましたが、保管庫には保存できませんでした。';
        return;
      }
    } catch (error) {
      meter.hidden = true;
      status.textContent = error.message;
    } finally {
      cancelAnimationFrame(frame);
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
  const doc = await request(api);
  show('#reader');
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
  $('#qa-source').addEventListener('click',()=>void showPdf(citation?.page || selectedPage || 1));
  const sourceType = doc.sourceType ?? 'pdf';
  if (sourceType!=='pdf') {
    $('#qa-source').textContent = '資料データを表示';
  }
  let opened,originalUrl;
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
  let citation;
  async function highlightCitation(slot,page,viewport) {
    const selected = citation;
    if (!selected || selected.page!==Number(slot.dataset.page)) return;
    const normalize = text=>text.normalize('NFKC').replace(/\s+/g,'');
    const {items} = await page.getTextContent();
    if (citation!==selected) return;
    const runs = items.filter(item=>item.str).map(item=>({item,text:normalize(item.str)}));
    const text = runs.map(run=>run.text).join('');
    const quote = normalize(selected.quote);
    const start = text.indexOf(quote);
    if (!quote || start<0) return;
    for (const mark of slot.querySelectorAll('.pdf-citation-mark')) mark.remove();
    let offset = 0;
    let firstMark;
    for (const run of runs) {
      const end = offset+run.text.length;
      if (end>start && offset<start+quote.length) {
        const {item} = run;
        const [x,y] = viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const mark = append(slot,'span','','pdf-citation-mark');
        firstMark ??= mark;
        mark.style.left = x/viewport.width*100+'%';
        mark.style.top = (y-item.height*viewport.scale)/viewport.height*100+'%';
        mark.style.width = item.width*viewport.scale/viewport.width*100+'%';
        mark.style.height = item.height*viewport.scale/viewport.height*100+'%';
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
    const {left,width} = workspace.getBoundingClientRect();
    const percent = (event.clientX-left)/width*100;
    setSplit(reversed ? 100-percent : percent);
  };
  divider.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    setSplit(split + (event.key==='ArrowRight' ? 2 : -2)*(reversed ? -1 : 1));
  };
  function syncWorkspace() {
    if (!askDialog.open) return;
    if (wide.matches && dialog.parentElement === workspace) return;
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
    $('#pdf-prev').disabled = n===1;
    $('#pdf-next').disabled = n===doc.pageCount;
    $('#pdf-heading').textContent = doc.title;
    if (!askDialog.open) {
      selectTab($('#tab-ask'));
      askDialog.showModal();
    }
    const inline = wide.matches;
    if (!dialog.open) {
      if (inline) {
        workspace.prepend(dialog);
        dialog.show();
      } else {
        askDialog.after(dialog);
        dialog.showModal();
      }
    }
    $('#pdf-file').removeAttribute('href');
    $('#pdf-status').textContent = 'PDFを表示しています…';

    if (sourceType!=='pdf') {
      if (!imageType) $('#pdf-file').textContent = 'ダウンロード';
      $('#pdf-file').removeAttribute('href');
      for (const node of ['#pdf-prev','#pdf-next','#pdf-page','#pdf-pages']) $(node).hidden=true;
      try {
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
      opened ??= (async()=>{
        const blob = await fetch(config.api + api + '/pdf',{headers:await authHeaders()}).then(response=>{
          if (!response.ok) throw Error();
          return response.blob();
        }).catch(()=>{throw Error('PDF取得に失敗しました。');});
        const pdf = await openPdf({data:new Uint8Array(await blob.arrayBuffer())})
          .catch(()=>{throw Error('PDFの解析に失敗しました。');});
        originalUrl = URL.createObjectURL(blob);
        return pdf;
      })().catch(error=>{opened=undefined;throw error;});
      const pdf = await opened;
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
  function clearCitation() {
    citation = undefined;
    for (const mark of preview.querySelectorAll('.pdf-citation-mark')) mark.remove();
  }
  function sourceLink(parent,n,quote) {
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
      form.set('file',file);
      if (/\.pdf$/i.test(file.name)) form.set('pages',JSON.stringify(await extract(file,status)));
      if (/\.(docx|xlsx)$/i.test(file.name)) {
        const {officePages} = await import('./document-office.js');
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
  const replaceForm = $('#replace-pdf');
  replaceForm.hidden = !doc.canRemove || sourceType!=='pdf';
  replaceForm.onsubmit = async event=>{
    event.preventDefault();
    const submit = replaceForm.querySelector('button');
    const status = replaceForm.querySelector('[role="status"]');
    const file = replaceForm.elements.pdf.files[0];
    if (!file || submit.disabled) return;
    submit.disabled = true;
    try {
      const form = new FormData();
      form.set('pdf',file);
      form.set('pages',JSON.stringify(await extract(file,status)));
      status.textContent = '要点と目次を更新しています…';
      await request(api+'/replace',{method:'POST',body:form});
      try { sessionStorage.removeItem(historyKey); } catch {}
      readingPosition(id,{page:null});
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
    }
  };
  let history = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(historyKey) ?? '[]');
    if (Array.isArray(saved)) history = saved.filter(entry=>typeof entry?.question==='string' && Array.isArray(entry.items)).slice(-10);
  } catch {}
  let lastQuestion;
  function renderAnswerItem(answer,item) {
    const section = append(answer,'section','','answer-item');
    append(section,'h4',item.label);
    append(section,'p',item.answer ?? 'この項目の根拠は資料内で確認できませんでした。','answer-text');
    if (!item.evidence?.length) return;
    const evidence = append(section,'div','','answer-evidence');
    const byPage = new Map();
    for (const {page,quote} of item.evidence) {
      if (!byPage.has(page)) byPage.set(page,new Set());
      byPage.get(page).add(quote);
    }
    for (const [page,quotes] of byPage) {
      const source = append(evidence,'div','','answer-source');
      sourceLink(source,page,quotes.values().next().value);
      const disclosure = append(source,'details','','answer-quote');
      append(disclosure,'summary','資料内表記');
      const content = append(disclosure,'div');
      for (const quote of quotes) append(content,'blockquote',quote);
    }
  }
  for (const entry of history) {
    const log = $('#messages');
    append(log,'div',entry.question,'bubble user');
    const answer = append(log,'div','','bubble');
    for (const item of entry.items) renderAnswerItem(answer,item);
    if (entry.fallback) append(answer,'p',entry.fallback);
    lastQuestion = entry.question;
  }
  async function sendQuestion(question,previousQuestion,retrying=false) {
    const log = $('#messages');
    if (button.disabled) return;
    button.disabled = true;
    clearCitation();
    let followedCitation = false;
    if (!retrying) append(log,'div',question,'bubble user');
    let box;
    log.append(status);
    const entry = {question,items:[]};
    let stage = '接続';
    let httpStatus;
    status.textContent = '資料から答えを探しています…';
    log.scrollTop = log.scrollHeight;
    try {
      const response = await fetch(config.api+api+'/ask',{method:'POST',
        headers:await authHeaders({'Content-Type':'application/json',Accept:'application/x-ndjson'}),
        body:JSON.stringify({question,previousQuestion})});
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
      async function showItem(item) {
        const first = !box;
        const answer = answerBox();
        renderAnswerItem(answer,item);
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
              if (event.status) status.textContent=event.status;
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
      lastQuestion = question;
      history = [...history,entry].slice(-10);
      try { sessionStorage.setItem(historyKey,JSON.stringify(history)); } catch {}
      status.textContent = '';
    } catch (error) {
      box?.remove();
      status.textContent = error.message+'（'+stage+(httpStatus && httpStatus!==200?' / HTTP '+httpStatus:'')+'） ';
      const retry = append(status,'button','再試行');
      retry.type = 'button';
      retry.onclick = () => void sendQuestion(question,previousQuestion,true);
    }
    finally { button.disabled = false; }
  }
  askForm.addEventListener('submit',event=>{
    event.preventDefault();
    const field = $('#question');
    const question = field.value.trim();
    if (!question || button.disabled) return;
    field.value = '';
    void sendQuestion(question,lastQuestion);
  });
}

try {
  if (!id && !new URLSearchParams(location.search).has('create')) {
    show('#library');
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
        append(body,'small','期限 '+new Date(entry.expires).toLocaleDateString('ja-JP'));
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
