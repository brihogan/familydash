/**
 * Idempotent migrations for the FamilyDash database.
 * Each migration uses try/catch or IF NOT EXISTS so it's safe to re-run.
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  // v1: sort_order on users
  try { db.exec(`ALTER TABLE users ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v2: show_on_dashboard — parents hidden by default
  try {
    db.exec(`ALTER TABLE users ADD COLUMN show_on_dashboard INTEGER NOT NULL DEFAULT 1`);
    db.exec(`UPDATE users SET show_on_dashboard = 0 WHERE role = 'parent'`);
  } catch (_) {}

  // v3: show_balance_on_dashboard
  try { db.exec(`ALTER TABLE users ADD COLUMN show_balance_on_dashboard INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v4: avatar_emoji
  try { db.exec(`ALTER TABLE users ADD COLUMN avatar_emoji TEXT`); } catch (_) {}

  // v5: amount_cents on activity_feed
  try { db.exec(`ALTER TABLE activity_feed ADD COLUMN amount_cents INTEGER`); } catch (_) {}

  // v6: days_of_week bitmask on chore_templates
  try { db.exec(`ALTER TABLE chore_templates ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127`); } catch (_) {}

  // v7: emoji on rewards
  try { db.exec(`ALTER TABLE rewards ADD COLUMN emoji TEXT`); } catch (_) {}

  // v8: rename account type 'tithing' → 'charity' (requires table recreate)
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

  // v9: tags on task_sets
  try { db.exec(`ALTER TABLE task_sets ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`); } catch (_) {}

  // v10: category on task_sets
  try { db.exec(`ALTER TABLE task_sets ADD COLUMN category TEXT NOT NULL DEFAULT ''`); } catch (_) {}

  // v11: ticket_reward on task_sets
  try { db.exec(`ALTER TABLE task_sets ADD COLUMN ticket_reward INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v12–v14: family-wide feature toggles
  try { db.exec(`ALTER TABLE families ADD COLUMN use_banking INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  try { db.exec(`ALTER TABLE families ADD COLUMN use_sets INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  try { db.exec(`ALTER TABLE families ADD COLUMN use_tickets INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v15: require_task_approval on users
  try { db.exec(`ALTER TABLE users ADD COLUMN require_task_approval INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v16: approval_status on chore_logs
  try { db.exec(`ALTER TABLE chore_logs ADD COLUMN approval_status TEXT DEFAULT NULL`); } catch (_) {}

  // v17: approval_status on task_step_completions
  try { db.exec(`ALTER TABLE task_step_completions ADD COLUMN approval_status TEXT DEFAULT NULL`); } catch (_) {}

  // v18: allow_transfers on users
  try { db.exec(`ALTER TABLE users ADD COLUMN allow_transfers INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v19: require_currency_work on users
  try { db.exec(`ALTER TABLE users ADD COLUMN require_currency_work INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v20: remember flag on refresh_tokens
  try { db.exec(`ALTER TABLE refresh_tokens ADD COLUMN remember INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v21: chores_enabled on users — parents opt-in
  try {
    db.exec(`ALTER TABLE users ADD COLUMN chores_enabled INTEGER NOT NULL DEFAULT 1`);
    db.exec(`UPDATE users SET chores_enabled = 0 WHERE role = 'parent'`);
  } catch (_) {}

  // v22: allow_login on users
  try { db.exec(`ALTER TABLE users ADD COLUMN allow_login INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v23: pending_deposits table
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

  // v24: allocations on pending_deposits
  try { db.exec(`ALTER TABLE pending_deposits ADD COLUMN allocations TEXT DEFAULT NULL`); } catch (_) {}

  // v25: allocations on recurring_rules
  try { db.exec(`ALTER TABLE recurring_rules ADD COLUMN allocations TEXT DEFAULT NULL`); } catch (_) {}

  // v26: allow_withdraws on users
  try { db.exec(`ALTER TABLE users ADD COLUMN allow_withdraws INTEGER NOT NULL DEFAULT 1`); } catch (_) {}

  // v27: common chore templates + assignments
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

  // v28: add 'Countdown' to task_sets.type CHECK (requires table recreate)
  const taskSetsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_sets'").get()?.sql || '';
  if (!taskSetsSql.includes('Countdown')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE task_sets_v28 (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        name          TEXT    NOT NULL,
        type          TEXT    NOT NULL DEFAULT 'Project' CHECK (type IN ('Award', 'Project', 'Countdown')),
        emoji         TEXT,
        description   TEXT    NOT NULL DEFAULT '',
        tags          TEXT    NOT NULL DEFAULT '[]',
        category      TEXT    NOT NULL DEFAULT '',
        ticket_reward INTEGER NOT NULL DEFAULT 0 CHECK (ticket_reward >= 0),
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO task_sets_v28 (id, family_id, name, type, emoji, description, tags, category, ticket_reward, is_active, created_at)
        SELECT id, family_id, name, type, emoji, description, tags, category, ticket_reward, is_active, created_at FROM task_sets;
      DROP TABLE task_sets;
      ALTER TABLE task_sets_v28 RENAME TO task_sets;
      CREATE INDEX IF NOT EXISTS idx_task_sets_family ON task_sets(family_id);
    `);
    db.pragma('foreign_keys = ON');
  }

  // v29: repeat_count + limit_one_per_day on task_steps
  try { db.exec(`ALTER TABLE task_steps ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  try { db.exec(`ALTER TABLE task_steps ADD COLUMN limit_one_per_day INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v30: instance column on task_step_completions (requires table recreate)
  const tscSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_step_completions'").get()?.sql || '';
  if (!tscSql.includes('instance')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE task_step_completions_v30 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        task_step_id    INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
        task_set_id     INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        instance        INTEGER NOT NULL DEFAULT 1,
        completed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        approval_status TEXT    DEFAULT NULL,
        UNIQUE(task_step_id, user_id, instance)
      );
      INSERT INTO task_step_completions_v30 (id, task_step_id, task_set_id, user_id, instance, completed_at, approval_status)
        SELECT id, task_step_id, task_set_id, user_id, 1, completed_at, approval_status
        FROM task_step_completions;
      DROP TABLE task_step_completions;
      ALTER TABLE task_step_completions_v30 RENAME TO task_step_completions;
      CREATE INDEX IF NOT EXISTS idx_task_step_completions_user ON task_step_completions(user_id, task_set_id);
    `);
    db.pragma('foreign_keys = ON');
  }

  // v31: require_input + input_prompt on task_steps, input_response on completions
  try { db.exec(`ALTER TABLE task_steps ADD COLUMN require_input INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE task_steps ADD COLUMN input_prompt TEXT NOT NULL DEFAULT ''`); } catch (_) {}
  try { db.exec(`ALTER TABLE task_step_completions ADD COLUMN input_response TEXT DEFAULT NULL`); } catch (_) {}

  // v32: display_mode on task_sets
  try { db.exec(`ALTER TABLE task_sets ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'list'`); } catch (_) {}

  // v33: image on task_steps
  try { db.exec(`ALTER TABLE task_steps ADD COLUMN image TEXT DEFAULT NULL`); } catch (_) {}

  // v34: require_set_approval on users (text: 'none', 'step', 'set')
  try {
    db.exec(`ALTER TABLE users ADD COLUMN require_set_approval TEXT NOT NULL DEFAULT 'none'`);
  } catch (_) {
    const sample = db.prepare("SELECT typeof(require_set_approval) AS t FROM users LIMIT 1").get();
    if (sample && sample.t === 'integer') {
      db.exec(`UPDATE users SET require_set_approval = 'none' WHERE require_set_approval = 0 OR require_set_approval = ''`);
    }
  }

  // v35: completion_status on task_assignments
  try { db.exec(`ALTER TABLE task_assignments ADD COLUMN completion_status TEXT DEFAULT NULL`); } catch (_) {}

  // v36: bypass_currency_work on recurring_rules
  try { db.exec(`ALTER TABLE recurring_rules ADD COLUMN bypass_currency_work INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v37: trmnl_webhook_url on families
  try { db.exec(`ALTER TABLE families ADD COLUMN trmnl_webhook_url TEXT DEFAULT NULL`); } catch (_) {}

  // v38: is_admin on users (site-wide admin, not family role)
  try { db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v39: login_logs table for tracking login activity
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_login_logs_family ON login_logs(family_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at)`);

  // v40: turns — named turn-tracking lists
  db.exec(`
    CREATE TABLE IF NOT EXISTS turns (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      filter     TEXT    NOT NULL DEFAULT 'all',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turns_family ON turns(family_id)`);

  // v41: turn_members — ordered participants in a turn
  db.exec(`
    CREATE TABLE IF NOT EXISTS turn_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id    INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL DEFAULT 0,
      is_current INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_members_turn ON turn_members(turn_id)`);

  // v42: excluded flag on turn_members
  try { db.exec(`ALTER TABLE turn_members ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v43: visibility on turns — who sees it on their dashboard
  try { db.exec(`ALTER TABLE turns ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone'`); } catch (_) {}

  // v45: claude_enabled on users (off by default)
  try { db.exec(`ALTER TABLE users ADD COLUMN claude_enabled INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v48: claude_time_limit in minutes (default 60)
  try { db.exec(`ALTER TABLE users ADD COLUMN claude_time_limit INTEGER NOT NULL DEFAULT 60`); } catch (_) {}

  // v49: daily usage tracking for Claude Code time limits
  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_daily_usage (
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date      TEXT    NOT NULL,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )
  `);

  // v51: family-level Claude Code access gate
  try { db.exec(`ALTER TABLE families ADD COLUMN claude_access INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // v50: key-value storage for kid apps
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_storage (
      owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app_name  TEXT    NOT NULL,
      key       TEXT    NOT NULL,
      value     TEXT    NOT NULL DEFAULT '{}',
      updated_at TEXT   NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (owner_id, app_name, key)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_app_storage_app ON app_storage(owner_id, app_name)`);

  // v46: app_metadata for kid-built apps
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app_name    TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      icon        TEXT,
      launches    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, app_name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_app_metadata_user ON app_metadata(user_id)`);

  // v47: app_stars — users can star/favorite apps
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_stars (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app_name    TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, app_owner_id, app_name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_app_stars_user ON app_stars(user_id)`);

  // v44: turn_logs — history of completed turns
  db.exec(`
    CREATE TABLE IF NOT EXISTS turn_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id    INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_logs_turn ON turn_logs(turn_id)`);
}
