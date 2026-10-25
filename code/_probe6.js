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
const hit = man.find(e => e.file_path.includes('structured_service_events_eu_west'));
console.log(hit);

// Check if inventory SQL or other evidence before audit links account_3960
const sampleOut = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_output.csv'), 'utf8'));
const samples = parseCSV(fs.readFileSync(path.join(root, 'dataset/sample_deletion_requests.csv'), 'utf8'));
const ids = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_identities.csv'), 'utf8'));
const audit = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_audit_log.csv'), 'utf8'));
const activity = parseCSV(fs.readFileSync(path.join(root, 'dataset/system_activity.csv'), 'utf8'));

// Build email->user
const emailTo = {};
ids.forEach(u => { emailTo[u.email.toLowerCase()] = u; });
audit.forEach(a => {
  if (a.field_name === 'email' && a.old_value) emailTo[a.old_value.toLowerCase()] = ids.find(u => u.user_id === a.user_id);
});

// For cases where account is LOOKUP and not in evidence with email, check activity near requested_at
for (const s of samples) {
  const u = emailTo[s.email.toLowerCase()];
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const acct = (exp.find(x => String(x.resource_id).startsWith('account_')) || {}).resource_id;
  if (!u || !acct) continue;

  // activity with this account
  const acts = activity.filter(a => a.resource_id === acct);
  // activity mentioning email or user
  const actsUser = activity.filter(a => {
    const d = (a.details || '').toLowerCase();
    return d.includes(u.user_id.toLowerCase()) || d.includes(s.email.toLowerCase()) ||
      (u.email && d.includes(u.email.toLowerCase()));
  });

  const near = acts.filter(a => a.event_time >= s.requested_at && a.event_time <= s.audit_at);
  console.log(s.case_id, u.user_id, acct, 'acts', acts.length, 'near', near.length, 'userActs', actsUser.length,
    'userActResources', [...new Set(actsUser.map(a => a.resource_id))].slice(0, 5).join(','));
}
