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
    pdfModule = import('./pdf.min.mjs').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs',import.meta.url).href;
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
  } catch { status.textContent = '保存済みの資料を読み込めませんでした。'; }
  function save(next) {
    try { localStorage.setItem(key,JSON.stringify(next)); }
    catch { status.textContent = 'ブラウザーに保存できませんでした。'; return false; }
    entries = next;
    render();
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
      link.href = '?id='+entry.id;
      if (entry.expires) {
        const expired = Date.now()>=entry.expires;
        append(body,'small',expired ? '共有期限を過ぎました' : '共有期限 '+new Date(entry.expires).toLocaleDateString('ja-JP'));
      }
      const remove = append(card,'button','一覧から外す');
      remove.type = 'button';
      remove.setAttribute('aria-label',entry.title+'を保管庫から外す');
      remove.onclick = ()=>{ if (save(entries.filter(item=>item.id!==entry.id))) status.textContent = '保管庫から外しました。'; };
    }
  }
  function add(entry) {
    const previous = entries.find(item=>item.id===entry.id);
    return save([{...previous,...entry},...entries.filter(item=>item.id!==entry.id)]);
  }
  $('#library-add').onsubmit = event=>{
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = data.get('title').trim();
    const url = new URL(data.get('url'));
    const id = url.searchParams.get('id');
    if (!title || url.origin!==location.origin || url.pathname!==location.pathname || !/^[a-f0-9-]{36}$/.test(id ?? '')) {
      status.textContent = '資料名と、このアプリの資料QA共有URLを入力してください。';
      return;
    }
    if (add({id,title})) {
      event.currentTarget.reset();
      status.textContent = '保管庫に追加しました。';
    }
  };
  render();
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
      data.set('pages',JSON.stringify(await extract(file,status)));
      status.textContent = '案内ページを作っています…';
      const {id,expires} = await request('/documents',{method:'POST',body:data});
      const url = '?id=' + id;
      $('#open-guide').href = url;
      $('#guide-url').value = new URL(url,location.href).href;
      $('#result').hidden = false;
      saveGuide({id,title:String(data.get('title')).trim(),expires});
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
      if (tab.id==='tab-original') void showPdf(1);
    });
    tab.addEventListener('keydown',event=>{
      const index = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if (index===undefined) return;
      event.preventDefault();
      tabs[index].focus();
    });
  });
  $('#reopen-pdf').addEventListener('click',()=>void showPdf(selectedPage || 1));
  let opened,originalUrl;
  let selectedPage = 0;
  let activeRender;
  const pagePicker = $('#pdf-page');
  for (let page=1;page<=doc.pageCount;page++) pagePicker.add(new Option(page+' / '+doc.pageCount,page));
  pagePicker.onchange = ()=>void showPdf(Number(pagePicker.value));
  $('#pdf-prev').onclick = ()=>void showPdf(selectedPage-1);
  $('#pdf-next').onclick = ()=>void showPdf(selectedPage+1);
  async function showPdf(n) {
    if (n<1 || n>doc.pageCount) return;
    selectedPage = n;
    pagePicker.value = n;
    $('#pdf-prev').disabled = n===1;
    $('#pdf-next').disabled = n===doc.pageCount;
    if (!dialog.open) dialog.showModal();
    $('#pdf-heading').textContent = '元のPDF · ' + n + 'ページ';
    $('#pdf-file').href = api + '/pdf#page=' + n;
    $('#pdf-status').textContent = 'PDFを表示しています…';
    $('#pdf-heading').focus();
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
      const scale = Math.min(2, dialog.clientWidth / page.getViewport({scale:1}).width * devicePixelRatio);
      const viewport = page.getViewport({scale});
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      activeRender = page.render({canvas, viewport});
      await activeRender.promise;
      if (selectedPage === n) {
        $('#pdf-canvas').replaceWith(canvas);
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
    const link = append(parent,'a','元のPDF ' + n + 'ページ →','ref');
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
      const result = await request(api + '/ask',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
      const box = append(log,'div','','bubble');
      if (result.items?.length) {
        for (const item of result.items) {
          const section = append(box,'section','','answer-item');
          append(section,'h3',item.label);
          append(section,'p',item.answer ?? 'この項目の根拠は資料内で確認できませんでした。');
          for (const {page,quote} of item.evidence) {
            append(section,'blockquote',quote);
            sourceLink(section,page);
          }
        }
      } else {
        append(box,'p',result.answer);
        for (const n of result.pages ?? []) sourceLink(box,n);
      }
      box.scrollIntoView({behavior:'smooth',block:'start'});
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

try {
  if (!id) teacher();
  else await reader();
} catch (error) {
  content.replaceChildren();
  append(content,'p',error.message,'panel');
}
