import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';
import { getOrGenerateLogs } from '../services/choreService.js';

const router = Router();

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function assertSameFamily(targetUserId, familyId) {
  const u = db.prepare('SELECT id, family_id FROM users WHERE id = ? AND is_active = 1').get(targetUserId);
  if (!u || u.family_id !== familyId) {
    const err = new Error('User not found.'); err.status = 404; throw err;
  }
  return u;
}

// ─── GET /api/users/:id/overview ──────────────────────────────────────────

router.get('/:id/overview', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);

    const member = db.prepare(
      'SELECT id, name, ticket_balance FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);
    if (!member) return res.status(404).json({ error: 'User not found.' });

    // ── Accounts ────────────────────────────────────────────────────────────
    const accounts = db.prepare(`
      SELECT * FROM accounts WHERE user_id = ? AND is_active = 1
      ORDER BY CASE type WHEN 'main' THEN 0 ELSE 1 END, sort_order ASC, id ASC
    `).all(userId);

    // ── Today's chore progress (generate logs lazily) ───────────────────────
    const today = localDateISO();
    getOrGenerateLogs(userId, today);
    const choresToday = db.prepare(`
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS done
      FROM chore_logs WHERE user_id = ? AND log_date = ?
    `).get(userId, today);

    // ── Potential tickets per day (sum of all active chore rewards) ──────────
    const potential = db.prepare(`
      SELECT COALESCE(SUM(ticket_reward), 0) AS total
      FROM chore_templates WHERE user_id = ? AND is_active = 1
    `).get(userId);

    // ── Last 7 days ──────────────────────────────────────────────────────────
    const ticketsStmt = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'chore_reward' THEN amount ELSE 0 END), 0) AS from_chores,
        COALESCE(SUM(CASE WHEN type = 'manual'       THEN amount ELSE 0 END), 0) AS from_parents
      FROM ticket_ledger
      WHERE user_id = ? AND date(created_at, 'localtime') = ? AND amount > 0
    `);
    const choresStmt = db.prepare(`
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS done
      FROM chore_logs WHERE user_id = ? AND log_date = ?
    `);
    const stepsStmt = db.prepare(`
      SELECT COUNT(*) AS done
      FROM task_step_completions
      WHERE user_id = ? AND date(completed_at, 'localtime') = ?
    `);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date  = localDateISO(d);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const isToday = i === 0;

      const tickets = ticketsStmt.get(userId, date);
      const chores  = choresStmt.get(userId, date);
      const steps   = stepsStmt.get(userId, date);

      last7Days.push({
        date,
        label,
        isToday,
        ticketsFromChores:  tickets.from_chores,
        ticketsFromParents: tickets.from_parents,
        choresDone:         chores.done,
        choresTotal:        chores.total,
        stepsDone:          steps.done,
      });
    }

    // ── Active task sets for progress rings (same filter as dashboard) ─────────
    const taskSetRows = db.prepare(`
      SELECT id, name, emoji, type, step_count, completed_count FROM (
        SELECT
          ts.id, ts.name, ts.emoji, ts.type,
          (SELECT COUNT(*) FROM task_steps s WHERE s.task_set_id = ts.id AND s.is_active = 1) AS step_count,
          (SELECT COUNT(*) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS completed_count,
          (SELECT MAX(completed_at) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS earned_at
        FROM task_assignments ta
        JOIN task_sets ts ON ts.id = ta.task_set_id
        WHERE ta.user_id = ? AND ta.is_active = 1 AND ts.is_active = 1
      ) WHERE NOT (
        step_count > 0 AND completed_count = step_count
        AND type = 'Award'
        AND date(earned_at) < date('now')
      )
      ORDER BY CASE type WHEN 'Project' THEN 0 ELSE 1 END, name
    `).all(userId);

    // ── Trophies: completed Awards with category breakdown ───────────────────
    const trophyRows = db.prepare(`
      SELECT ts.category
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id
      WHERE ta.user_id = ? AND ts.type = 'Award' AND ts.is_active = 1 AND ta.is_active = 1
        AND (SELECT COUNT(*) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) > 0
        AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id)
            = (SELECT COUNT(*) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
    `).all(userId);

    const trophyCategoryMap = {};
    for (const row of trophyRows) {
      const cat = row.category || 'Uncategorized';
      trophyCategoryMap[cat] = (trophyCategoryMap[cat] || 0) + 1;
    }
    const trophyCategories = Object.entries(trophyCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    res.json({
      memberName:            member.name,
      ticketBalance:         member.ticket_balance,
      accounts,
      choreProgressToday:    choresToday,
      potentialTicketsPerDay: potential.total,
      last7Days,
      taskSets: taskSetRows.map((r) => ({
        id:             r.id,
        name:           r.name,
        emoji:          r.emoji,
        type:           r.type,
        stepCount:      r.step_count,
        completedCount: r.completed_count,
      })),
      trophyCount:      trophyRows.length,
      trophyCategories,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
