PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS families (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  use_banking INTEGER NOT NULL DEFAULT 1,
  use_sets    INTEGER NOT NULL DEFAULT 1,
  use_tickets INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id      INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  username       TEXT    UNIQUE,
  email          TEXT    UNIQUE,
  password_hash  TEXT,
  pin_hash       TEXT,
  role           TEXT    NOT NULL CHECK (role IN ('parent', 'kid')),
  avatar_color   TEXT    NOT NULL DEFAULT '#6366f1',
  ticket_balance INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_family   ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email)    WHERE email    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('main', 'savings', 'charity', 'custom')),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id         INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount_cents       INTEGER NOT NULL,
  type               TEXT    NOT NULL CHECK (type IN (
                       'deposit', 'withdraw', 'transfer_in', 'transfer_out',
                       'allowance', 'manual_adjustment'
                     )),
  description        TEXT    NOT NULL DEFAULT '',
  linked_account_id  INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_account    ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('deposit', 'transfer')),
  description   TEXT    NOT NULL DEFAULT '',
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_run_date TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_account ON recurring_rules(account_id);

CREATE TABLE IF NOT EXISTS ticket_ledger (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  type           TEXT    NOT NULL CHECK (type IN ('chore_reward', 'redemption', 'manual')),
  description    TEXT    NOT NULL DEFAULT '',
  reference_id   INTEGER,
  reference_type TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_ledger_user ON ticket_ledger(user_id);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  ticket_cost INTEGER NOT NULL CHECK (ticket_cost > 0),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rewards_family ON rewards(family_id);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id           INTEGER NOT NULL REFERENCES rewards(id),
  reward_name_at_time TEXT    NOT NULL,
  ticket_cost_at_time INTEGER NOT NULL,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user   ON reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward ON reward_redemptions(reward_id);

CREATE TABLE IF NOT EXISTS chore_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  ticket_reward INTEGER NOT NULL DEFAULT 1 CHECK (ticket_reward >= 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chore_templates_user ON chore_templates(user_id);

CREATE TABLE IF NOT EXISTS chore_logs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_template_id     INTEGER NOT NULL REFERENCES chore_templates(id) ON DELETE CASCADE,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date              TEXT    NOT NULL,
  completed_at          TEXT,
  ticket_reward_at_time INTEGER NOT NULL,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chore_template_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_chore_logs_user_date ON chore_logs(user_id, log_date);

CREATE TABLE IF NOT EXISTS activity_feed (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id   INTEGER NOT NULL REFERENCES users(id),
  event_type      TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  reference_id    INTEGER,
  reference_type  TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_family  ON activity_feed(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_subject ON activity_feed(subject_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  type          TEXT    NOT NULL DEFAULT 'Project' CHECK (type IN ('One-Off', 'Project', 'Countdown')),
  emoji         TEXT,
  description   TEXT    NOT NULL DEFAULT '',
  tags          TEXT    NOT NULL DEFAULT '[]',
  category      TEXT    NOT NULL DEFAULT '',
  ticket_reward INTEGER NOT NULL DEFAULT 0 CHECK (ticket_reward >= 0),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_sets_family ON task_sets(family_id);

CREATE TABLE IF NOT EXISTS task_steps (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  task_set_id       INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  description       TEXT    NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  repeat_count      INTEGER NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
  limit_one_per_day INTEGER NOT NULL DEFAULT 0,
  require_input     INTEGER NOT NULL DEFAULT 0,
  input_prompt      TEXT    NOT NULL DEFAULT '',
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_steps_set ON task_steps(task_set_id);

CREATE TABLE IF NOT EXISTS task_assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_set_id INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT    NOT NULL DEFAULT (datetime('now')),
  is_active   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(task_set_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignments_set  ON task_assignments(task_set_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id);

CREATE TABLE IF NOT EXISTS task_step_completions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_step_id    INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
  task_set_id     INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance        INTEGER NOT NULL DEFAULT 1,
  input_response  TEXT    DEFAULT NULL,
  completed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  approval_status TEXT    DEFAULT NULL,
  UNIQUE(task_step_id, user_id, instance)
);
CREATE INDEX IF NOT EXISTS idx_task_step_completions_user ON task_step_completions(user_id, task_set_id);

-- Per-(user, step) working notes: a persistent "general notes" scratchpad plus
-- a draft answer, both saved on blur, independent of completion.
CREATE TABLE IF NOT EXISTS user_step_notes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_set_id    INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  task_step_id   INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
  general_notes  TEXT NOT NULL DEFAULT '',
  response_draft TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, task_step_id)
);
CREATE INDEX IF NOT EXISTS idx_user_step_notes_set ON user_step_notes(user_id, task_set_id);

-- Per-(user, task_set) manual step order. Each kid can arrange their badge/award
-- steps; `position` is an absolute ordering across the set. No rows = default
-- order (task_steps.sort_order). The order follows the user across devices and
-- is what a parent sees when viewing that kid's badge.
CREATE TABLE IF NOT EXISTS user_task_step_order (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_set_id  INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  task_step_id INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_set_id, task_step_id)
);
CREATE INDEX IF NOT EXISTS idx_user_task_step_order_set ON user_task_step_order(user_id, task_set_id);

-- Per-step subtasks: a parent-managed checklist shared across everyone who has
-- the step (matched by group_key); only the checked-off state is per-user.
CREATE TABLE IF NOT EXISTS step_subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_key  TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_step_subtasks_group ON step_subtasks(group_key);
CREATE TABLE IF NOT EXISTS step_subtask_completions (
  subtask_id   INTEGER NOT NULL REFERENCES step_subtasks(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subtask_id, user_id)
);

-- Per-family pins for the Shared progress view (kind 'badge'→badge_id / 'set'→task_set_id).
CREATE TABLE IF NOT EXISTS shared_task_set_pins (
  family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  ref_id     INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (family_id, kind, ref_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  slug             TEXT    NOT NULL UNIQUE,
  category         TEXT    NOT NULL DEFAULT '',
  author           TEXT    NOT NULL DEFAULT '',
  image_file       TEXT,
  is_specific      INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  source_url       TEXT,
  level_opt_counts TEXT    NOT NULL DEFAULT '{}',
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_badges_category ON badges(category);
CREATE INDEX IF NOT EXISTS idx_badges_slug     ON badges(slug);

CREATE TABLE IF NOT EXISTS badge_level_requirements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  badge_id   INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  level      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL,
  text       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blr_badge ON badge_level_requirements(badge_id, level);

CREATE TABLE IF NOT EXISTS badge_optional_requirements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  badge_id   INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  req_number INTEGER NOT NULL,
  text       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bor_badge ON badge_optional_requirements(badge_id);
