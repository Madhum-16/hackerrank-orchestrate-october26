const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

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

const man = parseCSV(fs.readFileSync(path.join(root, 'dataset/evidence_files.csv'), 'utf8'));
const auditAt = '2026-09-16T09:00:00Z';
const allowed = man.filter(e => e.captured_at <= auditAt);
console.log('allowed evidence count', allowed.length);

function readEvidence(e) {
  const p = path.join(root, 'dataset', e.file_path);
  if (!fs.existsSync(p)) return '';
  if (/\.(png|jpg|jpeg)$/i.test(p)) return '';
  if (/\.pdf$/i.test(p)) return fs.readFileSync(p); // binary
  return fs.readFileSync(p, 'utf8');
}

for (const e of allowed) {
  try {
    const t = readEvidence(e);
    const s = Buffer.isBuffer(t) ? t.toString('latin1') : t;
    if (s.includes('account_3960') || s.includes('audit_record_4902') || s.includes('user_61') || s.toLowerCase().includes('appiah')) {
      console.log('FOUND in', e.file_id, e.file_path, e.captured_at);
      if (typeof t === 'string') {
        t.split('\n').filter(l => /3960|4902|user_61|appiah/i.test(l)).slice(0, 5).forEach(l => console.log(' ', l.slice(0, 200)));
      }
    }
  } catch (err) {
    console.log('err', e.file_id, err.message);
  }
}

// Also check if evidence_93 captured_at is before audit
const e93 = man.find(x => x.file_id === 'evidence_93');
console.log('evidence_93', e93);
