import db from '../db/db.js';

const getDueRulesStmt = db.prepare(`
  SELECT rr.*, a.user_id AS account_user_id
  FROM recurring_rules rr
  JOIN accounts a ON a.id = rr.account_id
  JOIN users u ON u.id = a.user_id
  WHERE u.family_id = ?
    AND rr.is_active = 1
    AND rr.day_of_week = CAST(strftime('%w', 'now', 'localtime') AS INTEGER)
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

const runDepositRule = db.transaction((rule) => {
  const kid = getKidCurrencyWorkStmt.get(rule.account_id);
  const user = getUserByAccountStmt.get(rule.account_id);

  if (kid && kid.role === 'kid' && kid.require_currency_work) {
    // Create pending deposit instead of crediting immediately
    const pd = db.prepare(`
      INSERT INTO pending_deposits (account_id, amount_cents, description, type, created_by_user_id, allocations)
      VALUES (?, ?, ?, 'allowance', ?, ?)
    `).run(rule.account_id, rule.amount_cents, rule.description || 'Recurring deposit', rule.account_user_id, rule.allocations || null);

    db.prepare(`
      INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents)
      VALUES (?, ?, ?, 'allowance', ?, ?, 'pending_deposit', ?)
    `).run(user.family_id, user.id, user.id, (rule.description || 'Recurring allowance') + ' (awaiting receipt)', pd.lastInsertRowid, rule.amount_cents);
  } else {
    db.prepare(`
      UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?
    `).run(rule.amount_cents, rule.account_id);

    const txInfo = db.prepare(`
      INSERT INTO transactions (account_id, amount_cents, type, description, created_by_user_id)
      VALUES (?, ?, 'allowance', ?, ?)
    `).run(rule.account_id, rule.amount_cents, rule.description || 'Recurring deposit', rule.account_user_id);

    db.prepare(`
      INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents)
      VALUES (?, ?, ?, 'allowance', ?, ?, 'transaction', ?)
    `).run(user.family_id, user.id, user.id, rule.description || 'Recurring allowance', txInfo.lastInsertRowid, rule.amount_cents);
  }

  db.prepare(`
    UPDATE recurring_rules SET last_run_date = datetime('now', 'localtime') WHERE id = ?
  `).run(rule.id);
});

const runTransferRule = db.transaction((rule) => {
  if (!rule.to_account_id) return;

  db.prepare(`
    UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?
  `).run(rule.amount_cents, rule.account_id);
  db.prepare(`
    UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?
  `).run(rule.amount_cents, rule.to_account_id);

  const outTx = db.prepare(`
    INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
    VALUES (?, ?, 'transfer_out', ?, ?, ?)
  `).run(rule.account_id, -rule.amount_cents, rule.description || 'Recurring transfer', rule.to_account_id, rule.account_user_id);

  const inTx = db.prepare(`
    INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
    VALUES (?, ?, 'transfer_in', ?, ?, ?)
  `).run(rule.to_account_id, rule.amount_cents, rule.description || 'Recurring transfer', rule.account_id, rule.account_user_id);

  const srcUser = getUserByAccountStmt.get(rule.account_id);
  db.prepare(`
    INSERT INTO activity_feed (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents)
    VALUES (?, ?, ?, 'transfer_out', ?, ?, 'transaction', ?)
  `).run(srcUser.family_id, srcUser.id, srcUser.id, rule.description || 'Recurring transfer', outTx.lastInsertRowid, -rule.amount_cents);

  db.prepare(`
    UPDATE recurring_rules SET last_run_date = datetime('now', 'localtime') WHERE id = ?
  `).run(rule.id);
});

/**
 * Run all due recurring rules for a family. Safe to call on every page load.
 * @param {number} familyId
 */
export function processRecurringRules(familyId) {
  const dueRules = getDueRulesStmt.all(familyId);
  for (const rule of dueRules) {
    try {
      if (rule.type === 'deposit') {
        runDepositRule(rule);
      } else if (rule.type === 'transfer') {
        runTransferRule(rule);
      }
    } catch (err) {
      console.error(`Failed to process recurring rule ${rule.id}:`, err.message);
    }
  }
}
