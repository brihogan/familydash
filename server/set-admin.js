#!/usr/bin/env node
/**
 * Grant or revoke admin access by email.
 *
 * Usage:
 *   node set-admin.js <email>            # grant admin
 *   node set-admin.js <email> --revoke   # revoke admin
 *
 * Respects DATABASE_PATH env var (same as the server).
 */
import db from './src/db/db.js';

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Usage: node set-admin.js <email> [--revoke]');
  process.exit(1);
}

const user = db.prepare('SELECT id, name, email, role, is_admin FROM users WHERE email = ?').get(email);

if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const newValue = revoke ? 0 : 1;

if (user.is_admin === newValue) {
  console.log(`${user.name} (${user.email}) is already ${revoke ? 'not an admin' : 'an admin'}.`);
  process.exit(0);
}

db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(newValue, user.id);
console.log(`${revoke ? 'Revoked' : 'Granted'} admin access for ${user.name} (${user.email}).`);
