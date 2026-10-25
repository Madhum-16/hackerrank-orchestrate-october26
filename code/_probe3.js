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
for (const id of ['evidence_54','evidence_56','evidence_57','evidence_58','evidence_59','evidence_61','evidence_51','evidence_92','evidence_93','evidence_94','evidence_01','evidence_03','evidence_05']) {
  const e = man.find(x => x.file_id === id);
  console.log(id, e && e.file_path, e && e.captured_at);
}

// Search all evidence for account_001, account_006, priya.raman, etc.
const want = ['account_001','account_002','account_004','account_006','account_007','account_008','account_010','account_3960','priya.raman@gmail.com','support_001','analytics_901'];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(sql|json|log|txt|csv)$/i.test(ent.name)) {
      const t = fs.readFileSync(p, 'utf8');
      for (const w of want) {
        if (t.includes(w)) console.log('HIT', w, 'in', path.relative(root, p));
      }
    }
  }
}
walk(path.join(root, 'dataset/evidence'));

// system activity for emails
const activity = parseCSV(fs.readFileSync(path.join(root, 'dataset/system_activity.csv'), 'utf8'));
const emails = ['amina.elmasri@gmail.com','jonas.berg@outlook.com','priya.raman@gmail.com','k.appiah88@gmail.com'];
for (const em of emails) {
  const hits = activity.filter(a => (a.details || '').toLowerCase().includes(em));
  console.log('\nactivity email', em, hits.length);
  hits.slice(0, 6).forEach(h => console.log(' ', h.event_type, h.resource_id, h.details.slice(0, 140)));
}
