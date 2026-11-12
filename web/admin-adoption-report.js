const MODES = [
  ['face', '対面'], ['interpreter', 'チャット'], ['lesson', '授業'],
];

export function createAdoptionReport(el, sessions) {
  const panel = el('section', undefined, 'admin-detail');
  const scope = 'この端末の保存履歴（最大200件）。市内全体の人数・学校数・導入校数は集計していません。旧版で保存されなかった無料利用は含まれません。';
  const definition = '字幕またはLive字幕の記録がある利用と、マイクを使った利用を集計します。字幕件数には受信分を含むため、複数端末の値を合算しないでください。';
  const label = el('label', '集計期間');
  const period = el('select');
  for (const [days, name] of [[30, '直近30日'], [90, '直近90日'], [0, '保存期間全体']]) {
    const option = el('option', name);
    option.value = days;
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
  share.append(el('summary', '共有用テキスト'), shareLabel);
  panel.append(el('h3', '学校導入向けの利用実績'), el('p', scope), label, output, el('p', definition), share);

  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' });
  const headers = ['モード', '利用回数', '字幕件数', 'マイク時間（分）'];
  function render() {
    const now = Date.now();
    const days = Number(period.value);
    const from = days ? now - days * 86400000 : 0;
    const rows = sessions.filter(row => Number.isFinite(row.startedAt) && row.startedAt >= from &&
      row.startedAt <= now && (row.micSeconds > 0 || row.captionCount > 0 ||
        row.events?.some(event => event.type === 'live_translation_first_subtitle')));
    const data = MODES.map(([mode, name]) => {
      const matching = rows.filter(row => row.mode === mode);
      const sum = key => matching.reduce((total, row) => total +
        (Number.isFinite(row[key]) && row[key] > 0 ? row[key] : 0), 0);
      return [name, matching.length, sum('captionCount'), (sum('micSeconds') / 60).toFixed(1)];
    });
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
    output.replaceChildren(el('p', range), el('p', observed), table);
    report.value = ['通訳君 学校導入向けの利用実績', range, scope, observed, headers.join('\t'),
      ...data.map(row => row.join('\t')), definition, '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'].join('\n');
  }
  period.addEventListener('change', render);
  panel.append(el('p', '字幕件数は履歴に記録された件数です。対面Liveの途中字幕は含みません。'));
  render();
  return panel;
}
