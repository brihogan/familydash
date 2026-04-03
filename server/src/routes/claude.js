import { Router } from 'express';
import db from '../db/db.js';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { getOrCreateContainer, stopContainer, getContainerStatus } from '../services/dockerService.js';

// One-time tickets for WebSocket auth (avoids token expiry issues)
const wsTickets = new Map(); // ticket -> { kidId, familyId, role, userId, expiresAt }

const router = Router();

// Middleware: verify caller can access this kid's Claude instance
function authorizeClaudeAccess(req, res, next) {
  const kidId = parseInt(req.params.userId, 10);
  const { userId, familyId, role } = req.user;

  // Must be parent, or kid accessing their own
  if (role !== 'parent' && userId !== kidId) {
    return res.status(403).json({ error: 'Not authorized.' });
  }

  const kid = db.prepare(
    'SELECT id, claude_enabled FROM users WHERE id = ? AND family_id = ? AND is_active = 1'
  ).get(kidId, familyId);

  if (!kid) return res.status(404).json({ error: 'User not found.' });
  if (!kid.claude_enabled) return res.status(403).json({ error: 'Claude not enabled for this user.' });

  req.kidId = kidId;
  next();
}

// GET /api/claude/:userId/status
router.get('/:userId/status', authenticate, authorizeClaudeAccess, async (req, res, next) => {
  try {
    const status = await getContainerStatus(req.kidId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// POST /api/claude/:userId/start
router.post('/:userId/start', authenticate, authorizeClaudeAccess, async (req, res, next) => {
  try {
    await getOrCreateContainer(req.kidId);
    res.json({ ok: true, running: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/claude/:userId/stop
router.post('/:userId/stop', authenticate, authorizeClaudeAccess, async (req, res, next) => {
  try {
    await stopContainer(req.kidId);
    res.json({ ok: true, running: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/claude/:userId/ws-ticket — get a one-time ticket for WebSocket auth
router.post('/:userId/ws-ticket', authenticate, authorizeClaudeAccess, (req, res) => {
  const ticket = crypto.randomBytes(32).toString('hex');
  wsTickets.set(ticket, {
    kidId: req.kidId,
    familyId: req.user.familyId,
    role: req.user.role,
    userId: req.user.userId,
    expiresAt: Date.now() + 30_000, // 30 seconds
  });
  // Clean up expired tickets
  for (const [t, v] of wsTickets) {
    if (v.expiresAt < Date.now()) wsTickets.delete(t);
  }
  res.json({ ticket });
});

export { wsTickets };
export default router;
