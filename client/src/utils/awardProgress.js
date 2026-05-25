// Weighted progress for award task sets. Plain step-count math is misleading
// on awards: a step that links to a 9-substep badge counts the same as a
// one-off activity. So as more linked badges are added, completing 2 of 9 in
// one badge makes overall progress LOOK worse. We instead weight each step
// by its true substep count (or a level-appropriate estimate when unlinked)
// and sum.
//
// Heuristic per step:
//   • activity (no link)                       → weight 1
//   • linked + enrolled (badge has task_set)   → weight = badge step count
//   • linked but un-enrolled                   → weight = LEVEL_AVG
//
// `completed` for each step:
//   • activity                                 → 1 if step.completed_count >= 1, else 0
//   • linked + enrolled                        → step.linked_completed_count
//   • linked + un-enrolled                     → 0
//
// LEVEL_AVG values come from a one-time empirical scan of the badge library
// using CUMULATIVE step counts — a level-5 badge's task_steps include the
// kid's starred reqs from every prior level (preschool…level5) plus their
// level-5 optional picks. The earlier numbers undercounted because they
// only summed level-5's own starred. Computed as: avg over all badges of
// (cumulative starred reqs through `level`) + (level_opt_counts[level]).
//
// Per-badge cumulative step count usually lands at:
//   preschool: ~3   ·   level1: ~5   ·   level2: ~7
//   level3:    ~9   ·   level4: ~12  ·   level5: ~15
export const LEVEL_AVG_STEPS = {
  preschool: 3,
  level1:    5,
  level2:    7,
  level3:    9,
  level4:    12,
  level5:    15,
};

export function weightForStep(step, awardLevel) {
  const isLinked = !!step.linked_badge_id || !!step.linked_badge_category;
  if (!isLinked) {
    // Plain activity — repeat_count gives how many checkmarks it takes.
    return Math.max(1, step.repeat_count || 1);
  }
  if (step.linked_task_set_id && Number.isFinite(step.linked_step_count) && step.linked_step_count > 0) {
    return step.linked_step_count;
  }
  return LEVEL_AVG_STEPS[awardLevel] || 5;
}

export function completedForStep(step) {
  const isLinked = !!step.linked_badge_id || !!step.linked_badge_category;
  if (!isLinked) {
    // Activity step: completed_count out of repeat_count.
    return Math.min(step.completed_count || 0, Math.max(1, step.repeat_count || 1));
  }
  if (step.linked_task_set_id && Number.isFinite(step.linked_completed_count)) {
    return step.linked_completed_count;
  }
  return 0;
}

/**
 * Sum-of-weights award progress.
 *   { totalCount, completedCount, pct, allDone }
 * Falls back to plain step counting when steps array is empty or the task
 * set isn't an award (caller can decide to use this for any task set).
 */
export function awardProgress(steps, awardLevel) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { totalCount: 0, completedCount: 0, pct: 0, allDone: false };
  }
  let total = 0;
  let done  = 0;
  for (const s of steps) {
    total += weightForStep(s, awardLevel);
    done  += completedForStep(s);
  }
  // Cap done at total — if a linked badge over-reports (shouldn't), clamp.
  done = Math.min(done, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { totalCount: total, completedCount: done, pct, allDone: total > 0 && done >= total };
}
