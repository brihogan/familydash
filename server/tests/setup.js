import { beforeEach } from 'vitest';
import db from '../src/db/db.js';
import { signAccessToken } from '../src/services/authService.js';
import bcrypt from 'bcryptjs';

// Clean all data between tests (order matters for FK constraints)
const TABLES = [
  'activity_feed', 'reward_redemptions', 'ticket_ledger', 'chore_logs',
  'task_step_completions', 'task_assignments', 'task_steps', 'task_sets',
  'common_chore_assignments', 'common_chore_templates',
  'pending_deposits', 'transactions', 'recurring_rules', 'accounts',
  'rewards', 'chore_templates', 'refresh_tokens', 'users', 'families',
];

beforeEach(() => {
  db.pragma('foreign_keys = OFF');
  for (const table of TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.pragma('foreign_keys = ON');
  seedCounter = 0;
});

/**
 * Seed a family with a parent and optional kids.
 * Returns { family, parent, parentToken, kids: [{ ...kid, token }] }
 */
let seedCounter = 0;

export function seedFamily({ kidNames = ['Kid A', 'Kid B'], familyName = 'Test Family' } = {}) {
  seedCounter++;
  const familyRow = db.prepare(
    `INSERT INTO families (name) VALUES (?) RETURNING *`
  ).get(familyName);

  const passwordHash = bcrypt.hashSync('password123', 4); // fast rounds for tests
  const email = seedCounter === 1 ? 'parent@test.com' : `parent${seedCounter}@test.com`;

  const parent = db.prepare(`
    INSERT INTO users (family_id, name, email, password_hash, role, avatar_color, show_on_dashboard, chores_enabled)
    VALUES (?, 'Parent', ?, ?, 'parent', '#6366f1', 0, 0)
    RETURNING *
  `).get(familyRow.id, email, passwordHash);

  const parentToken = signAccessToken({
    userId: parent.id,
    familyId: parent.family_id,
    role: 'parent',
    name: parent.name,
    avatarColor: parent.avatar_color,
    avatarEmoji: null,
  });

  const kids = kidNames.map((name, i) => {
    const pinHash = bcrypt.hashSync('1234', 4);
    const kid = db.prepare(`
      INSERT INTO users (family_id, name, username, pin_hash, role, avatar_color, sort_order)
      VALUES (?, ?, ?, ?, 'kid', ?, ?)
      RETURNING *
    `).get(familyRow.id, name, name.toLowerCase().replace(/\s+/g, ''), pinHash, `#${(i + 1).toString().padStart(6, '0')}`, i);

    // Create main bank account for each kid
    db.prepare(`
      INSERT INTO accounts (user_id, name, type) VALUES (?, 'Checking', 'main')
    `).run(kid.id);

    const token = signAccessToken({
      userId: kid.id,
      familyId: kid.family_id,
      role: 'kid',
      name: kid.name,
      avatarColor: kid.avatar_color,
      avatarEmoji: null,
    });

    return { ...kid, token };
  });

  return { family: familyRow, parent, parentToken, kids };
}

export { db };
