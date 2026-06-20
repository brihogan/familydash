// Mint a device token for the FamDash Garmin app (or any embedded read client).
//
//   node --env-file=.env scripts/make-device-token.js [familyId] [label]
//
// With no familyId it picks the lowest family id. The plaintext token is printed
// once — store it in the watch app's settings (Garmin Connect → FamDash → API
// key). Only the sha-256 hash is persisted, so a lost token must be re-minted.
import db from '../server/src/db/db.js';
import { createDeviceToken } from '../server/src/middleware/deviceAuth.js';

const familyArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const label = process.argv[3] || 'FamDash watch';

const family = familyArg
  ? db.prepare('SELECT id, name FROM families WHERE id = ?').get(familyArg)
  : db.prepare('SELECT id, name FROM families ORDER BY id ASC LIMIT 1').get();

if (!family) {
  console.error('No family found in the database.');
  process.exit(1);
}

const { id, token } = createDeviceToken({ familyId: family.id, scope: 'read', label });
console.log(`Family:   ${family.name} (id ${family.id})`);
console.log(`Token id: ${id}  (scope: read, label: "${label}")`);
console.log('');
console.log('API key (shown ONCE — store it in the watch now):');
console.log(`  ${token}`);
