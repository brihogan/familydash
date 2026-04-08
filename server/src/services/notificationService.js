import db from '../db/db.js';

/**
 * Insert a row into inbox_notifications. These are surfaced alongside
 * pending-approval items in the parent inbox and can be dismissed. Use
 * sparingly — only for user-driven events that a parent genuinely wants
 * to see (e.g. opt-in task-set completions). Silently no-ops on any DB
 * error so that notification failures never block the caller's flow
 * (e.g. we never want to break a step-completion API call just because
 * a notification insert blew up).
 */
export function insertNotification({ familyId, subjectUserId, kind, title, body = '', referenceType = null, referenceId = null }) {
  try {
    db.prepare(`
      INSERT INTO inbox_notifications (family_id, subject_user_id, kind, title, body, reference_type, reference_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(familyId, subjectUserId, kind, title, body, referenceType, referenceId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notificationService] insertNotification failed:', err.message);
  }
}
