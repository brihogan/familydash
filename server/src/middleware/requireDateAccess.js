export function requireDateAccess(req, res, next) {
  if (req.user.role !== 'kid') return next();

  const date = req.query.date || req.body?.log_date || req.body?.date;
  if (!date) return next();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');
  const minDate = `${y}-${m}-${d}`;

  if (date < minDate) {
    return res.status(400).json({ error: 'Kids can only access today or yesterday.' });
  }
  next();
}
