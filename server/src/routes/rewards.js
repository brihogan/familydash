import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';
import { insertActivity } from '../services/activityService.js';

const router = Router();

function assertSameFamily(targetUserId, familyId) {
  const user = db.prepare('SELECT id, family_id FROM users WHERE id = ? AND is_active = 1').get(targetUserId);
  if (!user || user.family_id !== familyId) {
    const err = new Error('User not found.'); err.status = 404; throw err;
  }
  return user;
}

// ─── GET /api/family/rewards ───────────────────────────────────────────────
// (mounted via familyRouter in index.js)

router.get('/rewards', authenticate, (req, res, next) => {
  try {
    const rewards = db.prepare(`
      SELECT * FROM rewards WHERE family_id = ? AND is_active = 1 ORDER BY ticket_cost ASC
    `).all(req.user.familyId);
    res.json({ rewards });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/rewards ──────────────────────────────────────────────

const RewardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  ticket_cost: z.number().int().positive(),
  emoji: z.string().max(10).nullable().optional(),
});

router.post('/rewards', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const body = RewardSchema.parse(req.body);
    const result = db.prepare(`
      INSERT INTO rewards (family_id, name, description, ticket_cost, emoji)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.familyId, body.name, body.description, body.ticket_cost, body.emoji ?? null);
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(reward);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/rewards/:rid ─────────────────────────────────────────

router.put('/rewards/:rid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const rewardId = parseInt(req.params.rid, 10);
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND family_id = ?').get(rewardId, req.user.familyId);
    if (!reward) return res.status(404).json({ error: 'Reward not found.' });

    const body = RewardSchema.partial().parse(req.body);
    const updates = []; const values = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (body.ticket_cost !== undefined) { updates.push('ticket_cost = ?'); values.push(body.ticket_cost); }
    if (body.emoji !== undefined) { updates.push('emoji = ?'); values.push(body.emoji ?? null); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(rewardId);
    db.prepare(`UPDATE rewards SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/family/rewards/:rid ──────────────────────────────────────

router.delete('/rewards/:rid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const rewardId = parseInt(req.params.rid, 10);
    const result = db.prepare(
      'UPDATE rewards SET is_active = 0 WHERE id = ? AND family_id = ?'
    ).run(rewardId, req.user.familyId);
    if (!result.changes) return res.status(404).json({ error: 'Reward not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/rewards/redeem ───────────────────────────────────
// (mounted via usersRouter in index.js)

router.post('/:id/rewards/redeem', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);

    const { reward_id } = z.object({ reward_id: z.number().int() }).parse(req.body);
    const reward = db.prepare(
      'SELECT * FROM rewards WHERE id = ? AND family_id = ? AND is_active = 1'
    ).get(reward_id, req.user.familyId);
    if (!reward) return res.status(404).json({ error: 'Reward not found or inactive.' });

    const user = db.prepare('SELECT ticket_balance, family_id FROM users WHERE id = ?').get(userId);
    if (user.ticket_balance < reward.ticket_cost) {
      return res.status(403).json({ error: 'Insufficient ticket balance.' });
    }

    const redeemTx = db.transaction(() => {
      db.prepare('UPDATE users SET ticket_balance = ticket_balance - ? WHERE id = ?')
        .run(reward.ticket_cost, userId);

      const ledgerRow = db.prepare(`
        INSERT INTO ticket_ledger (user_id, amount, type, description, reference_type)
        VALUES (?, ?, 'redemption', ?, 'reward_redemption')
      `).run(userId, -reward.ticket_cost, `Redeemed: ${reward.name}`);

      const redemption = db.prepare(`
        INSERT INTO reward_redemptions (user_id, reward_id, reward_name_at_time, ticket_cost_at_time)
        VALUES (?, ?, ?, ?)
      `).run(userId, reward.id, reward.name, reward.ticket_cost);

      insertActivity({
        familyId: req.user.familyId,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType: 'reward_redeemed',
        description: `Redeemed reward: ${reward.name} (${reward.ticket_cost} tickets)`,
        referenceId: redemption.lastInsertRowid,
        referenceType: 'reward_redemption',
      });

      return db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
    });

    const newBalance = redeemTx();
    res.json({ ok: true, ticketBalance: newBalance });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/users/:id/rewards/redemptions/:redemptionId ─────────────
// Undo a reward redemption — refund tickets, remove ledger + redemption rows

router.delete('/:id/rewards/redemptions/:redemptionId', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const redemptionId = parseInt(req.params.redemptionId, 10);
    assertSameFamily(userId, req.user.familyId);

    const redemption = db.prepare(
      'SELECT * FROM reward_redemptions WHERE id = ? AND user_id = ?'
    ).get(redemptionId, userId);
    if (!redemption) return res.status(404).json({ error: 'Redemption not found.' });

    const undoTx = db.transaction(() => {
      // Refund tickets
      db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
        .run(redemption.ticket_cost_at_time, userId);

      // Remove the redemption ledger entry (negative amount for this redemption)
      db.prepare(
        "DELETE FROM ticket_ledger WHERE user_id = ? AND type = 'redemption' AND amount = ? AND description = ? AND id = (SELECT id FROM ticket_ledger WHERE user_id = ? AND type = 'redemption' AND amount = ? AND description = ? ORDER BY created_at DESC LIMIT 1)"
      ).run(userId, -redemption.ticket_cost_at_time, `Redeemed: ${redemption.reward_name_at_time}`, userId, -redemption.ticket_cost_at_time, `Redeemed: ${redemption.reward_name_at_time}`);

      // Remove the redemption record
      db.prepare('DELETE FROM reward_redemptions WHERE id = ?').run(redemptionId);

      // Remove the activity event
      db.prepare(
        "DELETE FROM activity WHERE reference_id = ? AND reference_type = 'reward_redemption' AND event_type = 'reward_redeemed'"
      ).run(redemptionId);

      return db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
    });

    const newBalance = undoTx();
    res.json({ ok: true, ticketBalance: newBalance });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family/redemptions ──────────────────────────────────────────
// Parents: see all family redemptions (optionally filtered by ?user_id=X)
// Kids:    see only their own redemptions (user_id forced to self)

router.get('/redemptions', authenticate, (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    // Kids may only view their own; parents may optionally filter by user_id
    const filterUserId = req.user.role === 'kid'
      ? req.user.userId
      : (req.query.user_id ? parseInt(req.query.user_id, 10) : null);

    const whereClauses = ['u.family_id = ?'];
    const whereParams  = [req.user.familyId];
    if (filterUserId) { whereClauses.push('rr.user_id = ?'); whereParams.push(filterUserId); }
    if (req.query.from) { whereClauses.push('rr.created_at >= ?'); whereParams.push(req.query.from); }
    if (req.query.to)   { whereClauses.push('rr.created_at <= ?'); whereParams.push(req.query.to); }
    const where = whereClauses.join(' AND ');

    const total = db.prepare(
      `SELECT COUNT(*) AS cnt FROM reward_redemptions rr JOIN users u ON u.id = rr.user_id WHERE ${where}`
    ).get(...whereParams).cnt;

    const redemptions = db.prepare(`
      SELECT rr.*, u.name AS user_name, u.avatar_color
      FROM reward_redemptions rr
      JOIN users u ON u.id = rr.user_id
      WHERE ${where}
      ORDER BY rr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...whereParams, limit, offset);

    res.json({ redemptions, total, page, limit });
  } catch (err) {
    next(err);
  }
});

export default router;
