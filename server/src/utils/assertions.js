import db from '../db/db.js';

/**
 * Verify that a target user belongs to the given family and is active.
 * Throws 404 if not found or different family.
 * @returns {object} The user row (id, family_id)
 */
export function assertSameFamily(targetUserId, familyId) {
  const user = db.prepare('SELECT id, family_id FROM users WHERE id = ? AND is_active = 1').get(targetUserId);
  if (!user || user.family_id !== familyId) {
    const err = new Error('User not found.'); err.status = 404; throw err;
  }
  return user;
}

/**
 * Verify that an account belongs to the given user.
 * Throws 404 if not found.
 * @returns {object} The account row
 */
export function assertAccountOwner(accountId, userId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ? AND is_active = 1').get(accountId, userId);
  if (!account) {
    const err = new Error('Account not found.'); err.status = 404; throw err;
  }
  return account;
}
