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
  const fields = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current); return fields;
}

const root = path.resolve(__dirname, '..');
const ids = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_identities.csv'), 'utf8'));
const samples = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_deletion_requests.csv'), 'utf8'));
const sampleOut = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_output.csv'), 'utf8'));
const emailTo = Object.fromEntries(ids.map(u => [u.email.toLowerCase(), u]));
const audit = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_audit_log.csv'), 'utf8'));

for (const s of samples) {
  let u = emailTo[s.email.toLowerCase()];
  if (!u) {
    const hit = audit.find(a => a.field_name === 'email' && (a.old_value || '').toLowerCase() === s.email.toLowerCase());
    if (hit) u = ids.find(x => x.user_id === hit.user_id);
  }
  const exp = sampleOut.find(o => o.case_id === s.case_id);
  const steps = JSON.parse(exp.steps_json);
  const accounts = steps.filter(x => String(x.resource_id).startsWith('account_')).map(x => x.resource_id);
  console.log(s.case_id, 'user=', u ? u.user_id : 'NONE', 'name=', u ? u.name : '', 'status=', exp.deletion_status, 'accounts=', accounts.join('|'));
}

console.log('\n--- PDF evidence_58 ---');
const pdfPath = path.join(root, 'dataset/evidence/documents/delivery_correction_attachment.pdf');
const buf = fs.readFileSync(pdfPath);
console.log('pdf size', buf.length);
console.log('latin snippet has support?', buf.toString('latin1').includes('support'));
console.log('raw strings:', (buf.toString('latin1').match(/support_\d+/g) || []).slice(0, 5));
