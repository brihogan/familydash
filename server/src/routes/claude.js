import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import path from 'path';
import { getOrCreateContainer, stopContainer, getContainerStatus, readContainerFile, listContainerApps } from '../services/dockerService.js';

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

// GET /api/claude/apps — list all kid apps for the family
router.get('/apps', authenticate, async (req, res, next) => {
  try {
    const kids = db.prepare(
      'SELECT id, name, username, avatar_color, avatar_emoji FROM users WHERE family_id = ? AND claude_enabled = 1 AND is_active = 1 ORDER BY sort_order ASC'
    ).all(req.user.familyId);

    const stmtMeta = db.prepare(
      'SELECT app_name, description, icon, launches FROM app_metadata WHERE user_id = ?'
    );

    const result = await Promise.all(kids.map(async (kid) => {
      const appNames = await listContainerApps(kid.id);
      const metaRows = stmtMeta.all(kid.id);
      const metaMap = Object.fromEntries(metaRows.map((m) => [m.app_name, m]));
      return {
        ...kid,
        apps: appNames.map((name) => ({
          name,
          description: metaMap[name]?.description || '',
          icon: metaMap[name]?.icon || null,
          launches: metaMap[name]?.launches || 0,
        })),
      };
    }));

    res.json({ kids: result });
  } catch (err) {
    next(err);
  }
});

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

// PUT /api/claude/:userId/apps/:appName/meta — update app description/icon
const AppMetaSchema = z.object({
  description: z.string().max(500).optional(),
  icon: z.string().max(10).nullable().optional(),
});

router.put('/:userId/apps/:appName/meta', authenticate, authorizeClaudeAccess, (req, res, next) => {
  try {
    // Only the kid who owns the app (or a parent) can edit
    const body = AppMetaSchema.parse(req.body);
    const appName = req.params.appName;

    // Upsert metadata
    db.prepare(`
      INSERT INTO app_metadata (user_id, app_name, description, icon)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, app_name) DO UPDATE SET
        description = COALESCE(excluded.description, description),
        icon = COALESCE(excluded.icon, icon)
    `).run(req.kidId, appName, body.description ?? '', body.icon ?? null);

    // Update specific fields if provided
    if (body.description !== undefined) {
      db.prepare('UPDATE app_metadata SET description = ? WHERE user_id = ? AND app_name = ?')
        .run(body.description, req.kidId, appName);
    }
    if (body.icon !== undefined) {
      db.prepare('UPDATE app_metadata SET icon = ? WHERE user_id = ? AND app_name = ?')
        .run(body.icon, req.kidId, appName);
    }

    const meta = db.prepare('SELECT * FROM app_metadata WHERE user_id = ? AND app_name = ?')
      .get(req.kidId, appName);
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

// POST /api/claude/apps/:username/:appName/launch — increment launch counter (public)
router.post('/apps/:username/:appName/launch', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1')
    .get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`
    INSERT INTO app_metadata (user_id, app_name, launches)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, app_name) DO UPDATE SET launches = launches + 1
  `).run(user.id, req.params.appName);

  const meta = db.prepare('SELECT launches FROM app_metadata WHERE user_id = ? AND app_name = ?')
    .get(user.id, req.params.appName);
  res.json({ launches: meta?.launches || 1 });
});

// ─── Public apps router mounted at /apps ──────────────────────────────────
// Serves kid projects at /apps/:username/:appName

const appsRouter = Router();

function resolveKidId(req, res, next) {
  const user = db.prepare(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1'
  ).get(req.params.username);
  if (!user) return res.status(404).send('User not found');
  req.kidId = user.id;
  next();
}

appsRouter.get('/:username/:appName/*', resolveKidId, async (req, res) => {
  const appName = req.params.appName;
  const filePath = req.params[0] || 'index.html';

  const resolved = path.normalize(path.join(appName, filePath));
  if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
    return res.status(400).send('Invalid path');
  }

  try {
    const data = await readContainerFile(req.kidId, resolved);
    const ext = path.extname(filePath).toLowerCase();
    res.set('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:;");
    res.set('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.send(data);
  } catch {
    res.status(404).send('Not found');
  }
});

appsRouter.get('/:username/:appName', (req, res) => {
  res.redirect(req.originalUrl + '/');
});

export { wsTickets, appsRouter };
export default router;
