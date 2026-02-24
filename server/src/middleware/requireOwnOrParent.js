export function requireOwnOrParent(req, res, next) {
  if (req.user.role === 'parent') return next();
  if (req.user.userId === parseInt(req.params.id, 10)) return next();
  return res.status(403).json({ error: 'Forbidden: you can only access your own data.' });
}
