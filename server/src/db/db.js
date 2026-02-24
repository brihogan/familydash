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
