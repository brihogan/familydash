/**
 * After any task_step toggle, re-evaluate auto-completion for award steps
 * that are linked to the toggled step's parent task_set's badge.
 *
 * Two link flavors are handled:
 *   1. `linked_badge_id` — specific badge. Award step auto-completes iff
 *      THIS badge is 100% complete; un-completes if it drops below.
 *   2. `linked_badge_category` — area coverage (e.g. Discovery Award's
 *      "Earn a badge in Agriculture"). Award step auto-completes iff the
 *      kid has ANY 100%-complete badge in that category at the parent
 *      award's level. On uncompletion we re-check the pool — the award
 *      step stays complete as long as SOME other qualifying badge is
 *      still done.
 *
 * No-op when the toggled step is not in a badge task_set, or no matching
 * award steps exist for the user.
 */
export function syncLinkedAwardSteps(db, userId, taskSetId) {
  const ts = db.prepare('SELECT badge_id FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
  if (!ts || !ts.badge_id) return;

  const sourceBadge = db.prepare('SELECT category FROM badges WHERE id = ?').get(ts.badge_id);
  const sourceCategory = sourceBadge?.category || null;

  const totals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ? AND is_active = 1) AS total,
      (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ? AND user_id = ? AND COALESCE(approval_status, 'approved') = 'approved') AS done
  `).get(taskSetId, taskSetId, userId);
  const isComplete = totals.total > 0 && totals.done >= totals.total;

  const existingStmt = db.prepare(
    'SELECT id FROM task_step_completions WHERE task_step_id = ? AND user_id = ? ORDER BY instance DESC LIMIT 1'
  );
  const insertStmt = db.prepare(`
    INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, completed_at, approval_status, input_response)
    VALUES (?, ?, ?, 1, datetime('now'), 'approved', '')
  `);
  const deleteStmt = db.prepare('DELETE FROM task_step_completions WHERE id = ?');

  // ── 1. Specific-badge steps (`linked_badge_id`) + manually-linked steps
  //       (`linked_task_set_id` = THIS task_set's id). Both watch the same
  //       underlying badge enrollment, so we union them. The manual-link
  //       path covers STEAM's cross-area rows (Man Made Wonders / outdoor
  //       science) where the parent picked an enrollment that doesn't
  //       match the row's category.
  const linkedSteps = db.prepare(`
    SELECT s.id AS step_id, s.task_set_id
    FROM task_steps s
    JOIN task_sets ts ON ts.id = s.task_set_id
    JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
    JOIN badges b ON b.id = ts.badge_id
    WHERE (s.linked_badge_id = ? OR s.linked_task_set_id = ?)
      AND s.is_active = 1
      AND ts.is_active = 1
      AND b.is_award = 1
  `).all(userId, ts.badge_id, taskSetId);

  for (const linked of linkedSteps) {
    const existing = existingStmt.get(linked.step_id, userId);
    if (isComplete && !existing)      insertStmt.run(linked.step_id, linked.task_set_id, userId);
    else if (!isComplete && existing) deleteStmt.run(existing.id);
  }

  // ── 2. Area-coverage steps (`linked_badge_category`) ─────────────────────
  // Match the toggled badge's category to award steps linked to that same
  // category. We re-check "does the kid have ANY 100% badge in this category
  // at the award's level" per matching step rather than relying on the just-
  // toggled badge's completion alone — that handles the case where the kid
  // un-completes badge A but has badge B in the same area still finished.
  if (!sourceCategory) return;

  const categorySteps = db.prepare(`
    SELECT s.id AS step_id, s.task_set_id, ats.badge_level AS award_level
    FROM task_steps s
    JOIN task_sets ats ON ats.id = s.task_set_id
    JOIN task_assignments ta ON ta.task_set_id = ats.id AND ta.user_id = ? AND ta.is_active = 1
    JOIN badges ab ON ab.id = ats.badge_id
    WHERE s.linked_badge_category = ?
      AND s.is_active = 1
      AND ats.is_active = 1
      AND ab.is_award = 1
  `).all(userId, sourceCategory);

  // "Has any 100% complete badge in {category} at {award_level}?" — checks
  // every active enrollment for the kid in that area at the award's level.
  const anyCompleteStmt = db.prepare(`
    SELECT 1
    FROM task_assignments ta
    JOIN task_sets ts ON ts.id = ta.task_set_id
    JOIN badges b ON b.id = ts.badge_id
    WHERE ta.user_id = ? AND ta.is_active = 1
      AND ts.is_active = 1
      AND b.is_award = 0
      AND b.category = ?
      AND ts.badge_level = ?
      AND (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) > 0
      AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id) >=
          (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
    LIMIT 1
  `);

  for (const linked of categorySteps) {
    if (!linked.award_level) continue;
    const haveOne = !!anyCompleteStmt.get(userId, sourceCategory, linked.award_level);
    const existing = existingStmt.get(linked.step_id, userId);
    if (haveOne && !existing)        insertStmt.run(linked.step_id, linked.task_set_id, userId);
    else if (!haveOne && existing)   deleteStmt.run(existing.id);
  }
}
