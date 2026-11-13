if(new URLSearchParams(location.search).get('embedded')==='1')document.body.querySelector('header').hidden=true;
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

function teacher() {
  show('#teacher');
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
      const {id} = await request('/documents',{method:'POST',body:data});
      const url = '?id=' + id;
      $('#open-guide').href = url;
      $('#guide-url').value = new URL(url,location.href).href;
      $('#result').hidden = false;
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
  let opened,originalUrl;
  let selectedPage = 0;
  let activeRender;
  async function showPdf(n) {
    selectedPage = n;
    $('#original').hidden = false;
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
      const scale = Math.min(2, $('#original').clientWidth / page.getViewport({scale:1}).width * devicePixelRatio);
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
  function sourceLink(parent,n) {
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
  $('#original-top').addEventListener('click',event=>{event.preventDefault(); void showPdf(1);});
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
    button.disabled = true;
    append(log,'div',question,'bubble user');
    status.textContent = '資料から答えを探しています…';
    log.scrollTop = log.scrollHeight;
    try {
      const result = await request(api + '/ask',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
      const box = append(log,'div','','bubble');
      append(box,'p',result.answer);
      for (const n of result.pages) sourceLink(box,n);
      if (field.value.trim() === question) field.value = '';
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; log.scrollTop = log.scrollHeight; }
  });
}

try {
  if (!id) teacher();
  else await reader();
} catch (error) {
  content.replaceChildren();
  append(content,'p',error.message,'panel');
}
