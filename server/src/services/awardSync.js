/**
 * After any task_step toggle, re-evaluate auto-completion for award steps
 * that are linked to the toggled step's parent task_set's badge.
 *   - If the badge is now 100% complete → insert auto-completion rows for
 *     matching linked award steps.
 *   - If it just dropped below 100% → remove those rows.
 * No-op when the toggled step is not in a badge task_set, or no matching
 * linked award steps exist for the user.
 *
 * Limitation: only `linked_badge_id` steps auto-resolve. `linked_badge_category`
 * (Discovery's area steps) requires checking "is there ANY 100% badge in this
 * area at the kid's level" — a future enhancement.
 */
export function syncLinkedAwardSteps(db, userId, taskSetId) {
  const ts = db.prepare('SELECT badge_id FROM task_sets WHERE id = ? AND is_active = 1').get(taskSetId);
  if (!ts || !ts.badge_id) return;

  const totals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ? AND is_active = 1) AS total,
      (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ? AND user_id = ? AND COALESCE(approval_status, 'approved') = 'approved') AS done
  `).get(taskSetId, taskSetId, userId);
  const isComplete = totals.total > 0 && totals.done >= totals.total;

  const linkedSteps = db.prepare(`
    SELECT s.id AS step_id, s.task_set_id
    FROM task_steps s
    JOIN task_sets ts ON ts.id = s.task_set_id
    JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ? AND ta.is_active = 1
    JOIN badges b ON b.id = ts.badge_id
    WHERE s.linked_badge_id = ?
      AND s.is_active = 1
      AND ts.is_active = 1
      AND b.is_award = 1
  `).all(userId, ts.badge_id);

  const existingStmt = db.prepare(
    'SELECT id FROM task_step_completions WHERE task_step_id = ? AND user_id = ? ORDER BY instance DESC LIMIT 1'
  );
  const insertStmt = db.prepare(`
    INSERT INTO task_step_completions (task_step_id, task_set_id, user_id, instance, completed_at, approval_status, input_response)
    VALUES (?, ?, ?, 1, datetime('now'), 'approved', '')
  `);
  const deleteStmt = db.prepare('DELETE FROM task_step_completions WHERE id = ?');

  for (const linked of linkedSteps) {
    const existing = existingStmt.get(linked.step_id, userId);
    if (isComplete && !existing)      insertStmt.run(linked.step_id, linked.task_set_id, userId);
    else if (!isComplete && existing) deleteStmt.run(existing.id);
  }
}
