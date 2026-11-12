import {config} from './config.js';
import {connectOwner} from './billing-view.js';
import {LIVE_TRANSLATION_USD_PER_MINUTE, TRANSLATION_PRICE} from './cost-policy.js';

const MODES = [
  ['face', '対面'], ['interpreter', 'チャット'], ['lesson', '授業'],
];

const STORAGE_KEY = 'tsuyaku-school-monthly-imports-v1';
const METRICS = ['uses', 'captions', 'seconds', 'mic', 'base', 'live', 'summary', 'partial'];
const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
function totals(rows) {
  return Object.fromEntries(METRICS.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
}

export function schoolUsageMetrics(row, costOf) {
  const events = row.events || [];
  const recordings = new Map(events.filter(event => Number.isFinite(event.liveAudioBytes))
    .map(event => [event.liveAttempt + ':' + event.liveLanguage, event]));
  const measured = new Set([...recordings.values()].map(event => event.liveAttempt));
  const summary = row.liveSummary;
  const price = row.priceSnapshot || TRANSLATION_PRICE;
  return {
    uses: 1, captions: number(row.captionCount), seconds: number(row.durationSeconds), mic: number(row.micSeconds),
    base: number(costOf(row, row.priceSnapshot).total),
    live: [...recordings.values()].reduce((sum, event) => sum + number(event.liveAudioBytes), 0) /
      48000 / 60 * LIVE_TRANSLATION_USD_PER_MINUTE,
    summary: (number(summary?.inputTokens) * price.inputPerMillion +
      number(summary?.outputTokens) * price.outputPerMillion) / 1e6,
    partial: Number(row.unmeasuredCalls > 0 || summary?.requested > summary?.measuredCalls ||
      events.some(event => event.type === 'live_translation_start' && !measured.has(event.liveAttempt))),
  };
}

export function createAdoptionReport(el, sessions, { costOf, exchange, download, api }) {
  const panel = el('section', undefined, 'admin-detail');
  let scope = 'この端末の保存履歴（最大200件）。';
  const definition = '字幕またはLive字幕の記録がある利用と、マイクを使った利用を集計します。利用回数・字幕件数・利用時間は端末単位です。同じ会話に複数端末が参加すると、受信字幕や利用時間が各端末に計上されます。';
  const costNote = '利用料目安は記録された変動費の参考値です。通常字幕・認識・中継、Live翻訳の送信音声、Live要約のトークンを含みます。複数端末で同じ翻訳費が記録されることがあります。固定費と未計測分は試算対象外です。';
  const calendar = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' });
  const now = Date.now();
  const active = sessions.filter(row => Number.isFinite(row.startedAt) && row.startedAt <= now &&
    (row.micSeconds > 0 || row.captionCount > 0 ||
      row.events?.some(event => event.type === 'live_translation_first_subtitle')));
  let imports;
  try { imports = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { imports = {}; }
  const label = el('label', '集計月（日本時間）');
  const period = el('select');
  label.append(period);
  const groupLabel = el('label', '集計対象');
  const group = el('select');
  groupLabel.append(group);
  const schoolLabel = el('label', '取り込み先の学校名');
  const school = el('input');
  school.maxLength = 100;
  schoolLabel.append(school);
  const fileLabel = el('label', '端末の集計ファイル（複数選択可）');
  const files = el('input');
  files.type = 'file';
  files.accept = '.json';
  files.multiple = true;
  fileLabel.append(files);
  const status = el('p');
  status.setAttribute('role', 'status');
  const transfer = el('details');
  const exportButton = el('button', 'この端末の集計を書き出す');
  const importButton = el('button', '選んだ学校に取り込む');
  exportButton.type = importButton.type = 'button';
  transfer.append(el('summary', '複数端末の集計'), el('p',
    '各端末で月を選び、集計ファイルを書き出します。集計担当の端末で学校名を指定して取り込んでください。再取り込みは同じ端末・月の集計を更新します。'),
    exportButton, schoolLabel, fileLabel, importButton, status);

  const codeKey = 'tsuyaku-school-code-v1';
  const auto = el('details');
  const codeLabel = el('label', '学校コード');
  const code = el('input');
  code.type = 'password';
  code.autocomplete = 'off';
  code.value = localStorage.getItem(codeKey) || '';
  codeLabel.append(code);
  const setup = el('button', '学校コードを保存');
  const stop = el('button', '自動送信を停止');
  const login = el('button', 'Googleで集計を管理');
  const create = el('button', '学校コードを発行');
  const load = el('button', '自動集計を表示');
  const monthInput = el('input');
  monthInput.type = 'month';
  monthInput.value = calendar.format(now).replace('/', '-');
  const monthLabel = el('label', '自動集計の月');
  monthLabel.append(monthInput);
  const nameLabel = el('label', '発行する学校名');
  const nameInput = el('input');
  nameInput.maxLength = 100;
  nameLabel.append(nameInput);
  const autoStatus = el('p');
  autoStatus.setAttribute('role', 'status');
  const issued = el('input');
  issued.readOnly = true;
  issued.hidden = true;
  issued.setAttribute('aria-label','発行した学校コード');
  auto.append(el('summary','学校コードと自動集計'), codeLabel, setup, stop, login, nameLabel, create, issued, monthLabel, load, autoStatus);
  let owner;
  const automatic = new Map();
  for (const button of [setup,stop,login,create,load]) button.type = 'button';
  function run(button, action) {
    button.onclick = async () => {
      button.disabled = true;
      try { await action(); } catch (error) { autoStatus.textContent = error.message || '操作を完了できませんでした。'; }
      finally { button.disabled = false; }
    };
  }
  async function admin(data) {
    if (!owner) throw Error('Googleで集計を管理するアカウントにログインしてください。');
    const response = await fetch(config.api + '/billing/school-usage', {
      method:'POST', headers:{Authorization:'Bearer ' + await owner.token(),'Content-Type':'application/json'},
      body:JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '自動集計を取得できませんでした。');
    return result;
  }
  run(setup, async () => {
    const value = code.value.trim().toLowerCase();
    await api('/school-usage',{action:'check',code:value});
    if (localStorage.getItem(codeKey) !== value) {
      localStorage.setItem('tsuyaku-school-since-v1', String(Date.now()));
      localStorage.setItem(codeKey, value);
    }
    autoStatus.textContent = '学校コードを保存しました。これからの利用を自動送信します。';
  });
  run(stop, async () => {
    localStorage.removeItem(codeKey);
    code.value = '';
    autoStatus.textContent = '自動送信を停止しました。';
  });
  run(login, async () => {
    owner = await connectOwner('school-usage-admin');
    autoStatus.textContent = 'Googleでログインしました。';
  });
  run(create, async () => {
    const result = await admin({action:'create',name:nameInput.value});
    issued.value = result.code;
    issued.hidden = false;
    autoStatus.textContent = '学校コードを発行しました。';
  });
  run(load, async () => {
    const month = monthInput.value.replace('-', '/');
    const result = await admin({action:'report',month});
    automatic.set(month, result.schools);
    refreshMonths();
    period.value = month;
    refreshGroups();
    group.value = 'auto:city';
    render();
    autoStatus.textContent = '自動集計を取得しました。';
  });

  function fill(select, options, fallback) {
    const previous = select.value;
    select.replaceChildren(...options.map(([value, name]) => {
      const option = el('option', name);
      option.value = value;
      return option;
    }));
    select.value = options.some(([value]) => value === previous) ? previous : fallback;
  }
  function refreshMonths() {
    const months = [...new Set([calendar.format(now), ...active.map(row => calendar.format(row.startedAt)),
      ...Object.values(imports).map(entry => entry.month), ...automatic.keys()])].sort().reverse();
    fill(period, months.map(month => [month, month.replace('/', '年') + '月']), months[0]);
  }
  function refreshGroups() {
    const schools = [...new Set(Object.values(imports).filter(entry => entry.month === period.value)
      .map(entry => entry.school))].sort();
    fill(group, [['local', 'この端末'], ['city', '市全体（取り込み分）'],
      ...schools.map(name => ['school:' + name, name]), ...(automatic.has(period.value) ? [['auto:city','市全体（自動集計）'], ...automatic.get(period.value).map((entry,index)=>['auto:'+index,entry.school+'（自動集計）'])] : [])], 'local');
  }
  exportButton.onclick = () => {
    try {
      const key = 'tsuyaku-monthly-export-id:' + period.value;
      const id = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, id);
      const rows = active.filter(row => calendar.format(row.startedAt) === period.value);
      const modes = Object.fromEntries(MODES.map(([mode]) =>
        [mode, totals(rows.filter(row => row.mode === mode).map(row => schoolUsageMetrics(row, costOf)))]));
      download('通訳君_端末集計_' + period.value.replace('/', '-') + '.json',
        JSON.stringify({ schema: 'tsuyaku-monthly-v1', month: period.value, id, modes }), 'application/json');
    } catch { status.textContent = '端末の集計ファイルを書き出せませんでした。'; }
  };
  importButton.onclick = async () => {
    const name = school.value.trim();
    if (!name || /[\t\r\n]/.test(name) || !files.files.length) {
      status.textContent = '学校名と集計ファイルを指定してください。';
      return;
    }
    importButton.disabled = true;
    try {
      const next = {...imports};
      for (const file of files.files) {
        if (file.size > 10000) throw Error('file size');
        const entry = JSON.parse(await file.text());
        if (entry.schema !== 'tsuyaku-monthly-v1' || !/^\d{4}\/(0[1-9]|1[0-2])$/.test(entry.month) ||
          !/^[a-f0-9-]{36}$/.test(entry.id)) throw Error('format');
        const modes = {};
        for (const [mode] of MODES) {
          modes[mode] = Object.fromEntries(METRICS.map(key => {
            const value = entry.modes?.[mode]?.[key];
            if (!Number.isFinite(value) || value < 0 || value > 1e12) throw Error('metric');
            return [key, value];
          }));
        }
        next[entry.month + ':' + entry.id] = { month: entry.month, school: name, modes };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      imports = next;
      refreshMonths();
      group.value = 'city';
      refreshGroups();
      render();
      files.value = '';
      status.textContent = '集計を取り込みました。';
    } catch { status.textContent = '取り込めませんでした。端末から書き出した集計ファイルを確認してください。'; }
    finally { importButton.disabled = false; }
  };
  refreshMonths();
  refreshGroups();
  const output = el('div');
  const share = el('details');
  const shareLabel = el('label', '共有用テキスト（本文・氏名・ルームIDなし）');
  const report = el('textarea');
  report.readOnly = true;
  report.rows = 9;
  report.style.width = '100%';
  shareLabel.append(report);
  const save = el('button', '月報をダウンロード');
  save.type = 'button';
  save.onclick = () => download('通訳君_利用実績_' + period.value.replace('/', '-') + '.txt', report.value, 'text/plain;charset=utf-8');
  share.append(el('summary', '共有用テキスト'), shareLabel, save);
  panel.append(el('h3', '学校導入向けの利用実績'), label, groupLabel, auto, transfer, output, el('p', definition), share);

  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' });
  const headers = ['モード', '利用回数', '字幕件数', '利用時間（分）', 'マイク時間（分）', '利用料目安（円）', 'うちLive翻訳（円）', 'うちLive要約（円）'];
  function render() {
    const rows = active.filter(row => calendar.format(row.startedAt) === period.value);
    const rate = exchange();
    const selected = group.value;
    const imported = Object.values(imports).filter(entry => entry.month === period.value &&
      (selected === 'city' || selected === 'school:' + entry.school));
    const autoRows = selected === 'auto:city' ? automatic.get(period.value) : selected.startsWith('auto:') ? [automatic.get(period.value)[Number(selected.slice(5))]] : null;
    scope = autoRows ? group.selectedOptions[0].textContent : selected === 'local' ? 'この端末の保存履歴（最大200件）。' :
      group.selectedOptions[0].textContent + 'の集計ファイル ' + imported.length + '件。';
    const values = MODES.map(([mode]) => totals(selected === 'local' ?
      rows.filter(row => row.mode === mode).map(row => schoolUsageMetrics(row, costOf)) :
      (autoRows || imported).map(entry => entry.modes[mode])));
    function summarize(name, value) {
      const usd = value.base + value.live + value.summary;
      const cost = value.partial && usd === 0 ? '未計測' : (usd * rate).toFixed(2) + (value.partial ? '（一部）' : '');
      return [name, value.uses, value.captions, (value.seconds / 60).toFixed(1), (value.mic / 60).toFixed(1),
        value.uses ? cost : '—', (value.live * rate).toFixed(2), (value.summary * rate).toFixed(2)];
    }
    const data = MODES.map(([, name], index) => summarize(name, values[index]));
    data.push(summarize('合計', totals(values)));
    const table = el('table');
    const caption = el('caption', 'モード別の利用実績');
    const head = el('thead');
    const headRow = el('tr');
    for (const header of headers) {
      const cell = el('th', header);
      cell.scope = 'col';
      headRow.append(cell);
    }
    head.append(headRow);
    const body = el('tbody');
    for (const [name, ...values] of data) {
      const row = el('tr');
      const cell = el('th', name);
      cell.scope = 'row';
      row.append(cell, ...values.map(value => el('td', String(value))));
      body.append(row);
    }
    table.append(caption, head, body);
    const range = period.selectedOptions[0].textContent + '（集計日 ' + date.format(now) + '）';
    const observed = selected !== 'local' ? (autoRows ? '学校コードで登録された端末の利用実績です。' : '提出された端末分の合計です。') : rows.length ? '記録上の利用日数 ' + new Set(rows.map(row => date.format(row.startedAt))).size + '日' :
      'この期間の利用記録はありません。';
    const tableScroll = el('div');
    tableScroll.style.overflowX = 'auto';
    tableScroll.append(table);
    output.replaceChildren(el('p', range), el('p', scope), el('p', observed), tableScroll);
    rateNote.textContent = costNote + ' 換算は1米ドル＝' + rate + '円です。';
    report.value = ['通訳君 学校導入向けの利用実績', range, scope, observed, headers.join('\t'),
      ...data.map(row => row.join('\t')), definition, timeNote, rateNote.textContent, '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'].join('\n');
  }
  const timeNote = '利用時間は開始から最後の記録までの経過時間で、待機時間を含みます。月をまたぐ利用は開始月にまとめます。';
  const rateNote = el('p');
  period.addEventListener('change', () => { refreshGroups(); render(); });
  group.addEventListener('change', render);
  panel.insertBefore(el('p', timeNote), share);
  panel.insertBefore(rateNote, share);
  panel.append(el('p', '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'));
  render();
  return panel;
}
