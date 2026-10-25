const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

function decodeASCII85(str) {
  str = str.replace(/^<~/, '').replace(/~>.*$/, '').replace(/\s+/g, '');
  const out = []; let tuple = 0; let count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 122 && count === 0) { out.push(0,0,0,0); continue; }
    if (c < 33 || c > 117) continue;
    tuple = tuple * 85 + (c - 33); count++;
    if (count === 5) {
      out.push((tuple >> 24) & 0xff, (tuple >> 16) & 0xff, (tuple >> 8) & 0xff, tuple & 0xff);
      tuple = 0; count = 0;
    }
  }
  if (count > 0) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    for (let i = 0; i < count - 1; i++) out.push((tuple >> (24 - 8 * i)) & 0xff);
  }
  return Buffer.from(out);
}

function extractPDF(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const text = buf.toString('latin1');
  const objRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let m; let extracted = '';
  while ((m = objRegex.exec(text)) !== null) {
    const objBody = m[3];
    const streamIdx = objBody.indexOf('stream');
    if (streamIdx === -1) continue;
    const globalStreamStart = m.index + m[0].indexOf(objBody) + streamIdx + 6;
    let sStart = globalStreamStart;
    if (buf[sStart] === 0x0d && buf[sStart + 1] === 0x0a) sStart += 2;
    else if (buf[sStart] === 0x0a || buf[sStart] === 0x0d) sStart += 1;
    const sEnd = buf.indexOf('endstream', sStart);
    if (sEnd === -1) continue;
    const streamBuf = buf.slice(sStart, sEnd);
    let inflated = null;
    if (objBody.includes('ASCII85Decode')) {
      try { inflated = zlib.inflateSync(decodeASCII85(streamBuf.toString('latin1'))); } catch (e) {}
    }
    if (!inflated) {
      try { inflated = zlib.inflateSync(streamBuf); } catch (e) {
        try { inflated = zlib.inflateRawSync(streamBuf); } catch (e2) {}
      }
    }
    if (inflated) {
      const infStr = inflated.toString('latin1');
      extracted += ' ' + infStr;
      const tj = [...infStr.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g)].map(x => x[1]);
      const TJ = [...infStr.matchAll(/\[(.*?)\]\s*TJ/gs)].map(x => x[1]);
      console.log('stream bytes', inflated.length, 'Tj', tj.slice(0, 20), 'TJ count', TJ.length);
    } else {
      // maybe plain
      const plain = streamBuf.toString('latin1');
      if (plain.includes('BT') || plain.includes('Tj')) extracted += ' ' + plain;
    }
  }
  return extracted;
}

const pdf = path.join(root, 'dataset/evidence/documents/delivery_correction_attachment.pdf');
const t = extractPDF(pdf);
console.log('extracted len', t.length);
console.log('support ids', t.match(/support_\d+/g));
console.log('emails', t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g));
console.log('snippet', t.replace(/[^\x20-\x7e]/g, ' ').replace(/ +/g, ' ').slice(0, 800));

// How are account IDs discovered for COMPLETE cases?
const activity = parseCSV(fs.readFileSync(path.join(root, 'dataset/system_activity.csv'), 'utf8'));
for (const uid of ['user_01', 'user_02', 'user_04', 'user_61', 'user_43']) {
  const hits = activity.filter(a => (a.details || '').includes(uid) || (a.details || '').toLowerCase().includes(uid));
  console.log('\nactivity for', uid, hits.length);
  hits.slice(0, 8).forEach(h => console.log(' ', h.activity_id, h.event_type, h.resource_id, h.details.slice(0, 120)));
}

// evidence_54 content type
const man = parseCSV(fs.readFileSync(path.join(root, 'dataset/evidence_files.csv'), 'utf8'));
const e54 = man.find(x => x.file_id === 'evidence_54');
console.log('\nevidence_54', e54);
if (e54) {
  const p = path.join(root, 'dataset', e54.file_path);
  const raw = fs.readFileSync(p, 'utf8');
  console.log('size', raw.length, 'has account_001', raw.includes('account_001'), 'has user_01', raw.includes('user_01'));
  const idx = raw.indexOf('account_001');
  if (idx >= 0) console.log(raw.slice(idx - 80, idx + 120));
  const idx2 = raw.indexOf('amina');
  if (idx2 >= 0) console.log(raw.slice(idx2 - 40, idx2 + 160));
}
