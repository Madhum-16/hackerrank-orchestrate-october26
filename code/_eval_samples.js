/**
 * Deep sample evaluation: status + canonical step fields.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Load main.js helpers by re-running process via requiring after patch is hard;
// instead duplicate minimal CSV parse and invoke processCase by spawning a probe.

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

// Inject a small runner that exports processCase results for samples
const probe = `
const path = require('path');
const fs = require('fs');
const Module = require('module');
// Monkey: load main.js but stop before writing by intercepting writeFileSync
const origWrite = fs.writeFileSync;
let results = null;
fs.writeFileSync = function(p, data, enc) {
  if (String(p).endsWith('output.csv')) {
    // ignore write during probe; capture via parsing processCase separately
    return;
  }
  return origWrite.apply(this, arguments);
};
require('./main.js');
`;

// Simpler approach: parse sample requests through a duplicated export.
// We'll patch main temporarily to dump sample results JSON.

const mainPath = path.join(__dirname, 'main.js');
const mainSrc = fs.readFileSync(mainPath, 'utf8');

// Extract sample validation section and enhance dump
const dumpCode = mainSrc.replace(
  /console\.log\(`\[INFO\] Sample accuracy:.*?`\);/s,
  `const __sampleDump = [];
for (const sampleRow of sampleRequests) {
  const result = processCase(sampleRow);
  __sampleDump.push(result);
}
fs.writeFileSync(path.join(REPO_ROOT, 'code', '_sample_results.json'), JSON.stringify(__sampleDump, null, 2));
console.log('[INFO] Wrote sample dump');
console.log(\`[INFO] Sample accuracy: \${sampleCorrect}/\${sampleTotal} (\${((sampleCorrect / sampleTotal) * 100).toFixed(1)}%)\`);
process.exit(0);`
);

const tmpMain = path.join(__dirname, '_tmp_main_eval.js');
fs.writeFileSync(tmpMain, dumpCode);
const r = spawnSync('node', [tmpMain], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
console.log(r.stdout.split('\n').filter(l => l.includes('[INFO]') || l.includes('[WARN]') || l.includes('Error')).join('\n'));
if (r.status !== 0) {
  console.error(r.stderr.slice(0, 2000));
  process.exit(1);
}

const produced = JSON.parse(fs.readFileSync(path.join(__dirname, '_sample_results.json'), 'utf8'));
const byId = {};
produced.forEach(p => { byId[p.case_id] = p; });

function canon(steps) {
  return steps.map(s => ({
    phase: s.phase,
    system_id: s.system_id,
    resource_id: s.resource_id,
    operation: s.operation,
    state: s.state,
    evidence_id: s.evidence_id,
  }));
}

let statusOk = 0, stepsExact = 0, fieldHits = 0, fieldTotal = 0, seqOk = 0;
const failures = [];

for (const exp of sampleOut) {
  const got = byId[exp.case_id];
  const expSteps = JSON.parse(exp.steps_json);
  const gotSteps = got ? got.steps_json : [];
  if (got && got.deletion_status === exp.deletion_status) statusOk++;
  else failures.push({ case: exp.case_id, type: 'status', exp: exp.deletion_status, got: got && got.deletion_status });

  const ce = canon(expSteps);
  const cg = canon(gotSteps);
  if (JSON.stringify(ce) === JSON.stringify(cg)) {
    stepsExact++;
    seqOk++;
  } else {
    // field-level
    const n = Math.max(ce.length, cg.length);
    let caseSeq = true;
    for (let i = 0; i < n; i++) {
      if (!ce[i] || !cg[i]) { caseSeq = false; fieldTotal += 6; continue; }
      for (const k of Object.keys(ce[i])) {
        fieldTotal++;
        if (ce[i][k] === cg[i][k]) fieldHits++;
        else {
          caseSeq = false;
          failures.push({ case: exp.case_id, step: i + 1, field: k, exp: ce[i][k], got: cg[i][k] });
        }
      }
    }
    if (caseSeq && ce.length === cg.length) seqOk++;
  }
}

console.log(JSON.stringify({
  statusAccuracy: `${statusOk}/${sampleOut.length}`,
  stepsExact: `${stepsExact}/${sampleOut.length}`,
  sequenceOk: `${seqOk}/${sampleOut.length}`,
  fieldAccuracy: fieldTotal ? (fieldHits / fieldTotal) : 1,
  failureCount: failures.length,
  sampleFailures: failures.slice(0, 40),
}, null, 2));

// cleanup
try { fs.unlinkSync(tmpMain); } catch (_) {}
try { fs.unlinkSync(path.join(__dirname, '_sample_results.json')); } catch (_) {}
