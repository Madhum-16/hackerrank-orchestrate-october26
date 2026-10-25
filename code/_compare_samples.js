const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const root = path.resolve(__dirname, '..');
const so = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_output.csv'), 'utf8'));
const out = parseCSV(fs.readFileSync(path.join(root, 'output.csv'), 'utf8'));
const om = {};
out.forEach(r => { om[r.case_id] = r; });

let statusOk = 0, stepExact = 0, stepCanon = 0;
for (const s of so) {
  const o = om[s.case_id];
  if (!o) { console.log('missing', s.case_id); continue; }
  if (o.deletion_status === s.deletion_status) statusOk++;
  else console.log('STATUS', s.case_id, s.deletion_status, '->', o.deletion_status);

  const a = JSON.parse(s.steps_json);
  const b = JSON.parse(o.steps_json);
  const canon = (steps) => steps.map(({ phase, system_id, resource_id, operation, state, evidence_id }) =>
    ({ phase, system_id, resource_id, operation, state, evidence_id }));
  if (JSON.stringify(a) === JSON.stringify(b)) stepExact++;
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) stepCanon++;
  else {
    console.log('STEPS', s.case_id, 'exp', a.length, 'got', b.length);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const ea = a[i], eb = b[i];
      if (!ea) { console.log('  extra', JSON.stringify(eb)); continue; }
      if (!eb) { console.log('  missing', JSON.stringify(ea)); continue; }
      for (const k of ['phase', 'system_id', 'resource_id', 'operation', 'state', 'evidence_id']) {
        if (ea[k] !== eb[k]) console.log(`  step ${i + 1} ${k}: exp=${ea[k]} got=${eb[k]}`);
      }
    }
  }
}
console.log({ statusOk, stepExact, stepCanon, total: so.length, outRows: out.length });
const counts = {};
out.forEach(r => { counts[r.deletion_status] = (counts[r.deletion_status] || 0) + 1; });
console.log(counts);
