/**
 * Formats a timestamp as a friendly local date/time string.
 *
 * SQLite sends "YYYY-MM-DD HH:MM:SS" without a timezone marker.
 * Bare strings are normalised to UTC before parsing so that local
 * date methods (getHours, getDate, …) return the correct local time.
 *
 * Output examples:
 *   "Today 11:56AM"
 *   "Yesterday 3:04PM"
 *   "Feb 24 11:56AM"
 */
export function relativeTime(dateInput) {
  let d;
  if (typeof dateInput === 'string' && !dateInput.endsWith('Z') && !dateInput.includes('+')) {
    d = new Date(dateInput.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(dateInput);
  }

  const now      = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay     = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - dDay) / 86_400_000);

  const h     = d.getHours() % 12 || 12;
  const m     = String(d.getMinutes()).padStart(2, '0');
  const ampm  = d.getHours() >= 12 ? 'PM' : 'AM';
  const timeStr = `${h}:${m}${ampm}`;

  if (diffDays === 0) return `Today ${timeStr}`;
  if (diffDays === 1) return `Yesterday ${timeStr}`;

  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} ${d.getDate()} ${timeStr}`;
}
