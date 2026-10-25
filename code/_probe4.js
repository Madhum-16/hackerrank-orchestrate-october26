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

const samples = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_deletion_requests.csv'), 'utf8'));
const sampleOut = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_output.csv'), 'utf8'));
const ids = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_identities.csv'), 'utf8'));
const audit = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_audit_log.csv'), 'utf8'));
const emailTo = Object.fromEntries(ids.map(u => [u.email.toLowerCase(), u]));
for (const a of audit) {
  if (a.field_name === 'email' && a.old_value) {
    const em = a.old_value.toLowerCase();
    if (!emailTo[em]) emailTo[em] = ids.find(u => u.user_id === a.user_id);
  }
}

function resolveAccount(user) {
  const num = parseInt(user.user_id.replace(/\D/g, ''), 10);
  // convention candidates
  return [
    `account_${String(num).padStart(3, '0')}`,
    `account_${num}`,
  ];
}

// For each sample, find where expected account_id appears linked to user
const evidenceRoot = path.join(root, 'dataset/evidence');
function allTextFiles() {
  const out = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(sql|json|log|txt)$/i.test(ent.name)) out.push(p);
    }
  }
  walk(evidenceRoot);
  return out;
}
const files = allTextFiles().map(p => ({ p, t: fs.readFileSync(p, 'utf8') }));

for (const s of samples) {
  const u = emailTo[s.email.toLowerCase()];
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const acct = exp.find(x => String(x.resource_id).startsWith('account_'));
  if (!acct || !u) continue;
  const rid = acct.resource_id;
  const cands = resolveAccount(u);
  const convention = cands.includes(rid) ? 'CONVENTION' : 'LOOKUP';
  let foundIn = [];
  for (const f of files) {
    if (!f.t.includes(rid)) continue;
    // check linkage
    const windowHits = [];
    let idx = 0;
    while ((idx = f.t.indexOf(rid, idx)) !== -1) {
      const win = f.t.slice(Math.max(0, idx - 200), idx + 200);
      if (win.includes(u.user_id) || win.toLowerCase().includes(u.email.toLowerCase()) ||
          (u.name && win.includes(u.name.split(' ')[0]) && win.includes(u.name.split(' ').slice(-1)[0]))) {
        windowHits.push(true);
      }
      idx += rid.length;
    }
    if (windowHits.length || f.t.includes(u.user_id) && f.t.includes(rid)) {
      foundIn.push(path.relative(root, f.p) + (windowHits.length ? '*' : ''));
    }
  }
  console.log(s.case_id, u.user_id, rid, convention, 'linkedFiles', foundIn.slice(0, 3).join(';') || 'NONE');
}

// Check evidence_94 for louis fontaine / account_7566
const e94 = files.find(f => f.p.includes('resource_lookup_trace_20260926'));
if (e94) {
  const lines = e94.t.split('\n').filter(l => l.includes('7566') || l.toLowerCase().includes('fontaine') || l.includes('user_43'));
  console.log('\nevidence_94 hits', lines.length);
  lines.slice(0, 15).forEach(l => console.log(l.slice(0, 220)));
}

// evidence_93 for account_3960 / appiah
const e93 = files.find(f => f.p.includes('customer_data_inventory_20260916'));
if (e93) {
  const lines = e93.t.split('\n').filter(l => l.includes('3960') || l.toLowerCase().includes('appiah') || l.includes('user_61') || l.includes('backup_4978'));
  console.log('\nevidence_93 hits', lines.length);
  lines.slice(0, 20).forEach(l => console.log(l.slice(0, 220)));
}
