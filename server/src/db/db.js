import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../../data/family.db');

// Ensure data directory exists
const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Apply schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Enable WAL and foreign keys (idempotent)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Migrations ───────────────────────────────────────────────────────────────
// Each migration uses a try/catch so it's safe to run on an existing database.

// v1: add sort_order to users for manual family member ordering
try {
  db.exec(`ALTER TABLE users ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

// v2: show_on_dashboard — parents hidden by default, kids shown
try {
  db.exec(`ALTER TABLE users ADD COLUMN show_on_dashboard INTEGER NOT NULL DEFAULT 1`);
  db.exec(`UPDATE users SET show_on_dashboard = 0 WHERE role = 'parent'`);
} catch (_) { /* column already exists */ }

// v3: show_balance_on_dashboard — balance visible by default for everyone
try {
  db.exec(`ALTER TABLE users ADD COLUMN show_balance_on_dashboard INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v4: avatar_emoji — optional emoji to replace the color circle
try {
  db.exec(`ALTER TABLE users ADD COLUMN avatar_emoji TEXT`);
} catch (_) { /* column already exists */ }

// v5: amount_cents on activity_feed — for displaying bank amounts in the feed
try {
  db.exec(`ALTER TABLE activity_feed ADD COLUMN amount_cents INTEGER`);
} catch (_) { /* column already exists */ }

// v6: days_of_week on chore_templates — bitmask Mon=1 Tue=2 Wed=4 Thu=8 Fri=16 Sat=32 Sun=64; 127 = all days
try {
  db.exec(`ALTER TABLE chore_templates ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127`);
} catch (_) { /* column already exists */ }

// v7: emoji on rewards — optional icon for each reward
try {
  db.exec(`ALTER TABLE rewards ADD COLUMN emoji TEXT`);
} catch (_) { /* column already exists */ }

// v9: tags on task_sets — JSON array of lowercase tag strings
try {
  db.exec(`ALTER TABLE task_sets ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
} catch (_) { /* column already exists or table not yet created */ }

// v10: category on task_sets — single plain-text category string
try {
  db.exec(`ALTER TABLE task_sets ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
} catch (_) { /* column already exists */ }

// v11: ticket_reward on task_sets — tickets awarded when all steps are completed
try {
  db.exec(`ALTER TABLE task_sets ADD COLUMN ticket_reward INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

// v12: use_banking on families — toggle to hide banking features family-wide
try {
  db.exec(`ALTER TABLE families ADD COLUMN use_banking INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v13: use_sets on families — toggle to hide task sets features family-wide
try {
  db.exec(`ALTER TABLE families ADD COLUMN use_sets INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v14: use_tickets on families — toggle to hide tickets & rewards features family-wide
try {
  db.exec(`ALTER TABLE families ADD COLUMN use_tickets INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v15: require_task_approval on users — kids' completions require parent approval before tickets are awarded
try {
  db.exec(`ALTER TABLE users ADD COLUMN require_task_approval INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

// v16: approval_status on chore_logs — NULL=no approval needed, 'pending', 'approved'
try {
  db.exec(`ALTER TABLE chore_logs ADD COLUMN approval_status TEXT DEFAULT NULL`);
} catch (_) { /* column already exists */ }

// v17: approval_status on task_step_completions — NULL=no approval needed, 'pending', 'approved'
try {
  db.exec(`ALTER TABLE task_step_completions ADD COLUMN approval_status TEXT DEFAULT NULL`);
} catch (_) { /* column already exists */ }

// v18: allow_transfers on users — kids can use transfer feature (default on)
try {
  db.exec(`ALTER TABLE users ADD COLUMN allow_transfers INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v19: require_currency_work on users — kids must use money popover to set transfer amounts
try {
  db.exec(`ALTER TABLE users ADD COLUMN require_currency_work INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

// v20: remember flag on refresh_tokens — session vs persistent cookies
try {
  db.exec(`ALTER TABLE refresh_tokens ADD COLUMN remember INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v21: chores_enabled on users — parents can opt in to having chores
try {
  db.exec(`ALTER TABLE users ADD COLUMN chores_enabled INTEGER NOT NULL DEFAULT 1`);
  db.exec(`UPDATE users SET chores_enabled = 0 WHERE role = 'parent'`);
} catch (_) { /* column already exists */ }

// v22: allow_login on users — kids can be created without login credentials
try {
  db.exec(`ALTER TABLE users ADD COLUMN allow_login INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v23: pending_deposits — deposits that kids with require_currency_work must "receive"
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_deposits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount_cents  INTEGER NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    type          TEXT    NOT NULL DEFAULT 'deposit',
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

// v24: allocations JSON on pending_deposits — sub-account splits kid must figure out
try {
  db.exec(`ALTER TABLE pending_deposits ADD COLUMN allocations TEXT DEFAULT NULL`);
} catch (_) { /* column already exists */ }

// v25: allocations JSON on recurring_rules — sub-account splits for pending deposits
try {
  db.exec(`ALTER TABLE recurring_rules ADD COLUMN allocations TEXT DEFAULT NULL`);
} catch (_) { /* column already exists */ }

// v26: allow_withdraws on users — kids can use withdraw feature (default on)
try {
  db.exec(`ALTER TABLE users ADD COLUMN allow_withdraws INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists */ }

// v27: common chore templates — family-level chores assignable to multiple kids
db.exec(`
  CREATE TABLE IF NOT EXISTS common_chore_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    ticket_reward INTEGER NOT NULL DEFAULT 1 CHECK (ticket_reward >= 0),
    days_of_week  INTEGER NOT NULL DEFAULT 127,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_common_chore_templates_family ON common_chore_templates(family_id)`);

// Junction: links a common chore to a per-kid chore_templates row
db.exec(`
  CREATE TABLE IF NOT EXISTS common_chore_assignments (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    common_chore_template_id  INTEGER NOT NULL REFERENCES common_chore_templates(id) ON DELETE CASCADE,
    user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chore_template_id         INTEGER NOT NULL REFERENCES chore_templates(id) ON DELETE CASCADE,
    UNIQUE(common_chore_template_id, user_id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_common_chore_assignments_common ON common_chore_assignments(common_chore_template_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_common_chore_assignments_user ON common_chore_assignments(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_common_chore_assignments_template ON common_chore_assignments(chore_template_id)`);

// v8: rename account type 'tithing' → 'charity'
// SQLite can't ALTER a CHECK constraint, so we recreate the accounts table.
const hasTithing = db.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE type = 'tithing'`).get().n;
if (hasTithing > 0) {
  db.pragma('foreign_keys = OFF');
  db.exec(`DROP TABLE IF EXISTS accounts_v8`);
  db.exec(`
    CREATE TABLE accounts_v8 (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      type          TEXT    NOT NULL CHECK (type IN ('main', 'savings', 'charity', 'custom')),
      balance_cents INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO accounts_v8
      SELECT id, user_id, name,
             CASE WHEN type = 'tithing' THEN 'charity' ELSE type END,
             balance_cents, is_active, sort_order, created_at
      FROM accounts;
    DROP TABLE accounts;
    ALTER TABLE accounts_v8 RENAME TO accounts;
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
  `);
  db.pragma('foreign_keys = ON');
}

export default db;
