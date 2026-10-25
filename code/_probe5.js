const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

// Inspect service export structure for user->account mapping
const p = path.join(root, 'dataset/evidence/records/service_resource_export_20260915_114455.json');
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('top keys', Object.keys(data));
if (data.service_exports) {
  console.log('services', Object.keys(data.service_exports));
  const acc = data.service_exports.account_service;
  console.log('account_service keys', acc && Object.keys(acc));
  const lookups = acc && acc.profile_lookups;
  console.log('profile_lookups sample', JSON.stringify(lookups && lookups.slice(0, 2), null, 2));
  console.log('count', lookups && lookups.length);
  // find amara okeke / user_21
  const hits = (lookups || []).filter(r => JSON.stringify(r).includes('user_21') || JSON.stringify(r).includes('6440') || JSON.stringify(r).toLowerCase().includes('amara'));
  console.log('user_21 hits', hits);
}

const hand = fs.readFileSync(path.join(root, 'dataset/evidence/records/customer_account_handover_20261001.txt'), 'utf8');
console.log('\nhandover sample lines:');
hand.split('\n').slice(0, 15).forEach(l => console.log(l));
console.log('--- fontaine/novak ---');
hand.split('\n').filter(l => /7566|4248|fontaine|novak|user_43|user_32/i.test(l)).forEach(l => console.log(l));

// inventory SQL schema for backups
const inv = fs.readFileSync(path.join(root, 'dataset/evidence/databases/customer_data_inventory_20260916.sql'), 'utf8');
console.log('\ninventory head:\n', inv.split('\n').slice(0, 40).join('\n'));
