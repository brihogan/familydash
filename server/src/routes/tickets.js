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

// ─── GET /api/users/:id/tickets ───────────────────────────────────────────

router.get('/:id/tickets', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const { ticket_balance } = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId);
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM ticket_ledger WHERE user_id = ?').get(userId).cnt;
    const ledger = db.prepare(`
      SELECT * FROM ticket_ledger WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    res.json({ ticketBalance: ticket_balance, ledger, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/tickets/adjust ───────────────────────────────────

const AdjustSchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero.'),
  description: z.string().min(1).max(500),
});

router.post('/:id/tickets/adjust', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const body = AdjustSchema.parse(req.body);

    const user = db.prepare('SELECT ticket_balance, family_id FROM users WHERE id = ?').get(userId);
    const newBalance  = Math.max(0, user.ticket_balance + body.amount);
    const actualAmount = newBalance - user.ticket_balance; // may differ from body.amount when clamped

    // Nothing to do if balance is already 0 and removal requested
    if (actualAmount === 0 && body.amount < 0) {
      return res.json({ ticketBalance: newBalance, clamped: false });
    }

    const adjustTx = db.transaction(() => {
      db.prepare('UPDATE users SET ticket_balance = ? WHERE id = ?').run(newBalance, userId);
      const ledgerRow = db.prepare(`
        INSERT INTO ticket_ledger (user_id, amount, type, description)
        VALUES (?, ?, 'manual', ?)
      `).run(userId, actualAmount, body.description);

      insertActivity({
        familyId: user.family_id,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType: actualAmount > 0 ? 'tickets_added' : 'tickets_removed',
        description: `${actualAmount > 0 ? 'Added' : 'Removed'} ${Math.abs(actualAmount)} ticket${Math.abs(actualAmount) !== 1 ? 's' : ''}: ${body.description}`,
        referenceId: ledgerRow.lastInsertRowid,
        referenceType: 'ticket_ledger',
        amountCents: actualAmount,
      });
    });

    adjustTx();
    res.json({ ticketBalance: newBalance, clamped: newBalance !== user.ticket_balance + body.amount });
  } catch (err) {
    next(err);
  }
});

export default router;
