import {config} from './config.js';
import {connectOwner} from './billing-view.js';
import {LIVE_TRANSLATION_USD_PER_MINUTE, TRANSLATION_PRICE} from './cost-policy.js';

const MODES = [
  ['face', '対面'], ['interpreter', 'チャット'], ['lesson', '授業'],
];

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
    ...(row.mode==='lesson' ? {
      ...(Number.isFinite(row.lessonDisplayedCaptions) ? {deliveredCaptions:row.lessonDisplayedCaptions} : {}),
      ...(row.lessonRecovery ?? {}),
    } : {}),
    base: number(costOf(row, row.priceSnapshot).total),
    live: [...recordings.values()].reduce((sum, event) => sum + number(event.liveAudioBytes), 0) /
      48000 / 60 * LIVE_TRANSLATION_USD_PER_MINUTE,
    summary: (number(summary?.inputTokens) * price.inputPerMillion +
      number(summary?.outputTokens) * price.outputPerMillion) / 1e6,
    partial: Number(row.unmeasuredCalls > 0 || summary?.requested > summary?.measuredCalls ||
      events.some(event => event.type === 'live_translation_start' && !measured.has(event.liveAttempt))),
  };
}

export function createAdoptionReport(el, { exchange, download }) {
  const panel = el('section', undefined, 'admin-detail');
  const scope = '自動集計の対象になった全ユーザーの端末の合計です。';
  const definition = '利用回数と字幕件数は端末単位です。同じ会話に複数端末が参加すると、各端末の利用として数えます。';
  const costNote = '利用料目安は字幕の翻訳・認識・中継、Live翻訳、Live要約の記録から試算します。共有字幕の翻訳費は発話元の記録を使います。固定費と未計測分は試算対象外です。';
  const now = Date.now();
  const calendar = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'});
  const label = el('label','集計月（日本時間）');
  const period = el('input');
  period.type = 'month';
  period.value = calendar.format(now).replace('/', '-');
  label.append(period);
  const login = el('button','Googleで全体の月報を表示');
  const refresh = el('button','月報を更新');
  login.type = refresh.type = 'button';
  refresh.hidden = true;
  const status = el('p');
  status.setAttribute('role','status');
  let owner, snapshot;
  async function load() {
    const month = period.value;
    if (!owner || !month) return;
    refresh.disabled = true;
    status.textContent = '集計を取得しています。';
    try {
      const response = await fetch(config.api + '/billing/school-usage', {
        method:'POST', headers:{Authorization:'Bearer ' + await owner.token(),'Content-Type':'application/json'},
        body:JSON.stringify({action:'report',month:month.replace('-', '/')}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '集計を取得できませんでした。');
      snapshot = {month,modes:result.modes};
      status.textContent = '';
      render();
    } catch (error) {
      status.textContent = error.message || '集計を取得できませんでした。';
    } finally {
      refresh.disabled = false;
      if (period.value !== month) void load();
    }
  }
  login.onclick = async () => {
    login.disabled = true;
    try {
      owner = await connectOwner('school-usage-admin');
      refresh.hidden = false;
      await load();
    } catch {
      status.textContent = 'Googleでログインできませんでした。';
    } finally { login.disabled = false; }
  };
  refresh.onclick = load;
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
  panel.append(el('h3', '学校導入向けの利用実績'), label, login, refresh, status, output, el('p', definition), share);

  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' });
  const headers = ['モード', '利用回数', '字幕件数', '利用時間（分）', 'マイク時間（分）', '利用料目安（円）', 'うちLive翻訳（円）', 'うちLive要約（円）'];
  function render() {
    share.hidden = snapshot?.month !== period.value;
    if (share.hidden) {
      output.replaceChildren();
      return;
    }
    const rate = exchange();
    const values = MODES.map(([mode]) => snapshot.modes[mode]);
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
    const [year, month] = period.value.split('-');
    const range = year + '年' + month + '月（表示日 ' + date.format(Date.now()) + '）';
    const observed = values.some(value => value.uses > 0) ? '' : 'この月の利用記録はありません。';
    const tableScroll = el('div');
    tableScroll.style.overflowX = 'auto';
    tableScroll.append(table);
    output.replaceChildren(el('p', range), el('p', scope), el('p', observed), tableScroll);
    const lesson = snapshot.modes.lesson;
    const recovery = [
      '生徒端末の字幕表示確認：'+(lesson.deliveredCaptions ?? '未計測'),
      '再接続試行：'+(lesson.reconnects ?? '未計測'),
      '再接続後の字幕受信確認：'+(lesson.captionRecoveries ?? '未計測'),
      '次の字幕までの平均時間：'+(lesson.captionRecoveries ? (lesson.recoverySeconds/lesson.captionRecoveries).toFixed(1)+'秒' : '未計測'),
    ];
    const recoveryNote = '授業の端末別記録から集計。次の字幕までの時間には次の発話を待つ時間も含まれます。';
    output.append(el('h4','授業の接続復旧'),...recovery.map(line=>el('p',line)),el('p',recoveryNote));
    rateNote.textContent = costNote + ' 換算は1米ドル＝' + rate + '円です。';
    report.value = ['通訳君 学校導入向けの利用実績', range, scope, observed, headers.join('\t'),
      ...data.map(row => row.join('\t')), '授業の接続復旧', ...recovery, recoveryNote, definition, timeNote, rateNote.textContent, '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'].join('\n');
  }
  const timeNote = '利用時間は開始から最後の記録までの経過時間で、待機時間を含みます。月をまたぐ利用は開始月にまとめます。';
  const rateNote = el('p');
  period.addEventListener('change', () => { render(); if (!refresh.disabled) void load(); });
  panel.addEventListener('usage-rate-change', render);
  panel.insertBefore(el('p', timeNote), share);
  panel.insertBefore(rateNote, share);
  panel.append(el('p', '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'));
  render();
  return panel;
}
