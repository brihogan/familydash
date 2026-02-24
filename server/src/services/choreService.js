import db from '../db/db.js';

// Converts JS Date.getDay() (0=Sun … 6=Sat) to our bitmask (Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64)
const DOW_BITS = [64, 1, 2, 4, 8, 16, 32];

const getTemplatesStmt = db.prepare(`
  SELECT id, ticket_reward, days_of_week
  FROM chore_templates
  WHERE user_id = ? AND is_active = 1
`);

const insertLogStmt = db.prepare(`
  INSERT OR IGNORE INTO chore_logs
    (chore_template_id, user_id, log_date, ticket_reward_at_time)
  VALUES
    (@choreTemplateId, @userId, @logDate, @ticketRewardAtTime)
`);

const getLogsStmt = db.prepare(`
  SELECT
    cl.id,
    cl.chore_template_id,
    cl.user_id,
    cl.log_date,
    cl.completed_at,
    cl.ticket_reward_at_time,
    ct.name,
    ct.description,
    ct.sort_order
  FROM chore_logs cl
  JOIN chore_templates ct ON ct.id = cl.chore_template_id
  WHERE cl.user_id = ? AND cl.log_date = ? AND ct.is_active = 1
  ORDER BY ct.sort_order ASC, ct.id ASC
`);

const generateLogs = db.transaction((userId, date) => {
  const templates = getTemplatesStmt.all(userId);
  // Parse local date at noon to avoid DST edge cases
  const dayBit = DOW_BITS[new Date(date + 'T12:00:00').getDay()];
  for (const tmpl of templates) {
    // Skip if this chore doesn't run on this day of the week
    if (!(tmpl.days_of_week & dayBit)) continue;
    insertLogStmt.run({
      choreTemplateId: tmpl.id,
      userId,
      logDate: date,
      ticketRewardAtTime: tmpl.ticket_reward,
    });
  }
});

/**
 * Lazily generates chore logs for a user+date and returns them.
 * @param {number} userId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 */
export function getOrGenerateLogs(userId, date) {
  generateLogs(userId, date);
  return getLogsStmt.all(userId, date);
}
