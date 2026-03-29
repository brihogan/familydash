import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';
import { insertActivity } from '../services/activityService.js';
import { processRecurringRules } from '../services/recurringRuleService.js';
import { assertSameFamily, assertAccountOwner } from '../utils/assertions.js';

const router = Router();

// ─── GET /api/users/:id/accounts ──────────────────────────────────────────

router.get('/:id/accounts', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const target = assertSameFamily(userId, req.user.familyId);
    processRecurringRules(req.user.familyId);

    const accounts = db.prepare(`
      SELECT id, user_id, name, type, balance_cents, sort_order, created_at
      FROM accounts WHERE user_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(userId);
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/accounts ─────────────────────────────────────────

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['savings', 'charity', 'custom']),
});

router.post('/:id/accounts', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const body = CreateAccountSchema.parse(req.body);

    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM accounts WHERE user_id = ?').get(userId).m;
    const result = db.prepare(`
      INSERT INTO accounts (user_id, name, type, sort_order) VALUES (?, ?, ?, ?)
    `).run(userId, body.name, body.type, maxOrder + 1);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/users/:id/accounts/:aid ───────────────────────────────────

const PatchAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['main', 'savings', 'charity', 'custom']).optional(),
  sort_order: z.number().int().optional(),
}).strict();

router.patch('/:id/accounts/:aid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const accountId = parseInt(req.params.aid, 10);
    assertSameFamily(userId, req.user.familyId);
    assertAccountOwner(accountId, userId);

    const body = PatchAccountSchema.parse(req.body);
    const updates = []; const values = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(accountId);
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    res.json(account);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/users/:id/accounts/:aid/balance-history ─────────────────────

router.get('/:id/accounts/:aid/balance-history', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const accountId = parseInt(req.params.aid, 10);
    assertSameFamily(userId, req.user.familyId);
    assertAccountOwner(accountId, userId);

    const numDays = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

    // Current balance
    const account = db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    // Net change per day for the last N days
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() - numDays + 1);
    const fromISO = fromDate.toISOString().replace('T', ' ').slice(0, 19);

    const dailyNets = db.prepare(`
      SELECT date(created_at) AS day, SUM(amount_cents) AS net
      FROM transactions
      WHERE account_id = ? AND created_at >= ?
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all(accountId, fromISO);

    const netByDay = {};
    for (const row of dailyNets) netByDay[row.day] = row.net;

    // Walk backwards from current balance to compute end-of-day balances
    const days = [];
    let balance = account.balance_cents;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build array from today back to fromDate, then reverse
    for (let i = 0; i < numDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, balance_cents: balance });
      // Subtract this day's net to get the previous day's closing balance
      if (netByDay[key]) balance -= netByDay[key];
    }

    days.reverse();
    res.json({ days });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/users/:id/accounts/:aid/transactions ────────────────────────

router.get('/:id/accounts/:aid/transactions', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const accountId = parseInt(req.params.aid, 10);
    assertSameFamily(userId, req.user.familyId);
    assertAccountOwner(accountId, userId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const conditions = ['t.account_id = ?'];
    const bindings = [accountId];
    if (req.query.from) { conditions.push('t.created_at >= ?'); bindings.push(req.query.from); }
    if (req.query.to)   { conditions.push('t.created_at <= ?'); bindings.push(req.query.to); }
    const where = conditions.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM transactions t WHERE ${where}`).get(...bindings).cnt;
    const rows = db.prepare(`
      SELECT t.*,
             u.name  AS created_by_name,
             la.name AS linked_account_name,
             lu.name AS linked_account_owner_name,
             lu.id   AS linked_account_owner_id
      FROM transactions t
      JOIN users u ON u.id = t.created_by_user_id
      LEFT JOIN accounts la ON la.id = t.linked_account_id
      LEFT JOIN users lu ON lu.id = la.user_id
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, limit, offset);

    res.json({ transactions: rows, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/accounts/:aid/transactions ───────────────────────

const AllocationSchema = z.object({
  account_id: z.number().int(),
  account_name: z.string(),
  type: z.enum(['percent', 'flat']),
  value: z.number().positive(),
});

const TransactionSchema = z.object({
  type: z.enum(['deposit', 'withdraw', 'transfer_out', 'allowance', 'manual_adjustment']),
  amount_cents: z.number().int().positive(),
  description: z.string().default(''),
  to_account_id: z.number().int().optional(), // required for transfer_out
  allocations: z.array(AllocationSchema).optional(), // sub-account splits for pending deposits
  bypass_currency_work: z.boolean().optional(), // skip pending deposit for currency-work kids
});

router.post('/:id/accounts/:aid/transactions', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const accountId = parseInt(req.params.aid, 10);
    const targetUser = assertSameFamily(userId, req.user.familyId);
    const account = assertAccountOwner(accountId, userId);
    const body = TransactionSchema.parse(req.body);

    // Role-based type enforcement
    if (req.user.role === 'kid') {
      if (!['withdraw', 'transfer_out'].includes(body.type)) {
        return res.status(403).json({ error: 'Kids can only withdraw or transfer.' });
      }
      if (body.type === 'withdraw' && !body.description?.trim()) {
        return res.status(400).json({ error: 'Description required for withdrawals.' });
      }
    }

    if (body.type === 'transfer_out') {
      if (!body.to_account_id) return res.status(400).json({ error: 'to_account_id required for transfers.' });

      // Verify destination account exists and belongs to same family
      const destAccount = db.prepare(`
        SELECT a.*, u.name AS owner_name FROM accounts a
        JOIN users u ON u.id = a.user_id
        WHERE a.id = ? AND u.family_id = ? AND a.is_active = 1
      `).get(body.to_account_id, req.user.familyId);
      if (!destAccount) return res.status(404).json({ error: 'Destination account not found.' });
      if (destAccount.id === accountId) return res.status(400).json({ error: 'Cannot transfer to the same account.' });

      if (account.balance_cents < body.amount_cents) {
        return res.status(400).json({ error: 'Insufficient balance.' });
      }

      const senderName = db.prepare('SELECT name FROM users WHERE id = ?').get(userId).name;
      const amountStr = `$${(body.amount_cents / 100).toFixed(2)}`;
      const noteStr = body.description ? ': ' + body.description : '';

      const transferTx = db.transaction(() => {
        db.prepare('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?').run(body.amount_cents, accountId);
        db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(body.amount_cents, body.to_account_id);

        const outTx = db.prepare(`
          INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
          VALUES (?, ?, 'transfer_out', ?, ?, ?)
        `).run(accountId, -body.amount_cents, body.description, body.to_account_id, req.user.userId);

        const inTx = db.prepare(`
          INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
          VALUES (?, ?, 'transfer_in', ?, ?, ?)
        `).run(body.to_account_id, body.amount_cents, body.description, accountId, req.user.userId);

        insertActivity({
          familyId: req.user.familyId,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'transfer_out',
          description: `Transferred ${amountStr} to ${destAccount.owner_name}'s ${destAccount.name}${noteStr}`,
          referenceId: outTx.lastInsertRowid,
          referenceType: 'transaction',
          amountCents: -body.amount_cents,
        });

        insertActivity({
          familyId: req.user.familyId,
          subjectUserId: destAccount.user_id,
          actorUserId: req.user.userId,
          eventType: 'transfer_in',
          description: `Received ${amountStr} from ${senderName}'s ${account.name}${noteStr}`,
          referenceId: inTx.lastInsertRowid,
          referenceType: 'transaction',
          amountCents: body.amount_cents,
        });

        return outTx.lastInsertRowid;
      });

      const txId = transferTx();
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      return res.status(201).json(tx);
    }

    // Non-transfer transactions
    const isCredit = ['deposit', 'allowance', 'manual_adjustment'].includes(body.type);
    const amountSigned = isCredit ? body.amount_cents : -body.amount_cents;

    if (!isCredit && account.balance_cents < body.amount_cents) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    // If this is a credit to a kid with require_currency_work, create a pending deposit (unless bypassed)
    if (isCredit && targetUser && !body.bypass_currency_work) {
      const kid = db.prepare('SELECT require_currency_work, role FROM users WHERE id = ?').get(userId);
      if (kid && kid.role === 'kid' && kid.require_currency_work) {
        const allocJson = body.allocations?.length ? JSON.stringify(body.allocations) : null;
        const pd = db.prepare(`
          INSERT INTO pending_deposits (account_id, amount_cents, description, type, created_by_user_id, allocations)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(accountId, body.amount_cents, body.description || '', body.type, req.user.userId, allocJson);

        insertActivity({
          familyId: req.user.familyId,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: body.type === 'allowance' ? 'allowance' : 'deposit',
          description: `Pending ${body.type} $${(body.amount_cents / 100).toFixed(2)}${body.description ? ': ' + body.description : ''} (awaiting receipt)`,
          referenceId: pd.lastInsertRowid,
          referenceType: 'pending_deposit',
          amountCents: body.amount_cents,
        });

        return res.status(201).json({ pending: true, id: pd.lastInsertRowid, amount_cents: body.amount_cents });
      }
    }

    const singleTx = db.transaction(() => {
      db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(amountSigned, accountId);

      const tx = db.prepare(`
        INSERT INTO transactions (account_id, amount_cents, type, description, created_by_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(accountId, amountSigned, body.type, body.description, req.user.userId);

      const eventType = body.type === 'deposit' ? 'deposit'
        : body.type === 'withdraw' ? 'withdrawal'
        : body.type === 'allowance' ? 'allowance'
        : 'deposit';

      insertActivity({
        familyId: req.user.familyId,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType,
        description: `${body.type.charAt(0).toUpperCase() + body.type.slice(1)} $${(body.amount_cents / 100).toFixed(2)}${body.description ? ': ' + body.description : ''}`,
        referenceId: tx.lastInsertRowid,
        referenceType: 'transaction',
        amountCents: amountSigned,
      });

      return tx.lastInsertRowid;
    });

    const txId = singleTx();
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
});

// ─── Recurring Rules ───────────────────────────────────────────────────────

router.get('/:id/recurring', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const rules = db.prepare(`
      SELECT rr.*, a.name AS account_name, ta.name AS to_account_name
      FROM recurring_rules rr
      JOIN accounts a ON a.id = rr.account_id
      LEFT JOIN accounts ta ON ta.id = rr.to_account_id
      WHERE a.user_id = ? AND rr.is_active = 1
    `).all(userId);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

const RecurringRuleSchema = z.object({
  account_id: z.number().int(),
  amount_cents: z.number().int().positive(),
  type: z.enum(['deposit', 'transfer']),
  description: z.string().default(''),
  day_of_week: z.number().int().min(0).max(6),
  to_account_id: z.number().int().optional().nullable(),
  allocations: z.array(AllocationSchema).optional(),
  bypass_currency_work: z.boolean().optional(),
});

router.post('/:id/recurring', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const body = RecurringRuleSchema.parse(req.body);
    assertAccountOwner(body.account_id, userId);
    if (body.type === 'transfer' && !body.to_account_id) {
      return res.status(400).json({ error: 'to_account_id required for transfer rules.' });
    }
    const allocJson = body.allocations?.length ? JSON.stringify(body.allocations) : null;
    const result = db.prepare(`
      INSERT INTO recurring_rules (account_id, amount_cents, type, description, day_of_week, to_account_id, allocations, bypass_currency_work)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(body.account_id, body.amount_cents, body.type, body.description, body.day_of_week, body.to_account_id ?? null, allocJson, body.bypass_currency_work ? 1 : 0);
    const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/recurring/:rid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const ruleId = parseInt(req.params.rid, 10);
    assertSameFamily(userId, req.user.familyId);
    const rule = db.prepare(`
      SELECT rr.* FROM recurring_rules rr
      JOIN accounts a ON a.id = rr.account_id
      WHERE rr.id = ? AND a.user_id = ?
    `).get(ruleId, userId);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });

    const body = RecurringRuleSchema.partial().parse(req.body);
    const updates = []; const values = [];
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) {
        updates.push(`${k} = ?`);
        values.push(k === 'bypass_currency_work' ? (v ? 1 : 0) : (v ?? null));
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(ruleId);
    db.prepare(`UPDATE recurring_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(ruleId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/recurring/:rid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const ruleId = parseInt(req.params.rid, 10);
    assertSameFamily(userId, req.user.familyId);
    const result = db.prepare(`
      UPDATE recurring_rules SET is_active = 0
      WHERE id = ? AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)
    `).run(ruleId, userId);
    if (!result.changes) return res.status(404).json({ error: 'Rule not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Pending Deposits ─────────────────────────────────────────────────────────

// List pending deposits for a user
router.get('/:id/pending-deposits', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const rows = db.prepare(`
      SELECT pd.*, a.name AS account_name
      FROM pending_deposits pd
      JOIN accounts a ON a.id = pd.account_id
      WHERE a.user_id = ?
      ORDER BY pd.created_at DESC
    `).all(userId);
    res.json({ pending_deposits: rows });
  } catch (err) {
    next(err);
  }
});

// Claim (receive) a pending deposit — kid must provide the exact amount
const ClaimSchema = z.object({
  amount_cents: z.number().int().positive(),
  allocations: z.array(z.object({
    account_id: z.number().int(),
    amount_cents: z.number().int().nonnegative(),
  })).optional(),
});

router.post('/:id/pending-deposits/:pdid/claim', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const pdId = parseInt(req.params.pdid, 10);
    assertSameFamily(userId, req.user.familyId);

    const pd = db.prepare(`
      SELECT pd.* FROM pending_deposits pd
      JOIN accounts a ON a.id = pd.account_id
      WHERE pd.id = ? AND a.user_id = ?
    `).get(pdId, userId);
    if (!pd) return res.status(404).json({ error: 'Pending deposit not found.' });

    const body = ClaimSchema.parse(req.body);
    if (body.amount_cents !== pd.amount_cents) {
      return res.status(400).json({ error: 'Amount does not match. Count again!' });
    }

    // Validate allocations if the pending deposit has them
    const expectedAllocs = pd.allocations ? JSON.parse(pd.allocations) : [];
    const claimedAllocs = body.allocations || [];

    if (expectedAllocs.length > 0) {
      if (claimedAllocs.length !== expectedAllocs.length) {
        return res.status(400).json({ error: 'Allocation count does not match.' });
      }
      for (const expected of expectedAllocs) {
        const expectedCents = expected.type === 'percent'
          ? Math.round(pd.amount_cents * expected.value / 100)
          : expected.value;
        const claimed = claimedAllocs.find(a => a.account_id === expected.account_id);
        if (!claimed || claimed.amount_cents !== expectedCents) {
          return res.status(400).json({ error: `Allocation for ${expected.account_name} doesn't match. Count again!` });
        }
      }
    }

    const totalAllocCents = claimedAllocs.reduce((s, a) => s + a.amount_cents, 0);
    const mainCents = pd.amount_cents - totalAllocCents;

    const claimTx = db.transaction(() => {
      // 1. Credit full amount to main (checking) account
      db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?')
        .run(pd.amount_cents, pd.account_id);

      const tx = db.prepare(`
        INSERT INTO transactions (account_id, amount_cents, type, description, created_by_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(pd.account_id, pd.amount_cents, pd.type, pd.description || '', pd.created_by_user_id);

      // 2. Transfer from main account to each sub-account
      for (const alloc of claimedAllocs) {
        if (alloc.amount_cents <= 0) continue;
        const allocAcct = db.prepare('SELECT name FROM accounts WHERE id = ?').get(alloc.account_id);
        const mainAcct = db.prepare('SELECT name FROM accounts WHERE id = ?').get(pd.account_id);

        // Debit main account
        db.prepare('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?')
          .run(alloc.amount_cents, pd.account_id);
        db.prepare(`
          INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
          VALUES (?, ?, 'transfer_out', ?, ?, ?)
        `).run(pd.account_id, -alloc.amount_cents, `Transfer to ${allocAcct?.name || 'sub-account'}`, alloc.account_id, pd.created_by_user_id);

        // Credit sub-account
        db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?')
          .run(alloc.amount_cents, alloc.account_id);
        db.prepare(`
          INSERT INTO transactions (account_id, amount_cents, type, description, linked_account_id, created_by_user_id)
          VALUES (?, ?, 'transfer_in', ?, ?, ?)
        `).run(alloc.account_id, alloc.amount_cents, `Transfer from ${mainAcct?.name || 'Checking'}`, pd.account_id, pd.created_by_user_id);
      }

      db.prepare('DELETE FROM pending_deposits WHERE id = ?').run(pdId);

      insertActivity({
        familyId: req.user.familyId,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType: 'deposit',
        description: `Received $${(pd.amount_cents / 100).toFixed(2)}${pd.description ? ': ' + pd.description : ''}`,
        referenceId: tx.lastInsertRowid,
        referenceType: 'transaction',
        amountCents: pd.amount_cents,
      });

      return tx.lastInsertRowid;
    });

    claimTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
