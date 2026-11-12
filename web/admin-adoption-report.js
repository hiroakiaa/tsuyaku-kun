const MODES = [
  ['face', '対面'], ['interpreter', 'チャット'], ['lesson', '授業'],
];

export function createAdoptionReport(el, sessions, { costOf, exchange, download }) {
  const panel = el('section', undefined, 'admin-detail');
  const scope = 'この端末の保存履歴（最大200件）。市内全体の人数・学校数・導入校数は集計していません。旧版で保存されなかった無料利用は含まれません。';
  const definition = '字幕またはLive字幕の記録がある利用と、マイクを使った利用を集計します。字幕件数には受信分を含むため、複数端末の値を合算しないでください。';
  const costNote = '利用料目安は記録から計算した字幕の翻訳・音声認識・中継の変動費です。固定費、Live翻訳、Live要約、未計測分を含まず、請求額や学校向けの契約料金とは異なります。';
  const calendar = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' });
  const now = Date.now();
  const active = sessions.filter(row => Number.isFinite(row.startedAt) && row.startedAt <= now &&
    (row.micSeconds > 0 || row.captionCount > 0 ||
      row.events?.some(event => event.type === 'live_translation_first_subtitle')));
  const months = [...new Set([calendar.format(now), ...active.map(row => calendar.format(row.startedAt))])].sort().reverse();
  const label = el('label', '集計月（日本時間）');
  const period = el('select');
  for (const month of months) {
    const option = el('option', month.replace('/', '年') + '月');
    option.value = month;
    period.append(option);
  }
  label.append(period);
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
  panel.append(el('h3', '学校導入向けの利用実績'), el('p', scope), label, output, el('p', definition), share);

  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' });
  const headers = ['モード', '利用回数', '字幕件数', '利用時間（分）', 'マイク時間（分）', '利用料目安（円）'];
  function render() {
    const rows = active.filter(row => calendar.format(row.startedAt) === period.value);
    const rate = exchange();
    function summarize(name, matching) {
      const sum = key => matching.reduce((total, row) => total +
        (Number.isFinite(row[key]) && row[key] > 0 ? row[key] : 0), 0);
      const usd = matching.reduce((total, row) => total + costOf(row, row.priceSnapshot).total, 0);
      const incomplete = matching.some(row => row.unmeasuredCalls > 0 || row.events?.some(event =>
        event.type === 'live_translation_start'));
      const cost = incomplete && usd === 0 ? '未計測' : (usd * rate).toFixed(2) + (incomplete ? '（一部）' : '');
      return [name, matching.length, sum('captionCount'), (sum('durationSeconds') / 60).toFixed(1),
        (sum('micSeconds') / 60).toFixed(1), matching.length ? cost : '—'];
    }
    const data = MODES.map(([mode, name]) => summarize(name, rows.filter(row => row.mode === mode)));
    data.push(summarize('合計', rows));
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
    const selected = period.selectedOptions[0].textContent;
    const range = selected + '（集計日 ' + date.format(now) + '）';
    const observed = rows.length ? '記録上の利用日数 ' + new Set(rows.map(row => date.format(row.startedAt))).size + '日' :
      'この期間の利用記録はありません。';
    const tableScroll = el('div');
    tableScroll.style.overflowX = 'auto';
    tableScroll.append(table);
    output.replaceChildren(el('p', range), el('p', observed), tableScroll);
    rateNote.textContent = costNote + ' 換算は1米ドル＝' + rate + '円です。';
    report.value = ['通訳君 学校導入向けの利用実績', range, scope, observed, headers.join('\t'),
      ...data.map(row => row.join('\t')), definition, timeNote, rateNote.textContent, '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'].join('\n');
  }
  const timeNote = '利用時間は開始から最後の記録までの経過時間で、待機時間を含みます。月をまたぐ利用は開始月にまとめます。';
  const rateNote = el('p');
  period.addEventListener('change', render);
  panel.insertBefore(el('p', timeNote), share);
  panel.insertBefore(rateNote, share);
  panel.append(el('p', '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'));
  render();
  return panel;
}
