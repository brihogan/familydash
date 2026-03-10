import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';

const router = Router();

function assertSameFamily(targetUserId, familyId) {
  const user = db.prepare('SELECT id, family_id FROM users WHERE id = ? AND is_active = 1').get(targetUserId);
  if (!user || user.family_id !== familyId) {
    const err = new Error('User not found.'); err.status = 404; throw err;
  }
}

// ─── GET /api/users/:id/activity ──────────────────────────────────────────

router.get('/:id/activity', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const conditions = ['af.subject_user_id = ?'];
    const bindings = [userId];

    // Exact-date filter (legacy: ?date=YYYY-MM-DD)
    if (req.query.date) {
      const safeDate = req.query.date.replace(/[^0-9-]/g, '');
      conditions.push(`date(af.created_at, 'localtime') = ?`);
      bindings.push(safeDate);
    }

    // Range filters
    if (req.query.from) { conditions.push('af.created_at >= ?'); bindings.push(req.query.from); }
    if (req.query.to)   { conditions.push('af.created_at <= ?'); bindings.push(req.query.to); }

    // Event-type filter
    if (req.query.event_types) {
      const types = req.query.event_types.split(',').map(t => t.trim()).filter(t => VALID_EVENT_TYPES.has(t));
      if (types.length) {
        conditions.push(`af.event_type IN (${types.map(() => '?').join(',')})`);
        bindings.push(...types);
      }
    }

    const where = conditions.join(' AND ');

    const total = db.prepare(
      `SELECT COUNT(*) AS cnt FROM activity_feed af WHERE ${where}`
    ).get(...bindings).cnt;

    const items = db.prepare(`
      SELECT af.*, u.name AS actor_name, u.role AS actor_role
      FROM activity_feed af
      JOIN users u ON u.id = af.actor_user_id
      WHERE ${where}
      ORDER BY af.created_at DESC, af.id DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, limit, offset);

    res.json({ activity: items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

const VALID_EVENT_TYPES = new Set([
  'deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'allowance', 'manual_adjustment',
  'chore_completed', 'chore_undone', 'reward_redeemed', 'reward_undone', 'tickets_added', 'tickets_removed',
  'task_step_completed', 'task_step_undone', 'taskset_completed', 'chores_all_done',
]);

// ─── GET /api/family/activity ─────────────────────────────────────────────
// Supports optional filters:
//   ?subject_user_id=123
//   ?event_types=deposit,withdrawal,...  (comma-separated, validated against whitelist)
//   ?from=ISO8601  ?to=ISO8601

router.get('/activity', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
    const offset = (page - 1) * limit;

    const conditions = ['af.family_id = ?'];
    const bindings = [req.user.familyId];

    if (req.query.subject_user_id) {
      const uid = parseInt(req.query.subject_user_id, 10);
      if (!isNaN(uid)) { conditions.push('af.subject_user_id = ?'); bindings.push(uid); }
    }

    if (req.query.event_types) {
      const types = req.query.event_types.split(',').map(t => t.trim()).filter(t => VALID_EVENT_TYPES.has(t));
      if (types.length) {
        conditions.push(`af.event_type IN (${types.map(() => '?').join(',')})`);
        bindings.push(...types);
      }
    }

    if (req.query.from) { conditions.push('af.created_at >= ?'); bindings.push(req.query.from); }
    if (req.query.to)   { conditions.push('af.created_at <= ?'); bindings.push(req.query.to); }

    const where = conditions.join(' AND ');

    const total = db.prepare(
      `SELECT COUNT(*) AS cnt FROM activity_feed af WHERE ${where}`
    ).get(...bindings).cnt;

    const items = db.prepare(`
      SELECT af.*, su.name AS subject_name, su.avatar_color, su.avatar_emoji, au.name AS actor_name, au.role AS actor_role
      FROM activity_feed af
      JOIN users su ON su.id = af.subject_user_id
      JOIN users au ON au.id = af.actor_user_id
      WHERE ${where}
      ORDER BY af.created_at DESC, af.id DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, limit, offset);

    res.json({ activity: items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

export default router;
