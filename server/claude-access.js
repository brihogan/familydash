#!/usr/bin/env node
/**
 * CLI tool to grant or revoke Claude Code access for a family.
 *
 * Usage:
 *   node claude-access.js grant bhogan@hey.com
 *   node claude-access.js revoke bhogan@hey.com
 *   node claude-access.js list
 */

import db from './src/db/db.js';

const [,, action, email] = process.argv;

if (action === 'list') {
  const families = db.prepare(`
    SELECT f.id, f.name, f.claude_access,
           (SELECT u.email FROM users u WHERE u.family_id = f.id AND u.role = 'parent' LIMIT 1) AS parent_email
    FROM families f ORDER BY f.name
  `).all();

  console.log('\nFamilies:');
  for (const f of families) {
    const status = f.claude_access ? '\x1b[32m✓ granted\x1b[0m' : '\x1b[90m✗ denied\x1b[0m';
    console.log(`  ${status}  ${f.name} (${f.parent_email || 'no parent'}) [id: ${f.id}]`);
  }
  console.log();
  process.exit(0);
}

if (!action || !email || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node claude-access.js <grant|revoke|list> [email]');
  process.exit(1);
}

const user = db.prepare('SELECT id, name, family_id FROM users WHERE email = ? COLLATE NOCASE').get(email);
if (!user) {
  console.error(`Error: No user found with email "${email}"`);
  process.exit(1);
}

const family = db.prepare('SELECT id, name FROM families WHERE id = ?').get(user.family_id);
if (!family) {
  console.error(`Error: No family found for user "${email}"`);
  process.exit(1);
}

const value = action === 'grant' ? 1 : 0;
db.prepare('UPDATE families SET claude_access = ? WHERE id = ?').run(value, family.id);

const verb = action === 'grant' ? 'Granted' : 'Revoked';
console.log(`${verb} Claude Code access for family "${family.name}" (${email})`);
