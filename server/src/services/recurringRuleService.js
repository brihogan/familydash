import db from '../db/db.js';

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Given a rule's day_of_week and last_run_date, return an array of all missed
 * dates (as 'YYYY-MM-DD') up to and including today, in chronological order.
 */
function getMissedDates(rule) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = localDateISO(today);

  // Start scanning from the day after last_run_date, or rule created_at date
  let cursor;
  if (rule.last_run_date) {
    const parts = rule.last_run_date.split(/[- T]/);
    cursor = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    cursor.setDate(cursor.getDate() + 1);
  } else if (rule.created_at) {
    const parts = rule.created_at.split(/[- T]/);
    cursor = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  } else {
    cursor = new Date(today);
  }
  cursor.setHours(0, 0, 0, 0);

  const dates = [];
  while (cursor <= today) {
    if (cursor.getDay() === rule.day_of_week) {
      dates.push(localDateISO(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ── Prepared statements ────────────────────────────────────────────────────────

const getOverdueRulesStmt = db.prepare(`
  SELECT rr.*, a.user_id AS account_user_id
  FROM recurring_rules rr
  JOIN accounts a ON a.id = rr.account_id
  JOIN users u ON u.id = a.user_id
  WHERE u.family_id = ?
    AND rr.is_active = 1
    AND (rr.last_run_date IS NULL OR date(rr.last_run_date) < date('now', 'localtime'))
`);

const getUserByAccountStmt = db.prepare(`
  SELECT u.id, u.family_id, u.name FROM users u
  JOIN accounts a ON a.user_id = u.id
  WHERE a.id = ?
`);

const getKidCurrencyWorkStmt = db.prepare(`
  SELECT u.require_currency_work, u.role FROM users u
  JOIN accounts a ON a.user_id = u.id
  WHERE a.id = ?
`);

// ── Run a single deposit for a specific date ───────────────────────────────────

const runDepositForDate = db.transaction((rule, dateStr) => {
  const kid = getKidCurrencyWorkStmt.get(rule.account_id);
  const user = getUserByAccountStmt.get(rule.account_id);
  const timestamp = `${dateStr} 00:00:00`;

  if (kid && kid.role === 'kid' && kid.require_currency_work && !rule.bypass_currency_work) {
    const pd = db.prepare(`
      INSERT INTO pending_deposits (account_id, amount_cents, description, type, created_by_user_id, allocations, created_at)
      VALUES (?, ?, ?, 'allowance', ?, ?, ?)
    `).run(rule.account_id, rule.amount_cents, rule.description || 'Recurring deposit', rule.account_user_id, rule.allocations || null, timestamp);

    db.prepare(`
      INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents, created_at)
      VALUES (?, ?, ?, 'allowance', ?, ?, 'pending_deposit', ?, ?)
    `).run(user.family_id, user.id, user.id, (rule.description || 'Recurring allowance') + ' (awaiting receipt)', pd.lastInsertRowid, rule.amount_cents, timestamp);
  } else {
    db.prepare(`
      UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?
    `).run(rule.amount_cents, rule.account_id);

    const txInfo = db.prepare(`
      INSERT INTO transactions (account_id, amount_cents, type, description, created_by_user_id, created_at)
      VALUES (?, ?, 'allowance', ?, ?, ?)
    `).run(rule.account_id, rule.amount_cents, rule.description || 'Recurring deposit', rule.account_user_id, timestamp);

    db.prepare(`
      INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents, created_at)
      VALUES (?, ?, ?, 'allowance', ?, ?, 'transaction', ?, ?)
    `).run(user.family_id, user.id, user.id, rule.description || 'Recurring allowance', txInfo.lastInsertRowid, rule.amount_cents, timestamp);
  }

  db.prepare(`
    UPDATE recurring_rules SET last_run_date = ? WHERE id = ?
  `).run(timestamp, rule.id);
});

// ── Run a single transfer for a specific date ──────────────────────────────────

const runTransferForDate = db.transaction((rule, dateStr) => {
  if (!rule.to_account_id) return;
  const timestamp = `${dateStr} 00:00:00`;

  db.prepare(`
    UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?
  `).run(rule.amount_cents, rule.account_id);
  db.prepare(`
    UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?
  `).run(rule.amount_cents, rule.to_account_id);

  const outTx = db.prepare(`
    INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id, created_at)
    VALUES (?, ?, 'transfer_out', ?, ?, ?, ?)
  `).run(rule.account_id, -rule.amount_cents, rule.description || 'Recurring transfer', rule.to_account_id, rule.account_user_id, timestamp);

  const inTx = db.prepare(`
    INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id, created_at)
    VALUES (?, ?, 'transfer_in', ?, ?, ?, ?)
  `).run(rule.to_account_id, rule.amount_cents, rule.description || 'Recurring transfer', rule.account_id, rule.account_user_id, timestamp);

  const srcUser = getUserByAccountStmt.get(rule.account_id);
  db.prepare(`
    INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents, created_at)
    VALUES (?, ?, ?, 'transfer_out', ?, ?, 'transaction', ?, ?)
  `).run(srcUser.family_id, srcUser.id, srcUser.id, rule.description || 'Recurring transfer', outTx.lastInsertRowid, -rule.amount_cents, timestamp);

  db.prepare(`
    UPDATE recurring_rules SET last_run_date = ? WHERE id = ?
  `).run(timestamp, rule.id);
});

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run all due/overdue recurring rules for a family. Safe to call on every page load.
 * Catches up any missed weeks — each missed occurrence gets its own transaction
 * backdated to midnight of the day it was supposed to fire.
 */
export function processRecurringRules(familyId) {
  const rules = getOverdueRulesStmt.all(familyId);
  for (const rule of rules) {
    const missedDates = getMissedDates(rule);
    for (const dateStr of missedDates) {
      try {
        if (rule.type === 'deposit') {
          runDepositForDate(rule, dateStr);
        } else if (rule.type === 'transfer') {
          runTransferForDate(rule, dateStr);
        }
      } catch (err) {
        console.error(`Failed to process recurring rule ${rule.id} for ${dateStr}:`, err.message);
      }
    }
  }
}
