import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { insertActivity } from '../services/activityService.js';
import { insertNotification } from '../services/notificationService.js';
import { getKingOfCrowns } from '../services/streakService.js';
import { assertSameFamily as assertUserInFamily } from '../utils/assertions.js';
import { localDateISO } from '../utils/dateHelpers.js';
import { syncLinkedAwardSteps as syncLinkedAwardStepsShared } from '../services/awardSync.js';

const router = Router();

// Local thin wrapper so call sites stay clean (db is module-scoped here).
const syncLinkedAwardSteps = (userId, taskSetId) => syncLinkedAwardStepsShared(db, userId, taskSetId);

function parseRow(row) {
  if (!row) return row;
  if (typeof row.tags === 'string') {
    try { row.tags = JSON.parse(row.tags); }
    catch { row.tags = []; }
  }
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

    // archived=true returns only archived assignments; archived=all returns both;
    // any other value (default) returns only active (non-archived) assignments.
    const archivedParam = (req.query.archived || '').toLowerCase();
    let archivedFilter = 'AND ta.archived_at IS NULL';
    if      (archivedParam === 'true') archivedFilter = 'AND ta.archived_at IS NOT NULL';
    else if (archivedParam === 'all')  archivedFilter = '';

    const rows = db.prepare(`
      SELECT ts.*, ta.completion_status, ta.archived_at,
        b.image_file AS badge_image_file,
        b.category   AS badge_category,
        b.is_award   AS badge_is_award,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)   AS step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)                AS completed_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ? AND approval_status = 'pending') AS pending_step_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?)       AS earned_at
      FROM task_sets ts
      JOIN task_assignments ta ON ta.task_set_id = ts.id
      LEFT JOIN badges b ON b.id = ts.badge_id
      WHERE ta.user_id = ? AND ta.is_active = 1 AND ts.is_active = 1
        ${archivedFilter}
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
    // Query chore_logs directly by log_date so late completions don't break streaks
    const crownDates = db.prepare(`
      SELECT log_date AS crown_date
      FROM chore_logs
      WHERE user_id = ?
      GROUP BY log_date
      HAVING COUNT(*) > 0
         AND COUNT(*) = SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END)
      ORDER BY log_date DESC
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
      'SELECT id, assigned_at, completion_status, archived_at FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).get(taskSetId, userId);
    if (!assignment) return res.status(404).json({ error: 'Task set not assigned to this user.' });

    const taskSet = db.prepare('SELECT * FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    // For badge task sets, fetch level_opt_counts so the kid view can show shortfall.
    // For award task sets (is_award=1), also surface award_type + award_config so the
    // detail page can dispatch to the right per-type UI (Discovery dashboard, etc).
    if (taskSet.badge_id) {
      const badge = db.prepare(
        'SELECT level_opt_counts, image_file, name, description, category, is_award, award_type, award_config FROM badges WHERE id = ?'
      ).get(taskSet.badge_id);
      if (badge) {
        try { taskSet.level_opt_counts = JSON.parse(badge.level_opt_counts || '{}'); } catch { taskSet.level_opt_counts = {}; }
        taskSet.badge_image_file = badge.image_file || null;
        taskSet.badge_name        = badge.name        || null;
        taskSet.badge_description = badge.description || null;
        taskSet.badge_category    = badge.category    || null;
        taskSet.is_award          = badge.is_award === 1;
        taskSet.award_type        = badge.award_type  || null;
        try { taskSet.award_config = JSON.parse(badge.award_config || '{}'); } catch { taskSet.award_config = {}; }
        try { taskSet.award_state  = JSON.parse(taskSet.award_state || '{}'); } catch { taskSet.award_state  = {}; }
      }
    }

    const todayDate = localDateISO();
    const steps = db.prepare(`
      SELECT ts.*,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ?) AS completed_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = ts.id AND user_id = ? AND date(completed_at, 'localtime') = ?) AS completed_today,
        lb.name       AS linked_badge_name,
        lb.image_file AS linked_badge_image
      FROM task_steps ts
      LEFT JOIN badges lb ON lb.id = ts.linked_badge_id
      WHERE ts.task_set_id = ? AND ts.is_active = 1
      ORDER BY ts.sort_order ASC, ts.id ASC
    `).all(userId, userId, todayDate, taskSetId);

    // For each step that links to a specific badge, attach the user's
    // assignment status (task_set_id + progress) so the renderer can show
    // a progress ring + jump-to-badge link, or fall back to a "Start badge"
    // modal trigger when not enrolled.
    const linkedAssignmentStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
        lbb.emoji AS linked_badge_emoji,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) AS linked_step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) AS linked_completed_count
      FROM task_sets linked_ts
      JOIN task_assignments lta ON lta.task_set_id = linked_ts.id
      LEFT JOIN badges lbb ON lbb.id = linked_ts.badge_id
      WHERE linked_ts.badge_id = ? AND linked_ts.is_active = 1
        AND lta.user_id = ? AND lta.is_active = 1
      LIMIT 1
    `);
    // For each step that links to an Area of Discovery (Discovery Award rows),
    // auto-pick the user's highest-progress enrolled badge in that area at the
    // award's badge_level. Returns the same shape as the badge lookup above
    // plus the badge name/image so the row renders identically. NULL when the
    // kid has nothing enrolled in that area at this level → renderer falls
    // back to a "Find a badge" button that opens the browser as a modal.
    const linkedAreaStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
        b.name       AS linked_badge_name,
        b.image_file AS linked_badge_image,
        b.emoji      AS linked_badge_emoji,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) AS linked_step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) AS linked_completed_count
      FROM task_sets linked_ts
      JOIN task_assignments lta ON lta.task_set_id = linked_ts.id
      JOIN badges b ON b.id = linked_ts.badge_id
      WHERE b.category = ? AND b.is_award = 0 AND b.is_active = 1
        AND linked_ts.is_active = 1 AND linked_ts.badge_level = ?
        AND lta.user_id = ? AND lta.is_active = 1
      ORDER BY (
        CASE WHEN (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) = 0
          THEN 0
          ELSE (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) * 100
               / (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1)
        END
      ) DESC
      LIMIT 1
    `);
    const awardLevel = taskSet?.badge_level || null;
    for (const step of steps) {
      if (step.linked_badge_id) {
        const info = linkedAssignmentStmt.get(userId, step.linked_badge_id, userId);
        if (info) {
          step.linked_task_set_id     = info.linked_task_set_id;
          step.linked_badge_emoji     = info.linked_badge_emoji;
          step.linked_step_count      = info.linked_step_count;
          step.linked_completed_count = info.linked_completed_count;
        }
      } else if (step.linked_badge_category && awardLevel) {
        const info = linkedAreaStmt.get(userId, step.linked_badge_category, awardLevel, userId, userId);
        if (info) {
          step.linked_task_set_id     = info.linked_task_set_id;
          step.linked_badge_name      = info.linked_badge_name;
          step.linked_badge_image     = info.linked_badge_image;
          step.linked_badge_emoji     = info.linked_badge_emoji;
          step.linked_step_count      = info.linked_step_count;
          step.linked_completed_count = info.linked_completed_count;
        }
      }
    }

    // Fetch completions with input_response and approval_status for display
    const completions = db.prepare(`
      SELECT task_step_id, instance, input_response, approval_status
      FROM task_step_completions
      WHERE task_set_id = ? AND user_id = ?
      ORDER BY task_step_id, instance
    `).all(taskSetId, userId);

    res.json({ taskSet: parseRow(taskSet), steps, assignedAt: assignment.assigned_at, completions, completionStatus: assignment.completion_status, archivedAt: assignment.archived_at });
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
      'SELECT id, name, repeat_count, limit_one_per_day, require_input, input_prompt, linked_badge_id FROM task_steps WHERE id = ? AND task_set_id = ? AND is_active = 1'
    ).get(stepId, taskSetId);
    if (!step) return res.status(404).json({ error: 'Step not found.' });

    // Linked-badge steps are auto-managed (sync runs after any toggle on the
    // linked badge's task_set). Reject manual toggles to keep state coherent.
    if (step.linked_badge_id) {
      return res.status(400).json({
        error: 'This step auto-completes when the linked badge is finished.',
      });
    }

    const taskSet = db.prepare('SELECT id, name, ticket_reward, notify_mode FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    const user = db.prepare('SELECT family_id, name, require_task_approval, require_set_approval FROM users WHERE id = ?').get(userId);
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
      syncLinkedAwardSteps(userId, taskSetId);
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

      // Parent-inbox notification on each step completion (opt-in per set).
      // Skipped when the set just finished — we'd rather the completion
      // notification cover it than spam two rows in the inbox.
      const setJustFinished = totalInst > 0 && doneInst >= totalInst;
      if (taskSet.notify_mode === 'each_step' && !setJustFinished) {
        const remaining = Math.max(0, totalInst - doneInst);
        insertNotification({
          familyId: user.family_id,
          subjectUserId: userId,
          kind: 'task_step',
          title: `${user.name} completed "${displayName}"`,
          body: `${taskSet.name} — ${remaining} step${remaining === 1 ? '' : 's'} left`,
          referenceType: 'task_set',
          referenceId: taskSetId,
        });
      }
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

        // Parent-inbox notification when the set closes (opt-in per set).
        // Fires for both 'each_step' and 'on_completion' modes so that
        // families who want per-step updates also hear about the finish.
        if (taskSet.notify_mode === 'each_step' || taskSet.notify_mode === 'on_completion') {
          insertNotification({
            familyId: user.family_id,
            subjectUserId: userId,
            kind: 'task_set',
            title: `${user.name} completed: ${taskSet.name}`,
            body: useTickets && ticketReward > 0 ? `+${ticketReward} 🎟 awarded` : 'All steps done',
            referenceType: 'task_set',
            referenceId: taskSetId,
          });
        }
      }

      const todayCount = db.prepare(
        "SELECT COUNT(*) AS cnt FROM task_step_completions WHERE task_step_id = ? AND user_id = ? AND date(completed_at, 'localtime') = ?"
      ).get(stepId, userId, toggleToday).cnt;
      syncLinkedAwardSteps(userId, taskSetId);
      res.json({ completed_count: nextInstance, completed_today: todayCount });
    }
  } catch (err) { next(err); }
});

// PATCH /api/users/:userId/awards/:taskSetId/state
// Persist an award-detail page's per-kid selections (e.g. Discovery Award's
// "which enrolled badge counts for each Area"). Body shape is opaque JSON
// merged into task_sets.award_state; schema is per-award-type.
router.patch('/:userId/awards/:taskSetId/state', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);

    // Only the assigned kid (or a parent in the same family) can update it.
    if (req.user.id !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Not allowed.' });
    }

    const assignment = db.prepare(
      'SELECT id FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).get(taskSetId, userId);
    if (!assignment) return res.status(404).json({ error: 'Award not assigned to this user.' });

    const taskSet = db.prepare('SELECT id, award_state FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });

    let prev = {};
    try { prev = JSON.parse(taskSet.award_state || '{}'); } catch { prev = {}; }
    const merged = { ...prev, ...(req.body || {}) };

    db.prepare('UPDATE task_sets SET award_state = ? WHERE id = ?').run(JSON.stringify(merged), taskSetId);
    res.json({ award_state: merged });
  } catch (err) { next(err); }
});

// POST /api/users/:userId/task-assignments/:taskSetId/archive
// Hide a task assignment from the kid's active list. The row stays so the
// kid (or a parent) can unarchive it later via the Archived filter.
router.post('/:userId/task-assignments/:taskSetId/archive', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const result = db.prepare(
      'UPDATE task_assignments SET archived_at = datetime(\'now\') WHERE task_set_id = ? AND user_id = ? AND is_active = 1 AND archived_at IS NULL'
    ).run(taskSetId, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Active assignment not found.' });
    res.json({ archived: true });
  } catch (err) { next(err); }
});

// POST /api/users/:userId/task-assignments/:taskSetId/unarchive
router.post('/:userId/task-assignments/:taskSetId/unarchive', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const result = db.prepare(
      'UPDATE task_assignments SET archived_at = NULL WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).run(taskSetId, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ archived: false });
  } catch (err) { next(err); }
});

export default router;
