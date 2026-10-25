const fs = require('fs');
const lines = fs.readFileSync('output.csv', 'utf8').split('\n').filter(l => l.trim());
console.log('Header:', lines[0]);
console.log('Total data rows:', lines.length - 1);

let errors = 0;
const seenCases = new Set();
const evalReqs = fs.readFileSync('dataset/deletion_requests.csv', 'utf8').split('\n').filter(l => l.trim()).slice(1).map(l => l.split(',')[0]);

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const idx1 = line.indexOf(',');
  const idx2 = line.indexOf(',', idx1 + 1);
  const cid = line.substring(0, idx1);
  const status = line.substring(idx1 + 1, idx2);
  let steps;
  try {
    let stepsStr = line.substring(idx2 + 1);
    if (stepsStr.startsWith('"') && stepsStr.endsWith('"')) {
      stepsStr = stepsStr.slice(1, -1).replace(/""/g, '"');
    }
    steps = JSON.parse(stepsStr);
  } catch (e) {
    console.error('Invalid JSON at row', i, cid, e.message);
    errors++;
  }

  seenCases.add(cid);
  if (!['COMPLETE', 'INCOMPLETE', 'NOT_APPLICABLE'].includes(status)) {
    console.error('Invalid status at row', i, status);
    errors++;
  }
  if (status === 'NOT_APPLICABLE' && steps.length !== 0) {
    console.error('NOT_APPLICABLE with non-empty steps at', cid);
    errors++;
  }
  // Check step numbering and phases
  let lastPhase = -1;
  const phaseMap = { 'FINDING': 0, 'REMEDIATION': 1, 'VERIFICATION': 2 };
  for (let sIdx = 0; sIdx < steps.length; sIdx++) {
    const s = steps[sIdx];
    if (s.step_no !== sIdx + 1) {
      console.error('Step numbering mismatch at', cid, sIdx, s.step_no);
      errors++;
    }
    const pOrder = phaseMap[s.phase];
    if (pOrder < lastPhase) {
      console.error('Phase order violation at', cid, steps);
      errors++;
    }
    lastPhase = pOrder;
  }
}

// Check coverage against deletion_requests.csv
console.log('Expected case_ids match count:', evalReqs.length === seenCases.size);
for (const reqCid of evalReqs) {
  if (!seenCases.has(reqCid)) {
    console.error('Missing case_id:', reqCid);
    errors++;
  }
}

console.log('Validation complete. Total validation errors:', errors);
