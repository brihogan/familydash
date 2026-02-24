/** Format a Date object to local ISO date string: "YYYY-MM-DD" */
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns today's ISO date string: "YYYY-MM-DD" (local time)
 */
export function todayISO() {
  return localISO(new Date());
}

/**
 * Returns yesterday's ISO date string (local time).
 */
export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localISO(d);
}

/**
 * Format ISO date to human-readable: "Mon, Feb 22"
 */
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Offset an ISO date by N days. offsetDate("2024-01-15", -1) → "2024-01-14"
 */
export function offsetDate(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return localISO(d);
}
