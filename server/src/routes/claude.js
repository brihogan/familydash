import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getOrCreateContainer, stopContainer, getContainerStatus, readContainerFile, listContainerApps } from '../services/dockerService.js';
import { localDateISO } from '../utils/dateHelpers.js';

const __claude_dirname = dirname(fileURLToPath(import.meta.url));
const SDK_DIR = join(__claude_dirname, '..', 'sdk');

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

// CSP for kid-authored apps. Allows inline + eval so beginner JS works, but
// locks down network egress to the same origin. Cloudflare Insights is
// explicitly allowed because CF auto-injects its beacon script and the
// default-src fallback would otherwise block it (and spam the console).
const KID_APP_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss: https://cloudflareinsights.com",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ') + ';';

// One-time tickets for WebSocket auth (avoids token expiry issues)
const wsTickets = new Map(); // ticket -> { kidId, familyId, role, userId, expiresAt }

const router = Router();

// Middleware: check family has Claude Code access
function requireClaudeFamily(req, res, next) {
  const family = db.prepare('SELECT claude_access FROM families WHERE id = ?').get(req.user.familyId);
  if (!family?.claude_access) return res.status(403).json({ error: 'Claude Code not enabled for this family.' });
  next();
}

// Middleware: verify caller can access this kid's Claude instance
function authorizeClaudeAccess(req, res, next) {
  const kidId = parseInt(req.params.userId, 10);
  const { userId, familyId, role } = req.user;

  // Family-level gate
  const family = db.prepare('SELECT claude_access FROM families WHERE id = ?').get(familyId);
  if (!family?.claude_access) return res.status(403).json({ error: 'Claude Code not enabled for this family.' });

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

// ─── Daily usage helpers ──────────────────────────────────────────────────
// IMPORTANT: the "daily" window must reset at *local* midnight, not UTC
// midnight. Previously this used `toISOString().slice(0, 10)` which keyed
// usage rows by UTC date — so in America/Denver the counter silently reset
// at 6 PM (MST) / 7 PM (MDT) and kids got a fresh time budget in the
// evening. We rely on the container's TZ env (see docker-compose.yml) to
// give `localDateISO()` the right answer.
function todayDate() {
  return localDateISO();
}

function getDailyUsedSeconds(userId) {
  const row = db.prepare('SELECT seconds_used FROM claude_daily_usage WHERE user_id = ? AND date = ?').get(userId, todayDate());
  const user = db.prepare('SELECT claude_time_limit FROM users WHERE id = ?').get(userId);
  const limitSec = (user?.claude_time_limit || 60) * 60;
  // Clamp to the limit so over-accumulated rows (e.g. from a workspace left open
  // overnight) never require more than one full grant to restore.
  return Math.min(row?.seconds_used || 0, limitSec);
}

function getDailyRemainingSeconds(userId) {
  const user = db.prepare('SELECT claude_time_limit FROM users WHERE id = ?').get(userId);
  const limitSec = (user?.claude_time_limit || 60) * 60;
  const usedSec = getDailyUsedSeconds(userId);
  return Math.max(0, limitSec - usedSec);
}

function addDailyUsage(userId, seconds) {
  const user = db.prepare('SELECT claude_time_limit FROM users WHERE id = ?').get(userId);
  const limitSec = (user?.claude_time_limit || 60) * 60;
  db.prepare(`
    INSERT INTO claude_daily_usage (user_id, date, seconds_used) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET seconds_used = MIN(seconds_used + ?, ?)
  `).run(userId, todayDate(), Math.min(seconds, limitSec), seconds, limitSec);
}

// POST /api/claude/heartbeat — workspace calls every 30s, tracks daily usage
router.post('/heartbeat', authenticate, requireClaudeFamily, (req, res) => {
  const userId = req.user.userId;
  const user = db.prepare('SELECT claude_enabled, claude_time_limit, role FROM users WHERE id = ?').get(userId);
  if (!user?.claude_enabled) return res.status(403).json({ error: 'Not enabled' });

  // Parents have no time limit
  if (user.role === 'parent') {
    return res.json({ remainingSeconds: Infinity, usedSeconds: 0, limitSeconds: Infinity, unlimited: true });
  }

  addDailyUsage(userId, 30);
  const limitSec = (user.claude_time_limit || 60) * 60;
  const usedSec = getDailyUsedSeconds(userId);
  res.json({ remainingSeconds: Math.max(0, limitSec - usedSec), usedSeconds: usedSec, limitSeconds: limitSec });
});

// GET /api/claude/daily-remaining — get remaining seconds for today
router.get('/daily-remaining', authenticate, requireClaudeFamily, (req, res) => {
  const userId = req.user.userId;
  const user = db.prepare('SELECT claude_enabled, claude_time_limit, role FROM users WHERE id = ?').get(userId);
  if (!user?.claude_enabled) return res.status(403).json({ error: 'Not enabled' });

  if (user.role === 'parent') {
    return res.json({ remainingSeconds: Infinity, usedSeconds: 0, limitSeconds: Infinity, unlimited: true });
  }

  const limitSec = (user.claude_time_limit || 60) * 60;
  const usedSec = getDailyUsedSeconds(userId);
  res.json({ remainingSeconds: Math.max(0, limitSec - usedSec), usedSeconds: usedSec, limitSeconds: limitSec });
});

// POST /api/claude/grant-time — parent grants bonus time to a kid
router.post('/grant-time', authenticate, requireRole('parent'), requireClaudeFamily, (req, res) => {
  const schema = z.object({ userId: z.number().int(), minutes: z.number().int().min(1).max(240) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid input' });
  const { userId, minutes } = parse.data;

  // Verify target kid is in the same family
  const target = db.prepare('SELECT id, name, claude_enabled FROM users WHERE id = ? AND family_id = ? AND is_active = 1').get(userId, req.user.familyId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!target.claude_enabled) return res.status(400).json({ error: 'Claude not enabled for this user' });

  // Subtract minutes from today's used time (floor at 0)
  const date = todayDate();
  const used = getDailyUsedSeconds(userId);
  const newUsed = Math.max(0, used - minutes * 60);
  db.prepare(`
    INSERT INTO claude_daily_usage (user_id, date, seconds_used) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET seconds_used = ?
  `).run(userId, date, newUsed, newUsed);

  res.json({ ok: true, name: target.name, minutesGranted: minutes });
});

// GET /api/claude/apps — list all kid apps for the family
router.get('/apps', authenticate, requireClaudeFamily, async (req, res, next) => {
  try {
    const kids = db.prepare(
      "SELECT id, name, role, claude_time_limit, COALESCE(public_slug, username, CAST(id AS TEXT)) AS username, avatar_color, avatar_emoji FROM users WHERE family_id = ? AND claude_enabled = 1 AND is_active = 1 ORDER BY sort_order ASC"
    ).all(req.user.familyId);

    const stmtMeta = db.prepare(
      'SELECT app_name, description, icon, launches FROM app_metadata WHERE user_id = ?'
    );
    const stmtStarCount = db.prepare(
      'SELECT app_name, COUNT(*) AS stars FROM app_stars WHERE app_owner_id = ? GROUP BY app_name'
    );
    const stmtMyStars = db.prepare(
      'SELECT app_owner_id, app_name FROM app_stars WHERE user_id = ?'
    );

    const myStars = new Set(
      stmtMyStars.all(req.user.userId).map((s) => `${s.app_owner_id}:${s.app_name}`)
    );

    const stmtRenameMeta = db.prepare(
      'UPDATE app_metadata SET app_name = ? WHERE user_id = ? AND app_name = ?'
    );
    const stmtRenameStars = db.prepare(
      'UPDATE app_stars SET app_name = ? WHERE app_owner_id = ? AND app_name = ?'
    );

    const stmtInsertMeta = db.prepare(
      'INSERT OR IGNORE INTO app_metadata (user_id, app_name) VALUES (?, ?)'
    );

    const result = await Promise.all(kids.map(async (kid) => {
      // Try to sync with container if it's running (discover new apps, detect renames)
      let containerApps = null;
      try { containerApps = await listContainerApps(kid.id); } catch {}

      let metaRows = stmtMeta.all(kid.id);

      if (containerApps && containerApps.length > 0) {
        const folderSet = new Set(containerApps);
        const metaSet = new Set(metaRows.map((m) => m.app_name));

        // Detect renames: single orphaned meta + single new folder
        const orphaned = metaRows.filter((m) => !folderSet.has(m.app_name));
        const unmatched = containerApps.filter((n) => !metaSet.has(n));

        if (orphaned.length === 1 && unmatched.length === 1) {
          stmtRenameMeta.run(unmatched[0], kid.id, orphaned[0].app_name);
          stmtRenameStars.run(unmatched[0], kid.id, orphaned[0].app_name);
        }

        // Insert metadata rows for any brand-new apps discovered in the container
        for (const name of unmatched) {
          if (!(orphaned.length === 1 && unmatched.length === 1)) {
            stmtInsertMeta.run(kid.id, name);
          }
        }

        // Refresh after possible changes
        metaRows = stmtMeta.all(kid.id);
      }

      // Build app list from DB metadata (always available, even when container is stopped)
      const starRows = stmtStarCount.all(kid.id);
      const starMap = Object.fromEntries(starRows.map((s) => [s.app_name, s.stars]));

      // Attach daily time budget for display on the Apps page. Parents have
      // no limit (-> null). For kids the client renders "X / Y min left".
      let dailyLimitSeconds = null;
      let dailyRemainingSeconds = null;
      if (kid.role !== 'parent') {
        dailyLimitSeconds = (kid.claude_time_limit || 60) * 60;
        dailyRemainingSeconds = getDailyRemainingSeconds(kid.id);
      }

      return {
        id: kid.id,
        name: kid.name,
        username: kid.username,
        avatar_color: kid.avatar_color,
        avatar_emoji: kid.avatar_emoji,
        role: kid.role,
        dailyLimitSeconds,
        dailyRemainingSeconds,
        apps: metaRows.map((m) => ({
          name: m.app_name,
          description: m.description || '',
          icon: m.icon || null,
          launches: m.launches || 0,
          stars: starMap[m.app_name] || 0,
          starred: myStars.has(`${kid.id}:${m.app_name}`),
        })),
      };
    }));

    // Include the requesting user's time limit (for kid clients to enforce app limits)
    const self = db.prepare('SELECT claude_time_limit FROM users WHERE id = ?').get(req.user.userId);
    res.json({ kids: result, myTimeLimit: self?.claude_time_limit ?? 60 });
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
    res.set('Content-Security-Policy', KID_APP_CSP);
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

// POST /api/claude/apps/star — toggle star on an app
router.post('/apps/star', authenticate, requireClaudeFamily, (req, res, next) => {
  try {
    const { app_owner_id, app_name } = z.object({
      app_owner_id: z.number().int(),
      app_name: z.string().min(1),
    }).parse(req.body);

    const existing = db.prepare(
      'SELECT id FROM app_stars WHERE user_id = ? AND app_owner_id = ? AND app_name = ?'
    ).get(req.user.userId, app_owner_id, app_name);

    if (existing) {
      db.prepare('DELETE FROM app_stars WHERE id = ?').run(existing.id);
      const count = db.prepare(
        'SELECT COUNT(*) AS stars FROM app_stars WHERE app_owner_id = ? AND app_name = ?'
      ).get(app_owner_id, app_name).stars;
      res.json({ starred: false, stars: count });
    } else {
      db.prepare(
        'INSERT INTO app_stars (user_id, app_owner_id, app_name) VALUES (?, ?, ?)'
      ).run(req.user.userId, app_owner_id, app_name);
      const count = db.prepare(
        'SELECT COUNT(*) AS stars FROM app_stars WHERE app_owner_id = ? AND app_name = ?'
      ).get(app_owner_id, app_name).stars;
      res.json({ starred: true, stars: count });
    }
  } catch (err) {
    next(err);
  }
});

// ─── Helper: resolve username or numeric ID to user ───────────────────────
function resolveUser(identifier) {
  // Try public_slug first, then username, then numeric ID
  let user = db.prepare('SELECT id FROM users WHERE public_slug = ? AND is_active = 1').get(identifier);
  if (!user) user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1').get(identifier);
  if (!user && /^\d+$/.test(identifier)) user = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(parseInt(identifier, 10));
  return user;
}

// ─── App storage API (same-origin only, used by apps in iframes) ──────────
const MAX_STORAGE_VALUE_BYTES = 64 * 1024; // 64 KB per key
const MAX_KEYS_PER_APP = 50;

// Prevent Cloudflare/browser from caching storage responses (esp. 404s for
// keys that haven't been written yet — a cached 404 would mask later writes).
function noStoreStorage(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

// Verify the requesting app matches the storage endpoint's app
function requireSameOrigin(req, res, next) {
  const origin = req.get('origin') || '';
  const referer = req.get('referer') || '';
  const host = req.get('host') || '';

  // Allow if no origin/referer (server-side, curl, etc.)
  if (!origin && !referer) return next();

  // Check origin matches (same host or local/private network)
  let originOk = false;
  if (origin) {
    try {
      const oh = new URL(origin).hostname;
      originOk = new URL(origin).host === host
        || oh === 'localhost' || oh === '127.0.0.1'
        || oh.startsWith('192.168.') || oh.startsWith('10.')
        || oh === (process.env.APPS_HOST || '');
    } catch {}
  }
  if (referer && !originOk) {
    try { originOk = new URL(referer).host === host; } catch {}
  }
  // Check X-Forwarded-Host for proxy
  const fwdHost = req.get('x-forwarded-host') || '';
  if (!originOk && origin) {
    try { originOk = new URL(origin).host === fwdHost; } catch {}
  }
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });

  // Referer path must match the app being accessed (prevent cross-app reads)
  if (referer && req.params.username && req.params.appName) {
    try {
      const refPath = new URL(referer).pathname.split('/').filter(Boolean);
      // Handle both /apps/:user/:app and /:user/:app paths
      const refUser = refPath[0] === 'apps' ? refPath[1] : refPath[0];
      const refApp = refPath[0] === 'apps' ? refPath[2] : refPath[1];
      if (refUser !== req.params.username || refApp !== req.params.appName) {
        return res.status(403).json({ error: 'Storage access denied: app mismatch' });
      }
    } catch {}
  }

  next();
}

// GET /api/claude/apps/:username/:appName/data — list all keys
router.get('/apps/:username/:appName/data', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const rows = db.prepare(
    'SELECT key, value, updated_at FROM app_storage WHERE owner_id = ? AND app_name = ?'
  ).all(user.id, req.params.appName);

  const data = {};
  for (const row of rows) {
    try { data[row.key] = JSON.parse(row.value); } catch { data[row.key] = row.value; }
  }
  res.json(data);
});

// GET /api/claude/apps/:username/:appName/data/:key — read a value
router.get('/apps/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const row = db.prepare(
    'SELECT value FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?'
  ).get(user.id, req.params.appName, req.params.key);

  if (!row) return res.status(404).json({ error: 'Key not found' });
  try { res.json(JSON.parse(row.value)); } catch { res.json(row.value); }
});

// PUT /api/claude/apps/:username/:appName/data/:key — write a value
router.put('/apps/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const value = JSON.stringify(req.body);
  if (Buffer.byteLength(value) > MAX_STORAGE_VALUE_BYTES) {
    return res.status(413).json({ error: `Value too large (max ${MAX_STORAGE_VALUE_BYTES / 1024}KB)` });
  }

  // Enforce max keys per app
  const existing = db.prepare(
    'SELECT key FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?'
  ).get(user.id, req.params.appName, req.params.key);
  if (!existing) {
    const count = db.prepare(
      'SELECT COUNT(*) AS c FROM app_storage WHERE owner_id = ? AND app_name = ?'
    ).get(user.id, req.params.appName);
    if (count.c >= MAX_KEYS_PER_APP) {
      return res.status(429).json({ error: `Too many keys (max ${MAX_KEYS_PER_APP} per app)` });
    }
  }

  db.prepare(`
    INSERT INTO app_storage (owner_id, app_name, key, value, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(owner_id, app_name, key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(user.id, req.params.appName, req.params.key, value, value);

  res.json({ ok: true });
});

// DELETE /api/claude/apps/:username/:appName/data/:key — delete a key
router.delete('/apps/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?')
    .run(user.id, req.params.appName, req.params.key);
  res.json({ ok: true });
});

// POST /api/claude/apps/:username/:appName/launch — increment launch counter (public)
router.post('/apps/:username/:appName/launch', (req, res) => {
  const user = resolveUser(req.params.username);
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

// Strict routing so `/:username/:appName` and `/:username/:appName/` are
// treated as distinct paths — without this, Express matches both against the
// first registered route (the serve handler), so the no-trailing-slash URL
// never reaches the redirect route and the browser resolves the app's
// relative script paths against the parent directory. Same reason for
// `subdomainRouter` below.
const appsRouter = Router({ strict: true });

function resolveKidId(req, res, next) {
  const identifier = req.params.username;
  // Try public_slug, then username, then numeric ID
  let user = db.prepare('SELECT id FROM users WHERE public_slug = ? AND is_active = 1').get(identifier);
  if (!user) user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1').get(identifier);
  if (!user && /^\d+$/.test(identifier)) user = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(parseInt(identifier, 10));
  if (!user) return res.status(404).send('User not found');
  req.kidId = user.id;
  next();
}

// Render a simple HTML landing page listing all of a user's apps
function renderUserLanding(req, res) {
  const user = db.prepare(`
    SELECT u.id, u.name, u.public_slug, u.username, u.avatar_emoji
    FROM users u WHERE u.id = ? AND u.is_active = 1
  `).get(req.kidId);
  if (!user) return res.status(404).send('User not found');

  const apps = db.prepare(`
    SELECT app_name, description, icon, launches
    FROM app_metadata WHERE user_id = ? ORDER BY launches DESC, app_name ASC
  `).all(req.kidId);

  const slug = user.public_slug || user.username || String(user.id);
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const appCards = apps.length === 0
    ? `<p class="empty">No apps yet!</p>`
    : apps.map((app) => {
        const title = app.app_name.replace(/[-_]/g, ' ');
        const icon = app.icon || '🚀';
        const desc = app.description || '';
        return `
          <a class="card" href="/${slug}/${encodeURIComponent(app.app_name)}/">
            <div class="icon">${escapeHtml(icon)}</div>
            <div class="info">
              <div class="title">${escapeHtml(title)}</div>
              ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
            </div>
          </a>`;
      }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(user.name)}'s Apps</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem; min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
    color: #e5e7eb;
  }
  .container { max-width: 720px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 2rem; }
  .avatar { font-size: 3rem; margin-bottom: 0.5rem; }
  h1 { margin: 0; font-size: 1.75rem; font-weight: 700; color: #fff; }
  .subtitle { margin-top: 0.25rem; color: #9ca3af; font-size: 0.9rem; }
  .grid { display: grid; gap: 0.75rem; grid-template-columns: 1fr; }
  @media (min-width: 600px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem; border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-decoration: none; color: inherit;
    transition: transform 0.15s, background 0.15s;
  }
  .card:hover { background: rgba(255, 255, 255, 0.1); transform: translateY(-2px); }
  .icon {
    width: 3rem; height: 3rem; border-radius: 0.625rem;
    background: rgba(139, 92, 246, 0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.5rem; flex-shrink: 0;
  }
  .info { min-width: 0; flex: 1; }
  .title { font-weight: 600; color: #fff; text-transform: capitalize; }
  .desc { font-size: 0.85rem; color: #9ca3af; margin-top: 0.125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; color: #6b7280; padding: 2rem; }
  footer { text-align: center; margin-top: 2rem; color: #4b5563; font-size: 0.75rem; }
</style>
</head>
<body>
  <div class="container">
    <header>
      <div class="avatar">${escapeHtml(user.avatar_emoji || '👤')}</div>
      <h1>${escapeHtml(user.name)}'s Apps</h1>
      <div class="subtitle">${apps.length} ${apps.length === 1 ? 'app' : 'apps'}</div>
    </header>
    <div class="grid">${appCards}</div>
    <footer>Built with Claude Code</footer>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(html);
}

async function serveAppFile(req, res) {
  const appName = req.params.appName;
  const filePath = req.params[0] || 'index.html';

  const resolved = path.normalize(path.join(appName, filePath));
  if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
    return res.status(400).send('Invalid path');
  }

  try {
    const data = await readContainerFile(req.kidId, resolved);
    const ext = path.extname(filePath).toLowerCase();
    res.set('Content-Security-Policy', KID_APP_CSP);
    res.set('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    // Never cache kid apps — they change while kids are developing them
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(data);
  } catch {
    res.status(404).send('Not found');
  }
}

// Storage API mirrors the subdomain router so apps can use the same relative
// URL (`./data` or `./data/:key`) regardless of which origin they're served from.
// MUST be registered before the `/:username/:appName/*` wildcard below.
appsRouter.get('/:username/:appName/data', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const rows = db.prepare('SELECT key, value FROM app_storage WHERE owner_id = ? AND app_name = ?').all(user.id, req.params.appName);
  const data = {};
  for (const row of rows) { try { data[row.key] = JSON.parse(row.value); } catch { data[row.key] = row.value; } }
  res.json(data);
});
appsRouter.get('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT value FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').get(user.id, req.params.appName, req.params.key);
  if (!row) return res.status(404).json({ error: 'Key not found' });
  try { res.json(JSON.parse(row.value)); } catch { res.json(row.value); }
});
appsRouter.put('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const value = JSON.stringify(req.body);
  if (Buffer.byteLength(value) > MAX_STORAGE_VALUE_BYTES) return res.status(413).json({ error: `Value too large (max ${MAX_STORAGE_VALUE_BYTES / 1024}KB)` });
  const existing = db.prepare('SELECT key FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').get(user.id, req.params.appName, req.params.key);
  if (!existing) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM app_storage WHERE owner_id = ? AND app_name = ?').get(user.id, req.params.appName);
    if (count.c >= MAX_KEYS_PER_APP) return res.status(429).json({ error: `Too many keys (max ${MAX_KEYS_PER_APP} per app)` });
  }
  db.prepare(`
    INSERT INTO app_storage (owner_id, app_name, key, value, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(owner_id, app_name, key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(user.id, req.params.appName, req.params.key, value, value);
  res.json({ ok: true });
});
appsRouter.delete('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').run(user.id, req.params.appName, req.params.key);
  res.json({ ok: true });
});

// ─── SDK files ───────────────────────────────────────────────────────────────
appsRouter.get('/sdk/multiplayer.js', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(join(SDK_DIR, 'multiplayer.js'));
});

// Match /fox/radar-rat-race/ (trailing slash, serve index.html)
appsRouter.get('/:username/:appName/', resolveKidId, serveAppFile);
// Match /fox/radar-rat-race/style.css (sub-resources)
appsRouter.get('/:username/:appName/*', resolveKidId, serveAppFile);
// Match /fox/radar-rat-race (no trailing slash, redirect)
appsRouter.get('/:username/:appName', (req, res) => {
  res.redirect(req.originalUrl + '/');
});
// Match /fox/ or /fox — user landing page listing all their apps
appsRouter.get('/:username/', resolveKidId, renderUserLanding);
appsRouter.get('/:username', (req, res) => {
  res.redirect(req.originalUrl + '/');
});

// ─── Standalone apps sub-app (for subdomain isolation) ────────────────────
// Serves at /apps/:username/:appName/ — same URL structure as main domain

import express from 'express';
const appsSubdomainApp = express();
appsSubdomainApp.use(express.json());

// CORS: allow the main dashboard origin to embed these in iframes
const APPS_CORS_ORIGIN = process.env.MAIN_ORIGIN || null;
if (APPS_CORS_ORIGIN) {
  appsSubdomainApp.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', APPS_CORS_ORIGIN);
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

const subdomainRouter = Router({ strict: true });

// Storage API: /apps/:username/:appName/data[/:key]
subdomainRouter.get('/:username/:appName/data', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const rows = db.prepare('SELECT key, value FROM app_storage WHERE owner_id = ? AND app_name = ?').all(user.id, req.params.appName);
  const data = {};
  for (const row of rows) { try { data[row.key] = JSON.parse(row.value); } catch { data[row.key] = row.value; } }
  res.json(data);
});
subdomainRouter.get('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT value FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').get(user.id, req.params.appName, req.params.key);
  if (!row) return res.status(404).json({ error: 'Key not found' });
  try { res.json(JSON.parse(row.value)); } catch { res.json(row.value); }
});
subdomainRouter.put('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const value = JSON.stringify(req.body);
  if (Buffer.byteLength(value) > MAX_STORAGE_VALUE_BYTES) return res.status(413).json({ error: `Value too large (max ${MAX_STORAGE_VALUE_BYTES / 1024}KB)` });
  const existing = db.prepare('SELECT key FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').get(user.id, req.params.appName, req.params.key);
  if (!existing) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM app_storage WHERE owner_id = ? AND app_name = ?').get(user.id, req.params.appName);
    if (count.c >= MAX_KEYS_PER_APP) return res.status(429).json({ error: `Too many keys (max ${MAX_KEYS_PER_APP})` });
  }
  db.prepare('INSERT INTO app_storage (owner_id, app_name, key, value, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\')) ON CONFLICT(owner_id, app_name, key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')').run(user.id, req.params.appName, req.params.key, value, value);
  res.json({ ok: true });
});
subdomainRouter.delete('/:username/:appName/data/:key', noStoreStorage, requireSameOrigin, (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM app_storage WHERE owner_id = ? AND app_name = ? AND key = ?').run(user.id, req.params.appName, req.params.key);
  res.json({ ok: true });
});

// Launch counter on subdomain
subdomainRouter.post('/:username/:appName/launch', (req, res) => {
  const user = resolveUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT INTO app_metadata (user_id, app_name, launches) VALUES (?, ?, 1) ON CONFLICT(user_id, app_name) DO UPDATE SET launches = launches + 1').run(user.id, req.params.appName);
  const meta = db.prepare('SELECT launches FROM app_metadata WHERE user_id = ? AND app_name = ?').get(user.id, req.params.appName);
  res.json({ launches: meta?.launches || 1 });
});

// SDK files (subdomain)
subdomainRouter.get('/sdk/multiplayer.js', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(join(SDK_DIR, 'multiplayer.js'));
});

// Static file serving on subdomain
subdomainRouter.get('/:username/:appName/', resolveKidId, serveAppFile);
subdomainRouter.get('/:username/:appName/*', resolveKidId, serveAppFile);
subdomainRouter.get('/:username/:appName', (req, res) => { res.redirect(req.originalUrl + '/'); });
subdomainRouter.get('/:username/', resolveKidId, renderUserLanding);
subdomainRouter.get('/:username', (req, res) => { res.redirect(req.originalUrl + '/'); });

// Mount at root — subdomain URLs are apps.straychips.com/:user/:app/
appsSubdomainApp.use('/', subdomainRouter);
// Also support /apps/ prefix for backward compat
appsSubdomainApp.use('/apps', subdomainRouter);

export { wsTickets, appsRouter, appsSubdomainApp, getDailyRemainingSeconds };
export default router;
