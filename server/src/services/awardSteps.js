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
  // Resolve a referenced badge. We prefer slug because slugs come from CU's
  // canonical URL and don't drift — names can. Falls back to a case-
  // insensitive name match for legacy entries in award_config that haven't
  // been migrated to slug-based references yet.
  const lookupBadge = ({ slug, name }) => {
    if (slug) {
      const bySlug = db.prepare(
        `SELECT id, name FROM badges WHERE slug = ? AND is_award = 0 AND is_active = 1 LIMIT 1`
      ).get(slug);
      if (bySlug) return bySlug;
    }
    if (name) {
      return db.prepare(
        `SELECT id, name FROM badges WHERE name = ? COLLATE NOCASE AND is_award = 0 AND is_active = 1 LIMIT 1`
      ).get(name);
    }
    return null;
  };

  // pushBadgeStep accepts either `name` (legacy) or `slug` (preferred).
  // The visible step text is "Earn the {displayName} badge" where
  // displayName comes from the badge row if found, else falls back to the
  // config's `name` or a slug-derived label.
  const pushBadgeStep = ({ name, slug }, level) => {
    const b = lookupBadge({ slug, name });
    const displayName = b?.name || name || (slug || '').replace(/-badge$/, '').replace(/-/g, ' ');
    out.push({
      name: `Earn the ${displayName} badge`,
      linked_badge_id: b?.id || null,
      linked_badge_category: null,
      level: level || null,
    });
  };

  const pushActivityStep = (text, level) => {
    out.push({ name: text, linked_badge_id: null, linked_badge_category: null, level: level || null });
  };

  // STEAM-style multi-slot rows: link a specific category but keep custom
  // display text (e.g. "Earn a Life Science badge" rather than "Earn a badge
  // in Discover Science & Technology"). Multiple rows for the same category
  // are de-duped against each other in the server's enrichment loop.
  const pushBadgeCategoryStep = (text, category, level) => {
    out.push({
      name: text || `Earn a badge in ${shortArea(category)}`,
      linked_badge_id: null,
      linked_badge_category: category,
      level: level || null,
    });
  };

  if (awardType === 'task_list') {
    // Cumulative: include every level up through the kid's awardLevel, then
    // the `all` bucket for awards whose steps apply at every level (STEAM).
    // Each step carries its source level so the renderer can group them.
    const per = cfg.per_level || {};
    const emitStep = (step, level) => {
      if (step.type === 'badge')               pushBadgeStep({ name: step.name, slug: step.slug }, level);
      else if (step.type === 'badge_category') pushBadgeCategoryStep(step.text, step.category, level);
      else                                     pushActivityStep(step.text, level);
    };
    const maxIdx = LEVEL_ORDER.indexOf(awardLevel);
    if (maxIdx >= 0) {
      for (let i = 0; i <= maxIdx; i++) {
        const lv = LEVEL_ORDER[i];
        for (const step of per[lv] || []) emitStep(step, lv);
      }
    }
    for (const step of per.all || []) emitStep(step, 'all');
  } else if (awardType === 'specific_badges') {
    // `badge_names` is a legacy string-array config; `badges` is the newer
    // shape that supports { name } or { slug } per entry. Either is fine.
    for (const name of cfg.badge_names || []) pushBadgeStep({ name }, null);
    for (const entry of cfg.badges || []) pushBadgeStep(entry, null);
  } else if (awardType === 'area_coverage') {
    for (const area of AREAS) {
      out.push({
        name: `Earn a badge in ${shortArea(area)}`,
        linked_badge_id: null,
        linked_badge_category: area,
        level: null,
      });
    }
  }
  // 'composite' / 'count_at_level' / 'manual' have no per-step structure;
  // their task_set has 0 steps and the UI shows the description + hint.

  return out;
}
