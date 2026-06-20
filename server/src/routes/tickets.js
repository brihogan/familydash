import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';
import { assertSameFamily } from '../utils/assertions.js';
import { adjustTickets } from '../services/ticketService.js';

const router = Router();

// ─── GET /api/users/:id/tickets ───────────────────────────────────────────

router.get('/:id/tickets', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const { ticket_balance } = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId);

    const conditions = ['user_id = ?'];
    const bindings = [userId];
    if (req.query.from) { conditions.push('created_at >= ?'); bindings.push(req.query.from); }
    if (req.query.to)   { conditions.push('created_at <= ?'); bindings.push(req.query.to); }
    const where = conditions.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM ticket_ledger WHERE ${where}`).get(...bindings).cnt;
    const ledger = db.prepare(`
      SELECT * FROM ticket_ledger WHERE ${where}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...bindings, limit, offset);

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

    const newBalance = adjustTickets({
      userId,
      amount: body.amount,
      description: body.description,
      actorUserId: req.user.userId,
    });

    res.json({ ticketBalance: newBalance });
  } catch (err) {
    next(err);
  }
});

export default router;
