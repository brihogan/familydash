import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { processRecurringRules } from '../services/recurringRuleService.js';

const router = Router();

router.get('/', authenticate, (req, res, next) => {
  try {
    processRecurringRules(req.user.familyId);

    const rows = db.prepare(`
      WITH latest_activity AS (
        SELECT subject_user_id, MAX(created_at) AS latest_at
        FROM activity_feed WHERE family_id = ?
        GROUP BY subject_user_id
      ),
      activity_window AS (
        SELECT
          af.subject_user_id,
          COUNT(*) - 1 AS extra_count,
          (SELECT description FROM activity_feed af2
           WHERE af2.subject_user_id = af.subject_user_id AND af2.family_id = ?
           ORDER BY af2.created_at DESC,
             CASE af2.event_type WHEN 'taskset_completed' THEN 0 WHEN 'chores_all_done' THEN 0 ELSE 1 END ASC
           LIMIT 1) AS latest_description
        FROM activity_feed af
        JOIN latest_activity la ON af.subject_user_id = la.subject_user_id
        WHERE af.family_id = ?
          AND af.created_at >= datetime(la.latest_at, '-30 minutes')
        GROUP BY af.subject_user_id
      )
      SELECT
        u.id,
        u.name,
        u.role,
        u.avatar_color,
        u.avatar_emoji,
        u.ticket_balance,
        u.sort_order,
        u.show_on_dashboard,
        u.show_balance_on_dashboard,
        a.balance_cents AS main_balance_cents,
        COALESCE(ch.total, 0) AS chore_total,
        COALESCE(ch.done, 0)  AS chore_done,
        aw.latest_description,
        aw.extra_count
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id AND a.type = 'main' AND a.is_active = 1
      LEFT JOIN activity_window aw ON aw.subject_user_id = u.id
      LEFT JOIN (
        SELECT user_id,
          COUNT(*) AS total,
          COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS done
        FROM chore_logs WHERE log_date = date('now', 'localtime')
        GROUP BY user_id
      ) ch ON ch.user_id = u.id
      WHERE u.family_id = ? AND u.is_active = 1
      ORDER BY u.sort_order ASC, u.role DESC, u.name ASC
    `).all(req.user.familyId, req.user.familyId, req.user.familyId, req.user.familyId);

    const members = rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      avatarColor: r.avatar_color,
      avatarEmoji: r.avatar_emoji || null,
      ticketBalance: r.ticket_balance,
      sortOrder: r.sort_order,
      showOnDashboard: r.show_on_dashboard === 1,
      showBalanceOnDashboard: r.show_balance_on_dashboard === 1,
      mainBalanceCents: r.main_balance_cents ?? 0,
      choreTotal: r.chore_total,
      choreDone: r.chore_done,
      lastActivityDisplay:
        r.latest_description
          ? r.extra_count > 0
            ? `${r.latest_description} +${r.extra_count} more...`
            : r.latest_description
          : null,
      taskSets: [],
      trophyCount: 0,
    }));

    // Fetch active task sets (not yet completed) for kid members
    const kidIds = members.filter((m) => m.role === 'kid').map((m) => m.id);
    if (kidIds.length > 0) {
      const ph = kidIds.map(() => '?').join(',');
      const taskRows = db.prepare(`
        SELECT user_id, id, name, emoji, type, step_count, completed_count FROM (
          SELECT
            ta.user_id,
            ts.id,
            ts.name,
            ts.emoji,
            ts.type,
            (SELECT COUNT(*) FROM task_steps s WHERE s.task_set_id = ts.id AND s.is_active = 1) AS step_count,
            (SELECT COUNT(*) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS completed_count,
            (SELECT MAX(completed_at) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS earned_at
          FROM task_assignments ta
          JOIN task_sets ts ON ts.id = ta.task_set_id
          WHERE ta.user_id IN (${ph}) AND ta.is_active = 1 AND ts.is_active = 1
        ) WHERE NOT (
          step_count > 0 AND completed_count = step_count
          AND type = 'Award'
          AND date(earned_at) < date('now')
        )
        ORDER BY user_id, CASE type WHEN 'Project' THEN 0 ELSE 1 END, name
      `).all(...kidIds);

      const tasksByUser = {};
      for (const row of taskRows) {
        if (!tasksByUser[row.user_id]) tasksByUser[row.user_id] = [];
        if (tasksByUser[row.user_id].length < 4) {
          tasksByUser[row.user_id].push({
            id:             row.id,
            name:           row.name,
            emoji:          row.emoji,
            type:           row.type,
            stepCount:      row.step_count,
            completedCount: row.completed_count,
          });
        }
      }
      members.forEach((m) => { m.taskSets = tasksByUser[m.id] ?? []; });

      // Fetch trophy counts (completed Awards) per kid
      const trophyRows = db.prepare(`
        SELECT ta.user_id, COUNT(*) AS trophy_count
        FROM task_assignments ta
        JOIN task_sets ts ON ts.id = ta.task_set_id
        WHERE ta.user_id IN (${ph})
          AND ts.type = 'Award'
          AND ts.is_active = 1
          AND (SELECT COUNT(*) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) > 0
          AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id)
              = (SELECT COUNT(*) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
        GROUP BY ta.user_id
      `).all(...kidIds);
      for (const row of trophyRows) {
        const m = members.find((m) => m.id === row.user_id);
        if (m) m.trophyCount = row.trophy_count;
      }
    }

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

export default router;
