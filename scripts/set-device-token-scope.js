// Change an existing device token's scope (reuse the same token, no re-mint).
// Pass the token value (fd_...) or its numeric id. Default scope: read,write.
//
//   node --env-file=.env scripts/set-device-token-scope.js <token-or-id> [scope]
//
// e.g. give the watch's read token write access:
//   node --env-file=.env scripts/set-device-token-scope.js fd_xxxxxxxx read,write
import db from '../server/src/db/db.js';
import { hashToken } from '../server/src/middleware/deviceAuth.js';

const arg = process.argv[2];
const scope = process.argv[3] || 'read,write';
if (!arg) {
  console.error('usage: set-device-token-scope <token-or-id> [scope]');
  process.exit(1);
}

const row = /^\d+$/.test(arg)
  ? db.prepare('SELECT id, label, scope FROM device_tokens WHERE id = ?').get(parseInt(arg, 10))
  : db.prepare('SELECT id, label, scope FROM device_tokens WHERE token_hash = ?').get(hashToken(arg));

if (!row) {
  console.error('No matching device token.');
  process.exit(1);
}

db.prepare('UPDATE device_tokens SET scope = ? WHERE id = ?').run(scope, row.id);
console.log(`Token id ${row.id} ("${row.label}") scope: ${row.scope} -> ${scope}`);
