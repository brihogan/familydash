/**
 * Detect cross-badge references inside plain requirement / optional text and
 * resolve them to a real badge — so the kid view can auto-link them the same
 * way awards do (awards store a linked_badge_id up front; badge requirements
 * and optionals are free text, so we derive the link at read-time).
 *
 * The library's dominant phrasing is "Earn the {Name} badge" (also "a"/"your",
 * capitalized "Badge", trailing "at your level" / "at Level N", or embedded
 * mid-sentence: "…or earn the Biographies badge at your level"). We anchor on
 * the word "badge" and capture the name between the article and that word.
 *
 * Deliberately requires an article (the/a/an/your) so the Level-5 boilerplate
 * "…earn this badge…" and "each level you earn this badge" never match.
 */

// \bEarn so mid-sentence refs still match; non-greedy name stops at the FIRST
// "badge"; optional trailing "s" tolerates the rare "badges".
const EARN_BADGE_RE = /\bearn\s+(?:the|a|an|your)\s+(.+?)\s+badges?\b/i;

/**
 * Pull the referenced badge name out of a step / optional's text.
 * @returns {string|null} the captured name, or null if there's no clean ref.
 */
export function parseEarnBadgeRef(text) {
  if (!text) return null;
  const m = EARN_BADGE_RE.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  // Guard runaway captures (a comma/conjunction-laden sentence) and empties.
  if (!name || name.length > 60) return null;
  return name;
}

/**
 * Resolve the referenced name to a real, non-award, active badge. Match is
 * case-insensitive on the canonical name — slugs never appear in the prose, so
 * name-drift refs ("Math" → "Mathematics") simply don't resolve and stay plain
 * text rather than mis-linking. Excludes `excludeBadgeId` so a badge can't link
 * a requirement to itself.
 *
 * @returns {{id:number,name:string,image_file:string|null,emoji:string|null}|null}
 */
export function resolveEarnBadgeRef(db, text, excludeBadgeId = null) {
  const name = parseEarnBadgeRef(text);
  if (!name) return null;
  return db.prepare(
    `SELECT id, name, image_file, emoji
       FROM badges
      WHERE name = ? COLLATE NOCASE
        AND is_award = 0
        AND is_active = 1
        AND (? IS NULL OR id != ?)
      LIMIT 1`
  ).get(name, excludeBadgeId, excludeBadgeId) || null;
}
