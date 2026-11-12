const MODES = ['face', 'interpreter', 'lesson'];
const FIELDS = ['uses', 'captions', 'seconds', 'mic', 'base', 'live', 'summary', 'partial'];
const MONTH = /^\d{4}\/(0[1-9]|1[0-2])$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const reply = (data, status = 200) => Response.json(data, { status });

export async function schoolUsage(storage, data) {
  const { action, month } = data;
  if (action === 'submit') {
    if (!Array.isArray(data.rows) || data.rows.length > 200 || !UUID.test(data.device || '')) return reply({error:'集計データを確認してください。'}, 400);
    const updates = {};
    for (const row of data.rows) {
      if (!row || !UUID.test(row.id || '') || !MONTH.test(row.month || '') || !MODES.includes(row.mode) ||
          !FIELDS.every(key => Number.isFinite(row[key]) && row[key] >= 0 && row[key] <= 1e9)) {
        return reply({error:'集計データを確認してください。'}, 400);
      }
      const key = 'usage:' + row.month + ':' + data.device + ':' + row.id;
      updates[key] = {mode:row.mode, ...Object.fromEntries(FIELDS.map(field => [field,row[field]]))};
    }
    for (const [key, row] of Object.entries(updates)) await storage.put(key, row);
    return reply({ok:true});
  }
  if (action !== 'report' || !MONTH.test(month || '')) return reply({error:'集計月を確認してください。'}, 400);
  const rows = await storage.list({prefix:'usage:' + month + ':'});
  const modes = Object.fromEntries(MODES.map(mode => [mode,Object.fromEntries(FIELDS.map(field => [field,0]))]));
  for (const row of rows.values()) {
    for (const field of FIELDS) modes[row.mode][field] += row[field];
  }
  return reply({ modes });
}
