/**
 * Returns a local date as YYYY-MM-DD string.
 * @param {Date} d - Date to format (defaults to now)
 */
export function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
