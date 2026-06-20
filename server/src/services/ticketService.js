import db from '../db/db.js';
import { insertActivity } from './activityService.js';

/**
 * Apply a signed manual ticket adjustment: update the balance, write a
 * `ticket_ledger` row, and log an activity entry. Shared by the web route
 * (routes/tickets.js) and the device write endpoint (routes/device.js).
 *
 * @param {{userId:number, amount:number, description:string, actorUserId:number}} opts
 * @returns {number|null} the new balance, or null if the user doesn't exist
 */
export function adjustTickets({ userId, amount, description, actorUserId }) {
  const user = db.prepare('SELECT ticket_balance, family_id FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const newBalance = user.ticket_balance + amount;
  const abs = Math.abs(amount);

  db.transaction(() => {
    db.prepare('UPDATE users SET ticket_balance = ? WHERE id = ?').run(newBalance, userId);
    const ledgerRow = db.prepare(`
      INSERT INTO ticket_ledger (user_id, amount, type, description)
      VALUES (?, ?, 'manual', ?)
    `).run(userId, amount, description);

    insertActivity({
      familyId: user.family_id,
      subjectUserId: userId,
      actorUserId,
      eventType: amount > 0 ? 'tickets_added' : 'tickets_removed',
      description: `${amount > 0 ? 'Added' : 'Removed'} ${abs} ticket${abs !== 1 ? 's' : ''}: ${description}`,
      referenceId: ledgerRow.lastInsertRowid,
      referenceType: 'ticket_ledger',
      amountCents: amount,
    });
  })();

  return newBalance;
}
