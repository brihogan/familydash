import { Router } from 'express';
import db from '../db/db.js';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import path from 'path';
import { getOrCreateContainer, stopContainer, getContainerStatus, readContainerFile } from '../services/dockerService.js';

const MIME_TYPES = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain', '.xml': 'application/xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

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

// GET /api/claude/:userId/apps/:appName/* — serve static files from kid's workspace (public)
router.get('/:userId/apps/:appName/*', async (req, res) => {
  const kidId = parseInt(req.params.userId, 10);
  const appName = req.params.appName;
  const filePath = req.params[0] || 'index.html';

  // Block path traversal
  const resolved = path.normalize(path.join(appName, filePath));
  if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
    return res.status(400).json({ error: 'Invalid path.' });
  }

  try {
    const data = await readContainerFile(kidId, resolved);
    const ext = path.extname(filePath).toLowerCase();
    // Relax CSP for kid apps so inline scripts/styles work
    res.set('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:;");
    res.set('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.send(data);
  } catch {
    res.status(404).send('Not found');
  }
});

// Bare app URL without trailing slash → redirect so relative paths work
router.get('/:userId/apps/:appName', (req, res) => {
  res.redirect(req.originalUrl + '/');
});

export { wsTickets };
export default router;
