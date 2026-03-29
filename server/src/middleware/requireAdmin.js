import db from '../db/db.js';

export function requireAdmin(req, res, next) {
  // Check the DB directly so revoking admin takes effect immediately
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ? AND is_active = 1').get(req.user.userId);
  if (!row || !row.is_admin) {
    return res.status(403).json({ error: 'Forbidden: admin access required.' });
  }
  next();
}
