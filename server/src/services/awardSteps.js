/**
 * Generate task_step rows from a CuriosityUntamed award's config.
 *
 * Returns an array of plain objects: { name, linked_badge_id, linked_badge_category }
 * Caller is responsible for inserting them into task_steps (so the same code
 * is used by the badge-enroll endpoint and the v67 backfill migration).
 */

const LEVEL_ORDER = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];
const AREAS = [
  'Discover Agriculture',
  'Discover Art',
  'Discover Character',
  'Discover Health & Safety',
  'Discover the Home',
  'Discover Knowledge',
  'Discover the Outdoors',
  'Discover Science & Technology',
  'Discover the World',
];

function shortArea(category) {
  return category.replace('Discover ', '').replace('the ', '');
}

export function generateAwardSteps(db, awardType, awardConfig, awardLevel) {
  const cfg = awardConfig || {};
  const out = [];
  const lookupBadge = (name) => db.prepare(
    `SELECT id FROM badges WHERE name = ? COLLATE NOCASE AND is_award = 0 AND is_active = 1 LIMIT 1`
  ).get(name);

  const pushBadgeStep = (name) => {
    const b = lookupBadge(name);
    out.push({
      name: `Earn the ${name} badge`,
      linked_badge_id: b?.id || null,
      linked_badge_category: null,
    });
  };

  const pushActivityStep = (text) => {
    out.push({ name: text, linked_badge_id: null, linked_badge_category: null });
  };

  if (awardType === 'task_list') {
    // Show only the kid's exact level — earlier levels are covered by the
    // "Complete all [prior level] requirements." step at the top of each level.
    // (Plus the `all` bucket for awards whose steps apply at every level, e.g. STEAM.)
    const per = cfg.per_level || {};
    for (const step of per[awardLevel] || []) {
      if (step.type === 'badge') pushBadgeStep(step.name);
      else                       pushActivityStep(step.text);
    }
    for (const step of per.all || []) {
      if (step.type === 'badge') pushBadgeStep(step.name);
      else                       pushActivityStep(step.text);
    }
  } else if (awardType === 'specific_badges') {
    for (const name of cfg.badge_names || []) pushBadgeStep(name);
  } else if (awardType === 'area_coverage') {
    for (const area of AREAS) {
      out.push({
        name: `Earn a badge in ${shortArea(area)}`,
        linked_badge_id: null,
        linked_badge_category: area,
      });
    }
  }
  // 'composite' / 'count_at_level' / 'manual' have no per-step structure;
  // their task_set has 0 steps and the UI shows the description + hint.

  return out;
}
