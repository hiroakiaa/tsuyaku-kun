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
    });
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
      const {items} = await page.getTextContent();
      pages.push(items.map(item=>item.str ? item.str + (item.hasEOL ? '\n' : '') : '').join('').trim());
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
    if (!entries.length) append(list,'li','保管した資料はまだありません。','fine');
    for (const entry of entries) {
      const card = append(list,'li','','library-card');
      const icon = append(card,'span','▤','library-icon');
      icon.setAttribute('aria-hidden','true');
      const body = append(card,'div','','library-card-body');
      const link = append(body,'a',entry.title);
      const guide = new URL('documents.html', location.href);
      guide.searchParams.set('id', entry.id);
      if (window.parent !== window) guide.searchParams.set('embedded', '1');
      guide.searchParams.set('v', '22');
      link.href = guide.href;
      if (entry.expires) {
        const expired = Date.now()>=entry.expires;
        append(body,'small',expired ? '共有期限を過ぎました' : '共有期限 '+new Date(entry.expires).toLocaleDateString('ja-JP'));
      }
      const remove = append(card,'button','🗑︎','library-remove');
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
  if (list) render();
  return add;
}

function teacher() {
  show('#teacher');
  const saveGuide = documentLibrary();
  const status = $('#upload-status');
  $('#upload').addEventListener('submit',async event=>{
    event.preventDefault();
    const button = event.submitter;
    const data = new FormData(event.currentTarget);
    const file = data.get('pdf');
    if (file.size > 5000000) { status.textContent = 'PDFは5 MBまでです。'; return; }
    button.disabled = true;
    $('#result').hidden = true;
    status.textContent = 'PDFを開いています…';
    try {
      if (/\.pdf$/i.test(file.name)) data.set('pages',JSON.stringify(await extract(file,status)));
      if (/\.(docx|xlsx)$/i.test(file.name)) {
        const {officePages} = await import('./document-office.js');
        data.set('pages',JSON.stringify(await officePages(file)));
      }
      status.textContent = '案内ページを作っています…';
      const {id,expires} = await request('/documents',{method:'POST',body:data});
      const url = '?id=' + id;
      $('#open-guide').href = url;
      $('#guide-url').value = new URL(url,location.href).href;
      $('#result').hidden = false;
      if (!saveGuide({id,title:String(data.get('title')).trim(),expires})) {
        status.textContent = '資料を作成しましたが、保管庫には保存できませんでした。';
        return;
      }
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
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
  $('#doc-caption').textContent = '元のPDF · 全' + doc.pageCount + 'ページ';
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
        $('#ask-heading').focus();
      }
      if (tab.id==='tab-original') void showPdf(1);
    });
    tab.addEventListener('keydown',event=>{
      const index = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if (index===undefined) return;
      event.preventDefault();
      tabs[index].focus();
    });
  });
  $('#ask-dialog').addEventListener('close',()=>{
    selectTab(tabs[0]);
    tabs[0].focus();
  });
  $('#reopen-pdf').addEventListener('click',()=>void showPdf(selectedPage || 1));
  const sourceType = doc.sourceType ?? 'pdf';
  if (sourceType!=='pdf') {
    $('#doc-caption').textContent = '資料データ · '+sourceType.toUpperCase();
    $('#tab-original').textContent = '資料データ';
    $('#reopen-pdf').textContent = '資料データを表示';
  }
  let opened,originalUrl;
  let selectedPage = 0;
  let activeRender;
  const pagePicker = $('#pdf-page');
  for (let page=1;page<=doc.pageCount;page++) pagePicker.add(new Option(page+' / '+doc.pageCount,page));
  pagePicker.onchange = ()=>void showPdf(Number(pagePicker.value));
  $('#pdf-prev').onclick = ()=>void showPdf(selectedPage-1);
  $('#pdf-next').onclick = ()=>void showPdf(selectedPage+1);
  const preview = $('#pdf-scroll');
  const previewImage = $('#source-image');
  const imageType = /^(png|jpe?g|webp)$/.test(sourceType);
  const zoomable = sourceType==='pdf' || imageType;
  let zoom=1, fitWidth=0;
  let pinch, drag;
  function setZoom(value, from, to=from) {
    const bounds=preview.getBoundingClientRect();
    from ??= {x:bounds.width/2,y:bounds.height/2};
    to ??= from;
    const surface=imageType ? previewImage : $('#pdf-canvas');
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
  preview.addEventListener('wheel',event=>{
    if (!zoomable) return;
    event.preventDefault();
    const bounds=preview.getBoundingClientRect();
    setZoom(zoom*Math.exp(-event.deltaY*.002),{x:event.clientX-bounds.left,y:event.clientY-bounds.top});
  },{passive:false});
  function measurePinch(event){
    const [a,b]=event.touches;
    const bounds=preview.getBoundingClientRect();
    return {x:(a.clientX+b.clientX)/2-bounds.left,y:(a.clientY+b.clientY)/2-bounds.top,
      distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};
  }
  preview.addEventListener('touchstart',event=>{
    if (!zoomable) return;
    if (event.touches.length===1) drag=event.touches[0];
    if (event.touches.length!==2) return;
    drag=undefined;
    event.preventDefault();
    pinch=measurePinch(event);
  },{passive:false});
  preview.addEventListener('touchmove',event=>{
    if (drag && event.touches.length===1) {
      const next=event.touches[0];
      preview.scrollLeft+=drag.clientX-next.clientX;
      preview.scrollTop+=drag.clientY-next.clientY;
      drag=next;
    }
    if (!pinch || !pinch.distance || event.touches.length!==2) return;
    event.preventDefault();
    const next=measurePinch(event);
    setZoom(zoom*next.distance/pinch.distance,pinch,next);
    pinch=next;
  },{passive:false});
  for (const event of ['touchend','touchcancel']) preview.addEventListener(event,()=>{pinch=undefined;drag=undefined;});
  async function showPdf(n) {
    if (n<1 || n>doc.pageCount) return;
    selectedPage = n;
    pagePicker.value = n;
    $('#pdf-prev').disabled = n===1;
    $('#pdf-next').disabled = n===doc.pageCount;
    $('#pdf-heading').textContent = doc.title;
    if (!dialog.open) dialog.showModal();
    $('#pdf-file').removeAttribute('href');
    $('#pdf-status').textContent = 'PDFを表示しています…';

    if (sourceType!=='pdf') {
      if (!imageType) $('#pdf-file').textContent = 'ダウンロード';
      $('#pdf-file').removeAttribute('href');
      for (const node of ['#pdf-prev','#pdf-next','#pdf-page','#pdf-canvas']) $(node).hidden=true;
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
    if (activeRender) activeRender.cancel();
    try {
      opened ??= fetch(config.api + api + '/pdf',{headers:await authHeaders()}).then(async response=>{
        if (!response.ok) throw new Error('PDFを取得できませんでした。');
        const blob = await response.blob();
        originalUrl = URL.createObjectURL(blob);
        return openPdf({data:new Uint8Array(await blob.arrayBuffer())});
      }).catch(error=>{opened=undefined;throw error;});
      const pdf = await opened;
      if (selectedPage === n) document.querySelector('#pdf-file').href = originalUrl + '#page=' + n;
      const page = await pdf.getPage(n);
      if (selectedPage !== n) return;
      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-canvas';
      canvas.setAttribute('aria-label','元のPDFの' + n + 'ページ');
      const width=preview.clientWidth;
      const scale = Math.min(4, width / page.getViewport({scale:1}).width * Math.max(2,devicePixelRatio));
      const viewport = page.getViewport({scale});
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      activeRender = page.render({canvas, viewport});
      await activeRender.promise;
      if (selectedPage === n) {
        $('#pdf-canvas').replaceWith(canvas);
        fitWidth=width;
        setZoom(zoom);
        $('#pdf-status').textContent = '';
      }
    } catch (error) {
      if (error.name === 'RenderingCancelledException' || selectedPage !== n) return;
      $('#pdf-status').textContent = '画面内で表示できません。「PDFを開く」から確認してください。';
    }
  }
  const materials = doc.materials ?? [];
  function sourceLink(parent,n) {
    const material = materials.find(item=>n>=item.start && n<item.start+item.count);
    if (material) {
      append(parent,'p',material.name+' · '+(n-material.start+1)+' '+material.unit,'ref');
      return;
    }
    const link = append(parent,'a',sourceType==='pdf' ? '元のPDF ' + n + 'ページ →' : '資料データ'+(sourceType==='xlsx' ? ' · シート '+n : '')+' →','ref');
    link.href = '#original';
    link.addEventListener('click',event=>{event.preventDefault(); void showPdf(n);});
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
  addForm.hidden = !doc.canRemove;
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
      content.replaceChildren();
      append(content,'p','資料の共有を終了しました。','panel');
    } catch (error) {
      document.querySelector('#remove-status').textContent = error.message;
      remove.disabled = false;
    }
  });
  $('#ask-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const button = event.submitter;
    const field = $('#question');
    const question = field.value.trim();
    if (!question) return;
    const log = $('#messages');
    if (button.disabled) return;
    button.disabled = true;
    field.value = '';
    append(log,'div',question,'bubble user');
    status.textContent = '資料から答えを探しています…';
    log.scrollTop = log.scrollHeight;
    try {
      const response = await fetch(config.api+api+'/ask',{method:'POST',
        headers:await authHeaders({'Content-Type':'application/json',Accept:'application/x-ndjson'}),
        body:JSON.stringify({question})});
      if (!response.ok) throw Error((await response.json().catch(()=>null))?.error || '回答を取得できませんでした。');
      let box;
      function answerBox() {
        if (!box) {
          box = append(log,'div','','bubble');
          append(box,'h3','質問回答','answer-heading');
        }
        return box;
      }
      async function showItem(item) {
        if (box) await new Promise(resolve=>setTimeout(resolve,220));
        const first = !box;
        const answer = answerBox();
          const section = append(answer,'section','','answer-item');
          append(section,'h4',item.label);
          append(section,'p',item.answer ?? 'この項目の根拠は資料内で確認できませんでした。');
          if (item.evidence.length) {
            const evidence = append(section,'div','','answer-evidence');
            append(evidence,'h5','資料内表記');
            for (const {page,quote} of item.evidence) {
              append(evidence,'blockquote',quote);
              sourceLink(evidence,page);
            }
          }
        if (first) answer.scrollIntoView({behavior:'smooth',block:'start'});
      }
      if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
        const result = await response.json();
        for (const item of result.items ?? []) {
          status.textContent = '確認できた回答を表示しています…';
          await showItem(item);
        }
        if (!box) append(answerBox(),'p',result.answer);
      } else {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let pending='', finished=false;
        try {
          for (;;) {
            const {value,done} = await reader.read();
            if (done) break;
            pending+=value;
            const lines=pending.split('\n');
            pending=lines.pop();
            for (const line of lines) {
              const event=JSON.parse(line);
              if (event.error) throw Error(event.error);
              if (event.status) status.textContent=event.status;
              if (event.item) {
                await showItem(event.item);
                status.textContent='続きの回答を確認しています…';
              }
              if (event.done) {
                finished=true;
                if (event.answer) append(answerBox(),'p',event.answer);
              }
            }
          }
          if (!finished) throw Error('回答の受信が途中で止まりました。');
        } finally { await reader.cancel().catch(()=>{}); }
      }
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

try {
  if (!id && new URLSearchParams(location.search).has('library')) { show('#library'); documentLibrary(); }
  else if (!id) teacher();
  else await reader();
} catch (error) {
  content.replaceChildren();
  append(content,'p',error.message,'panel');
}
