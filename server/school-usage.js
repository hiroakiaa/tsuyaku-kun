const MODES = ['face', 'interpreter', 'lesson'];
const FIELDS = ['uses', 'captions', 'seconds', 'mic', 'base', 'live', 'summary', 'partial'];
const MONTH = /^\d{4}\/(0[1-9]|1[0-2])$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const reply = (data, status = 200) => Response.json(data, { status });

export async function schoolUsage(storage, data) {
  const { action, code, month } = data;
  if (action === 'create') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) return reply({error:'学校名を確認してください。'}, 400);
    const key = crypto.randomUUID();
    await storage.put('school:' + key, name);
    return reply({ code: key });
  }
  if (action === 'submit' || action === 'check') {
    if (!UUID.test(code || '') || !await storage.get('school:' + code)) return reply({error:'学校コードを確認してください。'}, 400);
    if (action === 'check') return reply({ok:true});
    if (!Array.isArray(data.rows) || data.rows.length > 200 || !UUID.test(data.device || '')) return reply({error:'集計データを確認してください。'}, 400);
    const updates = {};
    for (const row of data.rows) {
      if (!row || !UUID.test(row.id || '') || !MONTH.test(row.month || '') || !MODES.includes(row.mode) ||
          !FIELDS.every(key => Number.isFinite(row[key]) && row[key] >= 0 && row[key] <= 1e9)) {
        return reply({error:'集計データを確認してください。'}, 400);
      }
      const key = 'usage:' + row.month + ':' + code + ':' + data.device + ':' + row.id;
      updates[key] = {mode:row.mode, ...Object.fromEntries(FIELDS.map(field => [field,row[field]]))};
    }
    for (const [key, row] of Object.entries(updates)) await storage.put(key, row);
    return reply({ok:true});
  }
  if (action !== 'report' || !MONTH.test(month || '')) return reply({error:'集計月を確認してください。'}, 400);
  const schools = await storage.list({prefix:'school:'});
  const rows = await storage.list({prefix:'usage:' + month + ':'});
  const result = new Map();
  for (const [key, row] of rows) {
    const code = key.split(':')[2];
    if (!result.has(code)) result.set(code, {
      school: schools.get('school:' + code),
      modes: Object.fromEntries(MODES.map(mode => [mode,Object.fromEntries(FIELDS.map(field => [field,0]))])),
    });
    const mode = result.get(code).modes[row.mode];
    for (const field of FIELDS) mode[field] += row[field];
  }
  return reply({ schools:[...result.values()] });
}
