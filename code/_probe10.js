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
const evalReqs = parseCSV(fs.readFileSync(path.join(root, 'dataset/deletion_requests.csv'), 'utf8'));
const activity = parseCSV(fs.readFileSync(path.join(root, 'dataset/system_activity.csv'), 'utf8'));
const ids = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_identities.csv'), 'utf8'));
const audit = parseCSV(fs.readFileSync(path.join(root, 'dataset/user_audit_log.csv'), 'utf8'));
const emailTo = {};
ids.forEach(u => { emailTo[u.email.toLowerCase()] = u; });
audit.forEach(a => {
  if (a.field_name === 'email' && a.old_value) emailTo[a.old_value.toLowerCase()] = ids.find(u => u.user_id === a.user_id);
});

const deletes = activity.filter(a => a.event_type === 'DELETE_RECORD' && a.target_system === 'account_service' && a.resource_id.startsWith('account_'));

function candidatesFor(req) {
  // window: requested_at to min(reported_at+buffer, audit_at)
  return deletes.filter(a => a.event_time >= req.requested_at && a.event_time <= req.audit_at);
}

let uniqueOk = 0, multi = 0, none = 0, wrong = 0;
for (const s of samples) {
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const acct = (exp.find(x => String(x.resource_id).startsWith('account_')) || {}).resource_id;
  const cands = candidatesFor(s);
  const ids = [...new Set(cands.map(c => c.resource_id))];
  if (ids.length === 0) { none++; console.log(s.case_id, 'NONE exp', acct); }
  else if (ids.length === 1) {
    if (ids[0] === acct) uniqueOk++; else { wrong++; console.log(s.case_id, 'WRONG', ids[0], 'exp', acct); }
  } else {
    multi++;
    const has = ids.includes(acct);
    console.log(s.case_id, 'MULTI', ids.length, 'hasExp', has, 'exp', acct, 'first', ids.slice(0, 5));
  }
}
console.log({ uniqueOk, multi, none, wrong, total: samples.length });

// Try tighter window: around reported_at ± 2 days
function candidatesTight(req) {
  const start = req.requested_at;
  const end = req.reported_at;
  // extend end by 3 days
  const endDate = new Date(new Date(end).getTime() + 3 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const audit = req.audit_at;
  const cap = endDate < audit ? endDate : audit;
  return deletes.filter(a => a.event_time >= start && a.event_time <= cap);
}

uniqueOk = multi = none = wrong = 0;
for (const s of samples) {
  const exp = JSON.parse(sampleOut.find(o => o.case_id === s.case_id).steps_json);
  const acct = (exp.find(x => String(x.resource_id).startsWith('account_')) || {}).resource_id;
  const ids = [...new Set(candidatesTight(s).map(c => c.resource_id))];
  if (ids.length === 0) { none++; console.log('T', s.case_id, 'NONE'); }
  else if (ids.length === 1) {
    if (ids[0] === acct) uniqueOk++; else { wrong++; console.log('T', s.case_id, 'WRONG', ids[0], acct); }
  } else {
    multi++;
    console.log('T', s.case_id, 'MULTI', ids.length, ids.includes(acct), acct);
  }
}
console.log('tight', { uniqueOk, multi, none, wrong });

// Inspect service export: maybe security audit has subject_reference linking to account lookups by time
const exp = JSON.parse(fs.readFileSync(path.join(root, 'dataset/evidence/records/service_resource_export_20260915_114455.json'), 'utf8'));
const se = exp.service_exports;
console.log('\nexport counts', Object.fromEntries(Object.entries(se).map(([k,v]) => [k, Object.values(v)[0].length])));
const audits = se.security_service.audit_records;
console.log('audit sample', JSON.stringify(audits.slice(0, 2), null, 2));
const profiles = se.account_service.profile_lookups;
console.log('profile times', profiles.map(p => p.observed_at + ' ' + p.resource_id));
console.log('audit times', audits.map(a => (a.observed_at || a.updated_at || a.event_time || JSON.stringify(a).slice(0, 80)) + ' ' + a.resource_id + ' ' + (a.subject_reference || '')));
