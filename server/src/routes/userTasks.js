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
      SELECT ts.*, ta.completion_status, ta.archived_at, ta.is_pinned,
        b.image_file AS badge_image_file,
        b.category   AS badge_category,
        b.is_award   AS badge_is_award,
        b.award_type AS award_type,
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

    // Override step_count/completed_count for award task sets with weighted
    // progress (linked-badge sub-steps + level-average estimates for unpicked
    // slots). Same math as the detail page so the folder card progress rings
    // line up with what the kid sees when they click in. N+1 query per award
    // is fine — kids rarely have more than a dozen awards enrolled.
    const LEVEL_AVG_STEPS = { preschool: 3, level1: 5, level2: 7, level3: 9, level4: 12, level5: 15 };
    // Per-award step fetch: includes whatever linked_task_set_id the user
    // explicitly picked, but most auto-picked slots have NULL — the detail
    // endpoint resolves those at read time. We mirror the same resolution
    // here so folder progress matches what the kid sees inside the award.
    const awardStepsStmt = db.prepare(`
      SELECT s.id, s.linked_badge_id, s.linked_badge_category, s.linked_task_set_id, s.repeat_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = s.id AND user_id = ?) AS completed_count
      FROM task_steps s WHERE s.task_set_id = ? AND s.is_active = 1
    `);
    // Resolve a linked-badge step → which task_set is the kid currently
    // tracking it through (enrollment for the specific badge_id)?
    const linkedByIdStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) AS linked_step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) AS linked_completed_count
      FROM task_sets linked_ts
      JOIN task_assignments lta ON lta.task_set_id = linked_ts.id
      WHERE linked_ts.badge_id = ? AND linked_ts.is_active = 1
        AND lta.user_id = ? AND lta.is_active = 1
      LIMIT 1
    `);
    // Resolve a category-linked step → highest-progress enrolled badge in
    // that area at the award's level (mirrors the auto-pick in
    // /:userId/task-assignments/:taskSetId).
    const linkedByCategoryStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
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
    `);
    // Resolve by an explicitly-stored linked_task_set_id (the v73 manual pick).
    const storedLinkStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) AS linked_step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) AS linked_completed_count
      FROM task_sets linked_ts WHERE linked_ts.id = ? AND linked_ts.is_active = 1
    `);
    // count_at_level awards (WOW) have no task_steps — progress is the
    // number of 100%-complete badges the kid has at the award's level vs.
    // the `min` target from award_config. Mirrors the per-detail endpoint.
    const countAtLevelStmt = db.prepare(`
      SELECT b.award_config FROM badges b WHERE b.id = ?
    `);
    const completeBadgeCountStmt = db.prepare(`
      SELECT COUNT(*) AS n FROM task_sets ts
      JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
      JOIN badges b ON b.id = ts.badge_id
      WHERE ts.is_active = 1 AND b.is_award = 0 AND ts.badge_level = ?
        AND (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) > 0
        AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id) >=
            (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
    `);

    for (const row of rows) {
      if (!row.badge_is_award) continue;
      const stepsForAward = awardStepsStmt.all(userId, row.id);
      if (stepsForAward.length === 0) {
        // count_at_level / manual / composite. Only count_at_level has live
        // progress; others stay 0/0.
        const cfgRow = countAtLevelStmt.get(row.badge_id);
        const awardType = row.award_type || null;
        if (awardType === 'count_at_level' && row.badge_level && cfgRow) {
          let cfg = {};
          try { cfg = JSON.parse(cfgRow.award_config || '{}'); } catch (_) {}
          const min = cfg.min || 100;
          const count = completeBadgeCountStmt.get(userId, row.badge_level)?.n || 0;
          row.step_count      = min;
          row.completed_count = Math.min(count, min);
        }
        continue;
      }
      const avg = LEVEL_AVG_STEPS[row.badge_level] || 5;
      const assignedTaskSetIds = new Set();
      let total = 0, done = 0;
      for (const s of stepsForAward) {
        const linked = !!s.linked_badge_id || !!s.linked_badge_category;
        if (!linked) {
          // Plain activity step.
          total += Math.max(1, s.repeat_count || 1);
          done  += Math.min(s.completed_count || 0, Math.max(1, s.repeat_count || 1));
          continue;
        }
        // Resolve which task_set this step is linked to (manual pick → specific
        // badge enrollment → category auto-pick → unresolved).
        let pick = null;
        if (s.linked_task_set_id) {
          pick = storedLinkStmt.get(userId, s.linked_task_set_id);
        } else if (s.linked_badge_id) {
          pick = linkedByIdStmt.get(userId, s.linked_badge_id, userId);
        } else if (s.linked_badge_category && s.linked_badge_category !== '*' && row.badge_level) {
          const candidates = linkedByCategoryStmt.all(userId, s.linked_badge_category, row.badge_level, userId, userId);
          pick = candidates.find((c) => !assignedTaskSetIds.has(c.linked_task_set_id)) || null;
        }
        if (pick && pick.linked_step_count > 0) {
          assignedTaskSetIds.add(pick.linked_task_set_id);
          total += pick.linked_step_count;
          done  += pick.linked_completed_count || 0;
        } else {
          // Unresolved / cross-area unpicked / no enrollment yet → estimate.
          total += avg;
        }
      }
      row.step_count      = total;
      row.completed_count = Math.min(done, total);
    }

    // ── Linked-award badges per badge ───────────────────────────────────
    // For every BADGE task set the kid is enrolled in, find the AWARD task
    // sets (also kid-enrolled) whose steps point at it — either via a
    // direct linked_badge_id match, or a manual linked_task_set_id pick
    // (v73). Surfaces in the UI as small overlay badges so a kid/parent
    // can see at a glance which badges contribute to multiple awards.
    // Category auto-picks are NOT included here (computed at read time;
    // would require running the auto-pick logic per (award, category)).
    const linkedAwardRows = db.prepare(`
      SELECT
        ts_badge.id              AS badge_task_set_id,
        ts_award.id              AS award_task_set_id,
        ts_award.name            AS award_name,
        b_award.image_file       AS award_image_file,
        ts_award.emoji           AS award_emoji
      FROM task_sets ts_award
      JOIN task_assignments ta_award
        ON ta_award.task_set_id = ts_award.id
       AND ta_award.user_id = ? AND ta_award.is_active = 1
      JOIN badges b_award
        ON b_award.id = ts_award.badge_id AND b_award.is_award = 1
      JOIN task_steps step
        ON step.task_set_id = ts_award.id AND step.is_active = 1
      JOIN task_sets ts_badge
        ON ts_badge.is_active = 1
       AND ts_badge.badge_id IS NOT NULL
       AND (step.linked_task_set_id = ts_badge.id
            OR (step.linked_badge_id IS NOT NULL AND step.linked_badge_id = ts_badge.badge_id))
      JOIN task_assignments ta_badge
        ON ta_badge.task_set_id = ts_badge.id
       AND ta_badge.user_id = ? AND ta_badge.is_active = 1
      WHERE ts_award.is_active = 1
      GROUP BY ts_badge.id, ts_award.id
    `).all(userId, userId);
    const linkedAwardsByBadge = new Map();
    for (const r of linkedAwardRows) {
      if (!linkedAwardsByBadge.has(r.badge_task_set_id)) {
        linkedAwardsByBadge.set(r.badge_task_set_id, []);
      }
      linkedAwardsByBadge.get(r.badge_task_set_id).push({
        id:         r.award_task_set_id,
        name:       r.award_name,
        image_file: r.award_image_file,
        emoji:      r.award_emoji,
      });
    }
    for (const row of rows) {
      if (row.badge_id && !row.badge_is_award) {
        row.linked_awards = linkedAwardsByBadge.get(row.id) || [];
      }
    }

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
      'SELECT id, assigned_at, completion_status, archived_at, is_pinned FROM task_assignments WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
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
    // For each step that links to an Area of Discovery (Discovery Award rows
    // and STEAM-style multi-slot rows), pull the kid's enrolled badges in
    // that area at the award's level — ordered by % complete, highest first.
    // When multiple steps link to the same category (e.g. STEAM has 4 rows
    // pointing at Discover Science & Tech), each row gets a DIFFERENT
    // enrolled badge by tracking which task_set_ids have already been
    // assigned to earlier rows.
    const linkedAreaListStmt = db.prepare(`
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
    `);
    // Lookup for steps whose stored linked_task_set_id points at an
    // arbitrary enrolled badge (per-kid manual pick stored in v73 column).
    const storedLinkStmt = db.prepare(`
      SELECT linked_ts.id AS linked_task_set_id,
        b.name       AS linked_badge_name,
        b.image_file AS linked_badge_image,
        b.emoji      AS linked_badge_emoji,
        (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = linked_ts.id AND is_active = 1) AS linked_step_count,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = linked_ts.id AND user_id = ?) AS linked_completed_count
      FROM task_sets linked_ts
      JOIN badges b ON b.id = linked_ts.badge_id
      WHERE linked_ts.id = ? AND linked_ts.is_active = 1 AND b.is_active = 1
    `);
    const awardLevel = taskSet?.badge_level || null;
    const assignedTaskSetIds = new Set();
    for (const step of steps) {
      // Stored manual pick wins over auto-pick. This covers both
      // category-linked steps (STEAM/Discovery) where the kid explicitly
      // picked a badge AND cross-area steps (STEAM's Man Made Wonders
      // and outdoor science) whose category is null.
      const storedLink = step.linked_task_set_id || null;
      if (storedLink) {
        const info = storedLinkStmt.get(userId, storedLink);
        if (info) {
          assignedTaskSetIds.add(info.linked_task_set_id);
          step.linked_task_set_id     = info.linked_task_set_id;
          step.linked_badge_name      = info.linked_badge_name;
          step.linked_badge_image     = info.linked_badge_image;
          step.linked_badge_emoji     = info.linked_badge_emoji;
          step.linked_step_count      = info.linked_step_count;
          step.linked_completed_count = info.linked_completed_count;
        } else {
          // The linked task_set was deactivated; clear the stored id so
          // the kid can re-pick. (Defensive — column has ON DELETE SET NULL
          // but soft-deletes via is_active=0 wouldn't fire that.)
          step.linked_task_set_id = null;
        }
        continue;
      }

      if (step.linked_badge_id) {
        const info = linkedAssignmentStmt.get(userId, step.linked_badge_id, userId);
        if (info) {
          step.linked_task_set_id     = info.linked_task_set_id;
          step.linked_badge_emoji     = info.linked_badge_emoji;
          step.linked_step_count      = info.linked_step_count;
          step.linked_completed_count = info.linked_completed_count;
        }
      } else if (step.linked_badge_category && awardLevel) {
        const candidates = linkedAreaListStmt.all(userId, step.linked_badge_category, awardLevel, userId, userId);
        const pick = candidates.find((c) => !assignedTaskSetIds.has(c.linked_task_set_id));
        if (pick) {
          assignedTaskSetIds.add(pick.linked_task_set_id);
          step.linked_task_set_id     = pick.linked_task_set_id;
          step.linked_badge_name      = pick.linked_badge_name;
          step.linked_badge_image     = pick.linked_badge_image;
          step.linked_badge_emoji     = pick.linked_badge_emoji;
          step.linked_step_count      = pick.linked_step_count;
          step.linked_completed_count = pick.linked_completed_count;
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

    res.json({ taskSet: parseRow(taskSet), steps, assignedAt: assignment.assigned_at, completions, completionStatus: assignment.completion_status, archivedAt: assignment.archived_at, isPinned: !!assignment.is_pinned });
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
      'SELECT id, name, repeat_count, limit_one_per_day, require_input, input_prompt, linked_badge_id, linked_badge_category FROM task_steps WHERE id = ? AND task_set_id = ? AND is_active = 1'
    ).get(stepId, taskSetId);
    if (!step) return res.status(404).json({ error: 'Step not found.' });

    // Linked-badge / linked-category steps are auto-managed by syncLinkedAwardSteps
    // (which runs after any badge-step toggle). Reject manual toggles for both
    // so award progress stays consistent with the underlying badge progress.
    if (step.linked_badge_id || step.linked_badge_category) {
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

// GET /api/users/:userId/awards/:taskSetId/badge-progress
// For count_at_level awards (WOW, Major, Gem). Returns the list of every
// 100%-complete badge the kid has at the award's level, with `min` = the
// target count from award_config. The detail page renders progress = X/min
// + the badge grid. Includes badges completed BEFORE the award was enrolled
// — i.e. retroactive credit. CU's WOW wording: "100+ badges at any single
// level"; each WOW enrollment is tied to one level, so we filter to that.
router.get('/:userId/awards/:taskSetId/badge-progress', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);

    const award = db.prepare(`
      SELECT ts.id AS task_set_id, ts.badge_level, b.award_type, b.award_config
      FROM task_sets ts
      JOIN badges b ON b.id = ts.badge_id
      JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
      WHERE ts.id = ? AND ts.is_active = 1 AND b.is_award = 1
    `).get(userId, taskSetId);
    if (!award) return res.status(404).json({ error: 'Award not assigned to this user.' });

    let cfg = {};
    try { cfg = JSON.parse(award.award_config || '{}'); } catch { cfg = {}; }
    const min = cfg.min || 100;

    // Every badge enrollment for this kid at the award's level whose step
    // total is fully covered by completions. We compute totals per task_set
    // and filter to fully-complete ones in JS (cleaner than a triple-nested
    // GROUP BY ... HAVING in SQLite).
    const sets = db.prepare(`
      SELECT ts.id AS task_set_id, ts.name, ts.badge_id,
             b.image_file, b.emoji,
             (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) AS step_count,
             (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?) AS completed_count,
             (SELECT MAX(completed_at) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ?) AS last_completion_at
      FROM task_sets ts
      JOIN badges b ON b.id = ts.badge_id
      JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
      WHERE ts.is_active = 1
        AND b.is_award = 0
        AND ts.badge_level = ?
      ORDER BY last_completion_at DESC NULLS LAST
    `).all(userId, userId, userId, award.badge_level);

    const completed = sets
      .filter((s) => s.step_count > 0 && s.completed_count >= s.step_count)
      .map((s) => ({
        task_set_id:        s.task_set_id,
        badge_id:           s.badge_id,
        name:               s.name,
        image_file:         s.image_file,
        emoji:              s.emoji,
        completed_at:       s.last_completion_at,
      }));

    res.json({
      min,
      count:        completed.length,
      level:        award.badge_level,
      isComplete:   completed.length >= min,
      completed,
    });
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

// PATCH /api/users/:userId/task-assignments/:taskSetId/pin
// Body: { pinned: boolean }
//   Toggle the pin flag on an assignment. Pinned task sets float to the
//   top of the kid's lists — loose pinned items rise on /tasks/:userId,
//   pinned badges/awards rise inside their group page. Independent of
//   archive (pinning + archiving are both allowed; archive wins on the
//   main list, pin is preserved for when it's unarchived).
router.patch('/:userId/task-assignments/:taskSetId/pin', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    assertUserInFamily(userId, req.user.familyId);
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const pinned = req.body?.pinned ? 1 : 0;
    const result = db.prepare(
      'UPDATE task_assignments SET is_pinned = ? WHERE task_set_id = ? AND user_id = ? AND is_active = 1'
    ).run(pinned, taskSetId, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ pinned: !!pinned });
  } catch (err) { next(err); }
});

// PATCH /api/users/:userId/task-assignments/:taskSetId/steps/:stepId/link
// Body: { linkedTaskSetId: number | null }
//   Set (or clear with null) the user-chosen badge link for an award step.
//   Only valid on steps with `linked_badge_category` (Discovery, STEAM area
//   steps) or with category null (STEAM cross-area Man Made Wonders /
//   outdoor science). The endpoint validates the linked task_set is one of
//   the user's own enrollments before saving — no cross-user linking.
router.patch('/:userId/task-assignments/:taskSetId/steps/:stepId/link', authenticate, (req, res, next) => {
  try {
    const userId    = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);
    const stepId    = parseInt(req.params.stepId,    10);
    const linkedTaskSetId = req.body?.linkedTaskSetId == null ? null : parseInt(req.body.linkedTaskSetId, 10);

    assertUserInFamily(userId, req.user.familyId);
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const step = db.prepare(
      'SELECT id, linked_badge_id, linked_badge_category FROM task_steps WHERE id = ? AND task_set_id = ? AND is_active = 1'
    ).get(stepId, taskSetId);
    if (!step) return res.status(404).json({ error: 'Step not found.' });
    if (step.linked_badge_id) {
      // Specific-badge steps already have their link baked in via award config.
      return res.status(400).json({ error: 'This step is locked to a specific badge.' });
    }

    if (linkedTaskSetId != null) {
      // Verify the target task_set is one of THIS user's active enrollments
      // before storing — no cross-user linking, no awards linking to awards.
      const target = db.prepare(`
        SELECT ts.id, b.is_award
        FROM task_sets ts
        JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
        JOIN badges b ON b.id = ts.badge_id
        WHERE ts.id = ? AND ts.is_active = 1
      `).get(userId, linkedTaskSetId);
      if (!target)            return res.status(400).json({ error: 'Linked task set is not one of your enrollments.' });
      if (target.is_award)    return res.status(400).json({ error: 'Cannot link an award to another award.' });
    }

    db.prepare('UPDATE task_steps SET linked_task_set_id = ? WHERE id = ?').run(linkedTaskSetId, stepId);
    res.json({ ok: true, linked_task_set_id: linkedTaskSetId });
  } catch (err) { next(err); }
});

export default router;
