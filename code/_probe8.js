const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

const sampleOut = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_output.csv'), 'utf8'));
const samples = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_deletion_requests.csv'), 'utf8'));
const ids = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_identities.csv'), 'utf8'));
const audit = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_audit_log.csv'), 'utf8'));
const activity = parseCSV(fs.readFileSync(path.join(root, 'dataset/system_activity.csv'), 'utf8'));
const emailTo = {};
ids.forEach(u => { emailTo[u.email.toLowerCase()] = u; });
audit.forEach(a => {
  if (a.field_name === 'email' && a.old_value) emailTo[a.old_value.toLowerCase()] = ids.find(u => u.user_id === a.user_id);
});

// Hypothesis: account id is the DELETE_RECORD resource nearest after requested_at for... 
// Or: match via building full email->account from ALL logs ignoring capture time

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(log|txt|json|sql)$/i.test(ent.name)) acc.push(p);
  }
  return acc;
}

const emailToAccount = new Map();
const userToAccount = new Map();
const userToAudit = new Map();

for (const p of walk(path.join(root, 'dataset/evidence'))) {
  const t = fs.readFileSync(p, 'utf8');
  // handover lines
  for (const line of t.split('\n')) {
    const hm = line.match(/account_service\s*\|\s*(account_\d+)\s*\|.*\|\s*(\S+@\S+)\s*$/);
    if (hm) emailToAccount.set(hm[2].toLowerCase(), hm[1]);

    // lookup_key=email ... resource_id=account_
    const lk = line.match(/lookup_key=([^\s]+)[\s\S]{0,300}?resource_id=(account_\d+)/);
    // better: trace groups - parse line by line with trace
  }

  // JSON structured
  const re = /"lookup_key"\s*:\s*"([^"]+)"/g;
}

// Parse all logs with trace grouping for email->account
for (const p of walk(path.join(root, 'dataset/evidence'))) {
  if (!/\.log$/i.test(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const traces = {};
  for (const line of lines) {
    let tid = null;
    const m1 = line.match(/trace_id=([^\s]+)/);
    const m2 = line.match(/"trace_id"\s*:\s*"([^"]+)"/);
    const m3 = line.match(/\[(tr-[^\]]+)\]/);
    tid = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]);
    if (!tid) continue;
    if (!traces[tid]) traces[tid] = [];
    traces[tid].push(line);
  }
  for (const lines of Object.values(traces)) {
    const combined = lines.join('\n');
    const emails = combined.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
    const accounts = combined.match(/account_\d+/g) || [];
    const users = combined.match(/user_\d+/g) || [];
    const audits = combined.match(/audit_record_\d+/g) || [];
    for (const e of emails) {
      for (const a of accounts) emailToAccount.set(e.toLowerCase(), a);
    }
    for (const u of users) {
      for (const a of accounts) userToAccount.set(u, a);
      for (const ar of audits) userToAudit.set(u, ar);
    }
  }
}

// SQL inserts with email + account
for (const p of walk(path.join(root, 'dataset/evidence'))) {
  if (!/\.sql$/i.test(p)) continue;
  const t = fs.readFileSync(p, 'utf8');
  for (const line of t.split('\n')) {
    const m = line.match(/VALUES\s*\('(?:account_\d+)'/);
    if (!m) continue;
    const acct = line.match(/'(account_\d+)'/);
    const email = line.match(/'([^']+@[^']+)'/);
    const user = line.match(/'(user_\d+)'/);
    if (acct && email) emailToAccount.set(email[1].toLowerCase(), acct[1]);
    if (acct && user) userToAccount.set(user[1], acct[1]);
  }
}

let ok = 0, miss = [];
for (const s of samples) {
  const u = emailTo[s.email.toLowerCase()];
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const acct = (exp.find(x => String(x.resource_id).startsWith('account_')) || {}).resource_id;
  if (!u || !acct) continue;
  const got = emailToAccount.get(s.email.toLowerCase()) ||
    emailToAccount.get(u.email.toLowerCase()) ||
    userToAccount.get(u.user_id) ||
    `account_${String(u.user_id.replace(/\D/g, '')).padStart(3, '0')}`;
  const match = got === acct;
  if (match) ok++; else miss.push({ case: s.case_id, exp: acct, got, user: u.user_id });
}
console.log('account resolve', ok, '/', samples.length);
console.log('misses', miss);

// audit resolve for incomplete with security verify
let aok = 0, amiss = [];
for (const s of samples) {
  const u = emailTo[s.email.toLowerCase()];
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const aud = exp.find(x => String(x.resource_id).startsWith('audit_record_'));
  if (!aud || !u) continue;
  const got = userToAudit.get(u.user_id);
  if (got === aud.resource_id) aok++; else amiss.push({ case: s.case_id, exp: aud.resource_id, got, user: u.user_id });
}
console.log('audit resolve', aok, 'misses', amiss);
