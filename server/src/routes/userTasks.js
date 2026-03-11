import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { insertActivity } from '../services/activityService.js';
import { getKingOfCrowns } from '../services/streakService.js';

const router = Router();

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    const today = localDateISO();
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
        AND date((SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ta.task_set_id AND user_id = ta.user_id), 'localtime') < ?
    `).all(userId, today);

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
      SELECT ts.*, ta.completion_status,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)   AS step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)                AS completed_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ? AND approval_status = 'pending') AS pending_step_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)       AS earned_at
      FROM task_sets ts
      JOIN task_assignments ta ON ta.task_set_id = ts.id
      WHERE ta.user_id = ? AND ta.is_active = 1 AND ts.is_active = 1
      ORDER BY ts.name ASC
    `).all(userId, userId, userId, userId);

    // ── Compute daily streak ──────────────────────────────────────────────
    const activityDates = db.prepare(`
      SELECT DISTINCT activity_date FROM (
        SELECT date(completed_at, 'localtime') AS activity_date
        FROM chore_logs WHERE user_id = ? AND completed_at IS NOT NULL
        UNION
        SELECT date(completed_at, 'localtime') AS activity_date
        FROM task_step_completions WHERE user_id = ?
      )
      ORDER BY activity_date DESC
    `).all(userId, userId).map((r) => r.activity_date);

    let currentStreak = 0;
    let longestStreak = 0;

    if (activityDates.length > 0) {
      const today = localDateISO();
      const yesterday = localDateISO(new Date(Date.now() - 86400000));

      // Current streak: count from today or yesterday backwards
      const startFrom = activityDates[0] === today ? today
        : activityDates[0] === yesterday ? yesterday : null;

      if (startFrom) {
        const dateSet = new Set(activityDates);
        let d = new Date(startFrom + 'T00:00:00');
        while (dateSet.has(localDateISO(d))) {
          currentStreak++;
          d.setDate(d.getDate() - 1);
        }
      }

      // Longest streak: scan all dates
      let streak = 1;
      longestStreak = 1;
      for (let i = 1; i < activityDates.length; i++) {
        const prev = new Date(activityDates[i - 1] + 'T00:00:00');
        const curr = new Date(activityDates[i] + 'T00:00:00');
        const diffDays = (prev - curr) / 86400000;
        if (diffDays === 1) {
          streak++;
          if (streak > longestStreak) longestStreak = streak;
        } else {
          streak = 1;
        }
      }
    }

    // ── Compute savings streak (days without a withdrawal) ─────────────
    let savingsCurrent = 0;
    let savingsLongest = 0;

    const firstAccountDate = db.prepare(
      `SELECT MIN(date(created_at, 'localtime')) AS d FROM accounts WHERE user_id = ?`
    ).get(userId)?.d;

    if (firstAccountDate) {
      const withdrawDates = db.prepare(`
        SELECT DISTINCT date(t.created_at, 'localtime') AS wd
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.type = 'withdraw'
        ORDER BY wd ASC
      `).all(userId).map((r) => r.wd);

      const today = localDateISO();
      const todayMs = new Date(today + 'T00:00:00').getTime();
      const startMs = new Date(firstAccountDate + 'T00:00:00').getTime();
      const DAY = 86400000;

      if (withdrawDates.length === 0) {
        savingsCurrent = Math.floor((todayMs - startMs) / DAY) + 1;
        savingsLongest = savingsCurrent;
      } else {
        const wdMs = withdrawDates.map((d) => new Date(d + 'T00:00:00').getTime());

        // Current: days since last withdrawal
        savingsCurrent = Math.floor((todayMs - wdMs[wdMs.length - 1]) / DAY);

        // Longest: check all gaps
        savingsLongest = Math.floor((wdMs[0] - startMs) / DAY); // leading gap
        for (let i = 1; i < wdMs.length; i++) {
          const gap = Math.floor((wdMs[i] - wdMs[i - 1]) / DAY) - 1;
          if (gap > savingsLongest) savingsLongest = gap;
        }
        if (savingsCurrent > savingsLongest) savingsLongest = savingsCurrent;
      }
    }

    // ── Compute crown streak (consecutive days with all chores done) ───
    const crownDates = db.prepare(`
      SELECT DISTINCT date(created_at, 'localtime') AS crown_date
      FROM activity_feed
      WHERE subject_user_id = ? AND event_type = 'chores_all_done'
      ORDER BY crown_date DESC
    `).all(userId).map((r) => r.crown_date);

    let crownCurrent = 0;
    let crownLongest = 0;

    if (crownDates.length > 0) {
      const today = localDateISO();
      const yesterday = localDateISO(new Date(Date.now() - 86400000));
      const startFrom = crownDates[0] === today ? today
        : crownDates[0] === yesterday ? yesterday : null;

      if (startFrom) {
        const dateSet = new Set(crownDates);
        let d = new Date(startFrom + 'T00:00:00');
        while (dateSet.has(localDateISO(d))) {
          crownCurrent++;
          d.setDate(d.getDate() - 1);
        }
      }

      let streak = 1;
      crownLongest = 1;
      for (let i = 1; i < crownDates.length; i++) {
        const prev = new Date(crownDates[i - 1] + 'T00:00:00');
        const curr = new Date(crownDates[i] + 'T00:00:00');
        const diffDays = (prev - curr) / 86400000;
        if (diffDays === 1) {
          streak++;
          if (streak > crownLongest) crownLongest = streak;
        } else {
          streak = 1;
        }
      }
    }

    // ── King of Crowns moving trophy ──────────────────────────────────
    const kingOfCrownsHolders = getKingOfCrowns(req.user.familyId);
    const hasKingOfCrowns = kingOfCrownsHolders.has(userId);

    res.json({
      taskSets: rows.map(parseRow),
      streaks: { current: currentStreak, longest: longestStreak },
      savingsStreak: firstAccountDate ? { current: savingsCurrent, longest: savingsLongest } : null,
      crownStreak: { current: crownCurrent, longest: crownLongest },
      hasKingOfCrowns,
    });
  } catch (err) { next(err); }
});

// GET /api/users/:userId/task-assignments/:taskSetId
router.get('/:userId/task-assignments/:taskSetId', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);

    const assignment = db.prepare(
      'SELECT id, assigned_at, completion_status FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).get(taskSetId, userId);
    if (!assignment) return res.status(404).json({ error: 'Task set not assigned to this user.' });

    const taskSet = db.prepare('SELECT * FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    const todayDate = localDateISO();
    const steps = db.prepare(`
      SELECT ts.*,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ?) AS completed_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ? AND date(completed_at, 'localtime') = ?) AS completed_today
      FROM task_steps ts
      WHERE ts.task_set_id = ? AND ts.is_active = 1
      ORDER BY ts.sort_order ASC, ts.id ASC
    `).all(userId, userId, todayDate, taskSetId);

    // Fetch completions with input_response and approval_status for display
    const completions = db.prepare(`
      SELECT task_step_id, instance, input_response, approval_status
      FROM task_step_completions
      WHERE task_set_id = ? AND user_id = ?
      ORDER BY task_step_id, instance
    `).all(taskSetId, userId);

    res.json({ taskSet: parseRow(taskSet), steps, assignedAt: assignment.assigned_at, completions, completionStatus: assignment.completion_status });
  } catch (err) { next(err); }
});

// POST /api/users/:userId/task-assignments/:taskSetId/steps/:stepId/toggle
router.post('/:userId/task-assignments/:taskSetId/steps/:stepId/toggle', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    const stepId    = parseInt(req.params.stepId,    10);
    const toggleToday = localDateISO();
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

    const user = db.prepare('SELECT family_id, require_task_approval, require_set_approval FROM users WHERE id = ?').get(userId);
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
        "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at, 'localtime') = ?"
      ).get(stepId, userId, toggleToday).cnt;
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
        const alreadyDone = db.prepare(
          "SELECT id FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at, 'localtime') = ?"
        ).get(stepId, userId, toggleToday);
        if (alreadyDone) return res.status(400).json({ error: 'Already completed today. Come back tomorrow!' });
      }

      const nextInstance = completedCount + 1;

      if (user.require_set_approval === 'step' && req.user.role !== 'parent') {
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
        // Set-level approval: mark assignment as pending instead of awarding
        if (user.require_set_approval === 'set' && req.user.role !== 'parent') {
          db.prepare("UPDATE task_assignments SET completion_status = 'pending' WHERE task_set_id = ? AND user_id = ? AND is_active = 1")
            .run(taskSetId, userId);
          const todayCount = db.prepare(
            "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at, 'localtime') = ?"
          ).get(stepId, userId, toggleToday).cnt;
          return res.json({ completed_count: nextInstance, completed_today: todayCount, set_pending_approval: true });
        }

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
        "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at, 'localtime') = ?"
      ).get(stepId, userId, toggleToday).cnt;
      res.json({ completed_count: nextInstance, completed_today: todayCount });
    }
  } catch (err) { next(err); }
});

export default router;
