import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { insertActivity } from '../services/activityService.js';

const router = Router();

function assertUserInFamily(userId, familyId) {
  const u = db.prepare(
    'SELECT id FROM users WHERE id = ? AND family_id = ? AND is_active = 1'
  ).get(userId, familyId);
  if (!u) { const e = new Error('User not found.'); e.status = 404; throw e; }
  return u;
}

function parseRow(row) {
  return row;
}

// GET /api/users/:userId/task-assignments
router.get('/:userId/task-assignments', authenticate, (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    assertUserInFamily(userId, req.user.familyId);

    // ── Auto-reset completed Projects from a previous day ──────────────────
    const toReset = db.prepare(`
      SELECT ta.task_set_id, ts.name AS task_name, u.family_id
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id
      JOIN users u      ON u.id  = ta.user_id
      WHERE ta.user_id   = ?
        AND ta.is_active = 1
        AND ts.type      = 'Project'
        AND ts.is_active = 1
        AND (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ta.task_set_id AND is_active = 1) > 0
        AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ta.task_set_id AND user_id = ta.user_id)
            >= (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ta.task_set_id AND is_active = 1)
        AND date((SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ta.task_set_id AND user_id = ta.user_id)) < date('now')
    `).all(userId);

    if (toReset.length > 0) {
      db.transaction(() => {
        for (const { task_set_id, task_name, family_id } of toReset) {
          db.prepare('DELETE FROM task_step_completions WHERE task_set_id = ? AND user_id = ?').run(task_set_id, userId);
          db.prepare('UPDATE task_assignments SET is_active = 0 WHERE task_set_id = ? AND user_id = ?').run(task_set_id, userId);
          insertActivity({
            familyId:      family_id,
            subjectUserId: userId,
            actorUserId:   userId,
            eventType:     'taskset_reset',
            description:   `${task_name} was reset`,
            referenceId:   task_set_id,
            referenceType: 'task_set',
            amountCents:   null,
          });
        }
      })();
    }
    // ──────────────────────────────────────────────────────────────────────

    const rows = db.prepare(`
      SELECT ts.*,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)   AS step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)                AS completed_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)       AS earned_at
      FROM task_sets ts
      JOIN task_assignments ta ON ta.task_set_id = ts.id
      WHERE ta.user_id = ? AND ta.is_active = 1 AND ts.is_active = 1
      ORDER BY ts.name ASC
    `).all(userId, userId, userId);

    res.json({ taskSets: rows.map(parseRow) });
  } catch (err) { next(err); }
});

// GET /api/users/:userId/task-assignments/:taskSetId
router.get('/:userId/task-assignments/:taskSetId', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);

    const assignment = db.prepare(
      'SELECT id, assigned_at FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).get(taskSetId, userId);
    if (!assignment) return res.status(404).json({ error: 'Task set not assigned to this user.' });

    const taskSet = db.prepare('SELECT * FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    const steps = db.prepare(`
      SELECT ts.*,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ?) AS completed_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ? AND date(completed_at) = date('now')) AS completed_today
      FROM task_steps ts
      WHERE ts.task_set_id = ? AND ts.is_active = 1
      ORDER BY ts.sort_order ASC, ts.id ASC
    `).all(userId, userId, taskSetId);

    // Fetch completions with input_response for display
    const completions = db.prepare(`
      SELECT task_step_id, instance, input_response
      FROM task_step_completions
      WHERE task_set_id = ? AND user_id = ?
      ORDER BY task_step_id, instance
    `).all(taskSetId, userId);

    res.json({ taskSet: parseRow(taskSet), steps, assignedAt: assignment.assigned_at, completions });
  } catch (err) { next(err); }
});

// POST /api/users/:userId/task-assignments/:taskSetId/steps/:stepId/toggle
router.post('/:userId/task-assignments/:taskSetId/steps/:stepId/toggle', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    const stepId    = parseInt(req.params.stepId,    10);
    assertUserInFamily(userId, req.user.familyId);

    // Only the user themselves or a parent can toggle
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const assignment = db.prepare(
      'SELECT id FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).get(taskSetId, userId);
    if (!assignment) return res.status(404).json({ error: 'Task set not assigned to this user.' });

    const step = db.prepare(
      'SELECT id, name, repeat_count, limit_one_per_day, require_input, input_prompt FROM task_steps WHERE id = ? AND task_set_id = ? AND is_active = 1'
    ).get(stepId, taskSetId);
    if (!step) return res.status(404).json({ error: 'Step not found.' });

    const taskSet = db.prepare('SELECT id, name, ticket_reward FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    const user = db.prepare('SELECT family_id, require_task_approval FROM users WHERE id = ?').get(userId);
    const family = db.prepare('SELECT use_tickets FROM families WHERE id = ?').get(user.family_id);
    const useTickets = family?.use_tickets !== 0;

    const repeatCount = step.repeat_count || 1;
    const completedCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ?'
    ).get(stepId, userId).cnt;

    const isUndo = req.body?.undo === true;
    const inputResponse = typeof req.body?.input_response === 'string' ? req.body.input_response.trim() : null;

    // Helper: count total instances across all steps
    const getTotalInstances = () => db.prepare(
      'SELECT COALESCE(SUM(repeat_count), 0) AS cnt FROM task_steps WHERE task_set_id = ? AND is_active = 1'
    ).get(taskSetId).cnt;
    const getDoneInstances = () => db.prepare(
      'SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_set_id = ? AND user_id = ?'
    ).get(taskSetId, userId).cnt;

    if (isUndo) {
      // Undo the most recent completion for this step
      const last = db.prepare(
        'SELECT id, approval_status FROM task_step_completions WHERE task_step_id = ? AND user_id = ? ORDER BY instance DESC LIMIT 1'
      ).get(stepId, userId);
      if (!last) return res.json({ completed_count: 0 });

      // If pending approval, just cancel without ticket reversal
      if (last.approval_status === 'pending') {
        db.prepare('DELETE FROM task_step_completions WHERE id = ?').run(last.id);
        const newCount = completedCount - 1;
        return res.json({ completed_count: newCount, completed_today: 0 });
      }

      // Check if the set was fully completed before this undo
      const totalInst = getTotalInstances();
      const doneInst = getDoneInstances();
      const wasCompleted = totalInst > 0 && doneInst >= totalInst;

      db.prepare('DELETE FROM task_step_completions WHERE id = ?').run(last.id);

      // Reverse ticket reward if the set was complete before this undo
      const ticketReward = taskSet.ticket_reward ?? 0;
      if (wasCompleted && useTickets && ticketReward > 0) {
        db.prepare('UPDATE users SET ticket_balance = ticket_balance - ? WHERE id = ?')
          .run(ticketReward, userId);
        db.prepare(`INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
          VALUES (?, ?, 'manual', ?, ?, 'task_set')`)
          .run(userId, -ticketReward, `Reversed task set reward: ${taskSet.name} (-${ticketReward} tickets)`, taskSetId);
      }

      insertActivity({
        familyId: user.family_id,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType: 'task_step_undone',
        description: `Undid step: ${step.name} (${taskSet.name})`,
        referenceId: taskSetId,
        referenceType: 'task_set',
        amountCents: stepId,
      });
      if (wasCompleted) {
        insertActivity({
          familyId: user.family_id,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'taskset_uncompleted',
          description: `${taskSet.name} marked as incomplete`,
          referenceId: taskSetId,
          referenceType: 'task_set',
          amountCents: useTickets && ticketReward > 0 ? -ticketReward : null,
        });
      }
      const newCount = completedCount - 1;
      const todayCount = db.prepare(
        "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at) = date('now')"
      ).get(stepId, userId).cnt;
      res.json({ completed_count: newCount, completed_today: todayCount });
    } else {
      // Complete next instance
      if (completedCount >= repeatCount) {
        return res.status(400).json({ error: 'Already fully completed.' });
      }

      // Require input validation
      if (step.require_input && !inputResponse) {
        return res.status(400).json({ error: 'Input response is required for this step.' });
      }

      // Check limit_one_per_day
      if (step.limit_one_per_day) {
        const today = db.prepare(
          "SELECT id FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at) = date('now')"
        ).get(stepId, userId);
        if (today) return res.status(400).json({ error: 'Already completed today. Come back tomorrow!' });
      }

      const nextInstance = completedCount + 1;

      if (user.require_task_approval) {
        db.prepare(
          'INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, approval_status, input_response) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(stepId, taskSetId, userId, nextInstance, 'pending', inputResponse);
        return res.json({ completed_count: nextInstance, completed_today: 1, approval_status: 'pending' });
      }

      db.prepare(
        'INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, input_response) VALUES (?, ?, ?, ?, ?)'
      ).run(stepId, taskSetId, userId, nextInstance, inputResponse);

      const displayName = step.name.replace('{#}', String(nextInstance));
      insertActivity({
        familyId: user.family_id,
        subjectUserId: userId,
        actorUserId: req.user.userId,
        eventType: 'task_step_completed',
        description: `Completed step: ${displayName} (${taskSet.name})`,
        referenceId: taskSetId,
        referenceType: 'task_set',
        amountCents: stepId,
      });

      // Check if all steps×instances are now complete
      const totalInst = getTotalInstances();
      const doneInst = getDoneInstances();
      if (totalInst > 0 && doneInst >= totalInst) {
        const ticketReward = taskSet.ticket_reward ?? 0;
        if (useTickets && ticketReward > 0) {
          db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
            .run(ticketReward, userId);
          db.prepare(`INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
            VALUES (?, ?, 'manual', ?, ?, 'task_set')`)
            .run(userId, ticketReward, `Completed task set: ${taskSet.name} (+${ticketReward} tickets)`, taskSetId);
        }
        insertActivity({
          familyId: user.family_id,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'taskset_completed',
          description: `Completed all steps in: ${taskSet.name} 🎯`,
          referenceId: taskSetId,
          referenceType: 'task_set',
          amountCents: useTickets && ticketReward > 0 ? ticketReward : null,
        });
      }

      const todayCount = db.prepare(
        "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at) = date('now')"
      ).get(stepId, userId).cnt;
      res.json({ completed_count: nextInstance, completed_today: todayCount });
    }
  } catch (err) { next(err); }
});

export default router;
