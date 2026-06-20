import { Router } from 'express';
import db from '../db/db.js';
import { requireDeviceToken } from '../middleware/deviceAuth.js';
import { buildFamilyDashboard } from '../services/dashboardService.js';

const router = Router();

// The watch's built-in font is ASCII-only. Convert the common "smart" punctuation
// that shows up in badge text / descriptions to plain ASCII, and drop anything
// else non-ASCII so it doesn't render as a missing-glyph box.
function ascii(s) {
  if (!s) return '';
  return String(s)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x00-\x7F]/g, '');
}

function moneyTypeLabel(t) {
  return ({
    deposit: 'Deposit',
    withdraw: 'Withdrawal',
    transfer_in: 'Transfer in',
    transfer_out: 'Transfer out',
    allowance: 'Allowance',
    manual_adjustment: 'Adjustment',
  })[t] || 'Transaction';
}

function ticketTypeLabel(t) {
  return ({
    chore_reward: 'Chore reward',
    redemption: 'Redemption',
    manual: 'Adjustment',
  })[t] || 'Tickets';
}

// ─── GET /api/device/dashboard ───────────────────────────────────────────────
// Read-only family snapshot for wearable / embedded clients (the Garmin FamDash
// app). Authenticated by a device token (X-Api-Key header), NOT a JWT. Returns a
// compact, self-describing shape — no 2KB cap like the TRMNL webhook.
router.get('/dashboard', requireDeviceToken('read'), (req, res, next) => {
  try {
    const familyId = req.device.familyId;
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(familyId);
    const members = buildFamilyDashboard(familyId);

    const users = members.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: m.avatarEmoji || '',
      isParent: m.role === 'parent',
      balanceCents: m.mainBalanceCents || 0,
      tickets: m.ticketBalance || 0,
      choreDone: m.choreDone || 0,
      choreTotal: m.choreTotal || 0,
      trophies: m.trophyCount || 0,
      taskSets: (m.taskSets || []).map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji || '',
        done: t.completedCount || 0,
        total: t.stepCount || 0,
      })),
      activity: m.lastActivityDisplay || '',
    }));

    res.set('Cache-Control', 'no-store');
    res.json({
      family: family?.name || 'Family',
      generatedAt: new Date().toISOString(),
      users,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/device/user/:id/history ────────────────────────────────────────
// Last 7 days of money (main account) and ticket transactions for a family
// member: { money: [{reason, amountCents, date}], tickets: [{reason, amount, date}] }.
// Amounts are signed; dates are local "YYYY-MM-DD HH:MM:SS".
router.get('/user/:id/history', requireDeviceToken('read'), (req, res, next) => {
  try {
    const familyId = req.device.familyId;
    const userId = parseInt(req.params.id, 10);
    const user = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, familyId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const moneyRows = db.prepare(`
      SELECT t.amount_cents AS amountCents, t.type AS type, t.description AS description,
             datetime(t.created_at, 'localtime') AS date
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.user_id = ? AND a.type = 'main' AND a.is_active = 1
        AND t.created_at >= datetime('now', '-7 days')
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(userId);

    const ticketRows = db.prepare(`
      SELECT amount, type AS type, description AS description,
             datetime(created_at, 'localtime') AS date
      FROM ticket_ledger
      WHERE user_id = ?
        AND created_at >= datetime('now', '-7 days')
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId);

    const money = moneyRows.map((r) => ({
      reason: ascii(r.description && r.description.trim() !== '' ? r.description : moneyTypeLabel(r.type)),
      amountCents: r.amountCents,
      date: r.date,
    }));
    const tickets = ticketRows.map((r) => ({
      reason: ascii(r.description && r.description.trim() !== '' ? r.description : ticketTypeLabel(r.type)),
      amount: r.amount,
      date: r.date,
    }));

    res.set('Cache-Control', 'no-store');
    res.json({ money, tickets });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/device/taskset/:id/steps?userId=N ──────────────────────────────
// The not-yet-completed steps of a badge / task set for a given member, in order:
// { steps: [{ text }] }. A step is "done" once the member has repeat_count
// completions of it. `text` prefers the full description, falling back to the name.
router.get('/taskset/:id/steps', requireDeviceToken('read'), (req, res, next) => {
  try {
    const familyId = req.device.familyId;
    const taskSetId = parseInt(req.params.id, 10);
    const userId = parseInt(req.query.userId, 10) || 0;

    const ts = db.prepare('SELECT id FROM task_sets WHERE id = ? AND family_id = ?').get(taskSetId, familyId);
    if (!ts) return res.status(404).json({ error: 'Task set not found.' });
    if (userId) {
      const u = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, familyId);
      if (!u) return res.status(404).json({ error: 'User not found.' });
    }

    const rows = db.prepare(`
      SELECT s.name AS name, s.description AS description, s.repeat_count AS repeatCount,
             (SELECT COUNT(*) FROM task_step_completions c
              WHERE c.task_step_id = s.id AND c.user_id = ?) AS doneCount
      FROM task_steps s
      WHERE s.task_set_id = ? AND s.is_active = 1
      ORDER BY s.is_optional ASC, s.sort_order ASC, s.id ASC
    `).all(userId, taskSetId);

    const steps = rows
      .filter((r) => r.doneCount < r.repeatCount)
      .map((r) => ({
        text: ascii(r.description && r.description.trim() !== '' ? r.description : r.name),
      }));

    res.set('Cache-Control', 'no-store');
    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

export default router;
