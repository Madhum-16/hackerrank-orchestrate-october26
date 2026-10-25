const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const targets = [
  ['account_6440', 'user_21', 'amara'],
  ['account_5521', 'user_50', 'mori'],
  ['account_5037', 'user_48', 'akosua'],
  ['account_4990', 'user_51', 'seoyeon'],
  ['account_410', 'user_23', 'thandiwe.m'],
  ['account_994', 'user_53', 'diya'],
  ['audit_record_3737', 'user_21', 'amara'],
  ['audit_record_6645', 'user_50', 'mori'],
  ['tombstone_440', 'user_541', 'eze'],
  ['tombstone_9178', 'user_542', 'addo'],
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

for (const [rid, uid, hint] of targets) {
  console.log('\n===', rid, uid, hint, '===');
  for (const p of walk(path.join(root, 'dataset'))) {
    if (/\.(png|jpg|pdf|zip)$/i.test(p)) continue;
    let t;
    try { t = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (!t.includes(rid)) continue;
    const lines = t.split('\n');
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(rid)) {
        const window = lines.slice(Math.max(0, i - 2), i + 3).join(' | ');
        const linked = window.toLowerCase().includes(hint) || window.includes(uid) || /@/.test(window);
        hits.push({ i, linked, snippet: lines[i].slice(0, 180) });
      }
    }
    if (hits.length) {
      console.log(path.relative(root, p), 'hits', hits.length, 'linked', hits.filter(h => h.linked).length);
      hits.filter(h => h.linked).slice(0, 3).forEach(h => console.log('  L', h.snippet));
      if (!hits.some(h => h.linked)) hits.slice(0, 2).forEach(h => console.log('  U', h.snippet));
    }
  }
}
