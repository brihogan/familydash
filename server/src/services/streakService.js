import db from '../db/db.js';

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute the current crown streak for a single user from their chores_all_done activity dates.
 */
function computeCurrentCrownStreak(userId) {
  const crownDates = db.prepare(`
    SELECT DISTINCT date(created_at, 'localtime') AS crown_date
    FROM activity_feed
    WHERE subject_user_id = ? AND event_type = 'chores_all_done'
    ORDER BY crown_date DESC
  `).all(userId).map((r) => r.crown_date);

  if (crownDates.length === 0) return 0;

  const today = localDateISO();
  const yesterday = localDateISO(new Date(Date.now() - 86400000));
  const startFrom = crownDates[0] === today ? today
    : crownDates[0] === yesterday ? yesterday : null;

  if (!startFrom) return 0;

  const dateSet = new Set(crownDates);
  let streak = 0;
  let d = new Date(startFrom + 'T00:00:00');
  while (dateSet.has(localDateISO(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Returns a Set of user IDs that hold the "King of Crowns" trophy for a family.
 * Rules:
 *  - Must have a current crown streak > 0
 *  - Must have the highest current crown streak among all active kids in the family
 *  - Ties all receive the trophy
 */
export function getKingOfCrowns(familyId) {
  const kids = db.prepare(
    `SELECT id FROM users WHERE family_id = ? AND role = 'kid' AND is_active = 1`
  ).all(familyId);

  let maxStreak = 0;
  const streaks = new Map();

  for (const kid of kids) {
    const streak = computeCurrentCrownStreak(kid.id);
    streaks.set(kid.id, streak);
    if (streak > maxStreak) maxStreak = streak;
  }

  if (maxStreak === 0) return new Set();

  const winners = new Set();
  for (const [id, streak] of streaks) {
    if (streak === maxStreak) winners.add(id);
  }
  return winners;
}
