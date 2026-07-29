import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import crypto, { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { MIME_TYPES, KID_APP_CSP } from './claude.js';
import {
  getOrCreateGuestContainer,
  getGuestContainerStatus,
  nukeGuestWorkspace,
  stopGuestContainer,
  listGuestFolders,
  listGuestApps,
  readGuestContainerFile,
} from '../services/dockerService.js';

const router = Router();

// Guest tokens are signed with a secret DERIVED from the access secret rather
// than the access secret itself. That's the whole isolation story: a guest
// token simply doesn't verify in `authenticate()`, so it can never be replayed
// against a family route even though it carries a familyId.
const GUEST_SECRET = createHash('sha256')
  .update(`${process.env.JWT_ACCESS_SECRET || 'dev-guest-secret'}:guest-workshop`)
  .digest('hex');

// One-time tickets for the guest WebSocket, same shape as the kid terminal's.
export const guestWsTickets = new Map(); // ticket -> { kind, familyId, slug, name, expiresAt }

const MAX_DURATION_MINUTES = 8 * 60;
const DEFAULT_DURATION_MINUTES = 120;

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

// The single source of truth for "is the door open right now". Every guest
// route calls this, so flipping the toggle off — or simply letting the window
// lapse — locks out someone who already holds a valid token.
function openWindow(familyId) {
  const row = db
    .prepare('SELECT family_id, enabled, passcode_hash, expires_at FROM guest_access WHERE family_id = ?')
    .get(familyId);
  if (!row || !row.enabled) return null;
  if (!row.expires_at || row.expires_at <= Date.now()) return null;
  return row;
}

function signGuestToken({ familyId, slug, name, expiresAt }) {
  // Never outlive the window it was issued for.
  const secondsLeft = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
  return jwt.sign({ kind: 'guest', familyId, slug, name }, GUEST_SECRET, { expiresIn: secondsLeft });
}

// Middleware: authenticate a guest by their token AND re-check the window.
function authenticateGuest(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), GUEST_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Enter the passcode again.' });
  }
  if (payload.kind !== 'guest') return res.status(401).json({ error: 'Not signed in.' });

  const row = openWindow(payload.familyId);
  if (!row) return res.status(403).json({ error: 'Building time is over.' });

  req.guest = { familyId: payload.familyId, slug: payload.slug, name: payload.name, expiresAt: row.expires_at };
  next();
}

// ─── Public: is anyone accepting guests? ───────────────────────────────────
// Deliberately says nothing about which family or how long is left — just
// whether it's worth showing the passcode box.
router.get('/status', (_req, res) => {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM guest_access WHERE enabled = 1 AND expires_at > ?')
    .get(Date.now());
  res.json({ open: row.n > 0 });
});

// ─── Public: passcode + first name → guest token ───────────────────────────
const LoginSchema = z.object({
  passcode: z.string().min(1).max(100),
  name: z.string().min(1).max(40),
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter your name and the passcode.' });

    const slug = slugify(parsed.data.name);
    if (!slug) return res.status(400).json({ error: 'Use letters or numbers for your name.' });

    // No family context on a public route, so the passcode itself picks the
    // family. Only open windows are considered.
    const now = Date.now();
    const candidates = db
      .prepare('SELECT family_id, passcode_hash, expires_at FROM guest_access WHERE enabled = 1')
      .all()
      .filter((r) => r.passcode_hash && r.expires_at && r.expires_at > now);

    let match = null;
    for (const row of candidates) {
      if (await bcrypt.compare(parsed.data.passcode, row.passcode_hash)) {
        match = row;
        break;
      }
    }
    if (!match) {
      return res.status(401).json({ error: "That passcode isn't working right now." });
    }

    const existing = db
      .prepare('SELECT id, name FROM guest_sessions WHERE family_id = ? AND slug = ?')
      .get(match.family_id, slug);

    if (existing) {
      db.prepare("UPDATE guest_sessions SET last_seen = datetime('now'), name = ? WHERE id = ?")
        .run(parsed.data.name.trim(), existing.id);
    } else {
      db.prepare(
        "INSERT INTO guest_sessions (family_id, name, slug, last_seen) VALUES (?, ?, ?, datetime('now'))",
      ).run(match.family_id, parsed.data.name.trim(), slug);
    }

    const token = signGuestToken({
      familyId: match.family_id,
      slug,
      name: parsed.data.name.trim(),
      expiresAt: match.expires_at,
    });

    res.json({
      token,
      name: parsed.data.name.trim(),
      folder: slug,
      returning: Boolean(existing),
      expiresAt: match.expires_at,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Guest: confirm a stored token is still good (used on page reload) ─────
router.get('/session', authenticateGuest, (req, res) => {
  res.json({
    name: req.guest.name,
    folder: req.guest.slug,
    expiresAt: req.guest.expiresAt,
  });
});

// ─── Guest: one-time WebSocket ticket ──────────────────────────────────────
router.post('/ws-ticket', authenticateGuest, async (req, res, next) => {
  try {
    // Warm the container here rather than inside the socket handler so a
    // Docker failure surfaces as a clean HTTP error the page can render.
    // Guests get a plain-English message — the real error (missing image,
    // dead daemon) goes to the log for whoever is running the workshop.
    try {
      await getOrCreateGuestContainer(req.guest.familyId);
    } catch (err) {
      console.error('[guest] Could not start workshop container:', err.message);
      return res.status(503).json({ error: 'The workshop is still waking up. Try again in a moment.' });
    }

    const ticket = crypto.randomBytes(32).toString('hex');
    guestWsTickets.set(ticket, {
      kind: 'guest',
      familyId: req.guest.familyId,
      slug: req.guest.slug,
      name: req.guest.name,
      expiresAt: Date.now() + 30_000,
    });
    for (const [t, v] of guestWsTickets) {
      if (v.expiresAt < Date.now()) guestWsTickets.delete(t);
    }
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ─── Parent: read the current setup ────────────────────────────────────────
router.get('/settings', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const row = db
      .prepare('SELECT enabled, passcode_hash, expires_at FROM guest_access WHERE family_id = ?')
      .get(familyId);

    // Container state is informational. If the Docker socket is unavailable
    // the parent should still be able to set a passcode and open the window,
    // so a failure here degrades to "unknown" rather than 500-ing the card.
    let status = { exists: false, running: false, unavailable: true };
    let folders = [];
    try {
      status = await getGuestContainerStatus(familyId);
      if (status.running) folders = await listGuestFolders(familyId);
    } catch (err) {
      console.error('[guest] Could not read container status:', err.message);
    }
    const guests = db
      .prepare('SELECT name, slug, last_seen FROM guest_sessions WHERE family_id = ? ORDER BY last_seen DESC')
      .all(familyId);

    res.json({
      enabled: Boolean(row?.enabled),
      hasPasscode: Boolean(row?.passcode_hash),
      expiresAt: row?.expires_at || null,
      open: Boolean(openWindow(familyId)),
      container: status,
      folders,
      guests,
      defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
      maxDurationMinutes: MAX_DURATION_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Parent: open or close the window ──────────────────────────────────────
const SettingsSchema = z.object({
  enabled: z.boolean(),
  passcode: z.string().min(4).max(100).optional(),
  durationMinutes: z.number().int().min(5).max(MAX_DURATION_MINUTES).optional(),
});

router.put('/settings', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    const parsed = SettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid settings.' });

    const familyId = req.user.familyId;
    const existing = db
      .prepare('SELECT passcode_hash FROM guest_access WHERE family_id = ?')
      .get(familyId);

    if (!parsed.data.enabled) {
      db.prepare(
        `INSERT INTO guest_access (family_id, enabled, expires_at, updated_at)
         VALUES (?, 0, NULL, datetime('now'))
         ON CONFLICT(family_id) DO UPDATE SET enabled = 0, expires_at = NULL, updated_at = datetime('now')`,
      ).run(familyId);
      return res.json({ enabled: false, expiresAt: null, open: false });
    }

    // Turning it on requires a passcode — either a new one or one already set.
    const passcodeHash = parsed.data.passcode
      ? await bcrypt.hash(parsed.data.passcode, 10)
      : existing?.passcode_hash;
    if (!passcodeHash) {
      return res.status(400).json({ error: 'Set a passcode before turning this on.' });
    }

    const minutes = parsed.data.durationMinutes || DEFAULT_DURATION_MINUTES;
    const expiresAt = Date.now() + minutes * 60 * 1000;

    db.prepare(
      `INSERT INTO guest_access (family_id, enabled, passcode_hash, expires_at, updated_at)
       VALUES (?, 1, ?, ?, datetime('now'))
       ON CONFLICT(family_id) DO UPDATE SET
         enabled = 1, passcode_hash = excluded.passcode_hash,
         expires_at = excluded.expires_at, updated_at = datetime('now')`,
    ).run(familyId, passcodeHash, expiresAt);

    res.json({ enabled: true, expiresAt, open: true });
  } catch (err) {
    next(err);
  }
});

// ─── Parent: a shell into the guest container, for the one-time OAuth ──────
router.post('/admin-ticket', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    await getOrCreateGuestContainer(req.user.familyId);
    const ticket = crypto.randomBytes(32).toString('hex');
    guestWsTickets.set(ticket, {
      kind: 'guest-admin',
      familyId: req.user.familyId,
      expiresAt: Date.now() + 30_000,
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ─── Parent: wipe everything the guests built ──────────────────────────────
router.post('/nuke', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    await nukeGuestWorkspace(familyId);
    db.prepare('DELETE FROM guest_sessions WHERE family_id = ?').run(familyId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Parent: stop the container without deleting anything ─────────────────
router.post('/stop', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    await stopGuestContainer(req.user.familyId);
    res.json({ ok: true, running: false });
  } catch (err) {
    next(err);
  }
});

// ─── Playing the games ─────────────────────────────────────────────────────
// Mounted at /apps/build, BEFORE the kid-apps router — otherwise
// /apps/build/alex/pong/ is read as username "build", app "alex".
//
// These pages are intentionally unauthenticated, matching how kid-built apps
// already work (/apps/:kid/:app is public). What gates them is the window: when
// the workshop closes, the games go dark with everything else. Kids can open
// each other's games — they're in one room sharing one filesystem, and showing
// each other what they made is the point.
// strict:true so /alex/pong and /alex/pong/ are different routes. Without it
// Express collapses them, the no-slash form serves index.html directly, and the
// game's relative `./game.js` then resolves one directory too high. (The apps
// subdomain router does the same thing for the same reason.)
const guestAppsRouter = Router({ strict: true });

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function openFamilyIds() {
  return db
    .prepare('SELECT family_id FROM guest_access WHERE enabled = 1 AND expires_at > ?')
    .all(Date.now())
    .map((r) => r.family_id);
}

// A guest slug alone doesn't say which family it belongs to, so resolve it
// against the families whose window is currently open.
function resolveOpenGuest(slug) {
  const rows = db
    .prepare(`
      SELECT gs.family_id, gs.slug, gs.name
        FROM guest_sessions gs
        JOIN guest_access ga ON ga.family_id = gs.family_id
       WHERE gs.slug = ? AND ga.enabled = 1 AND ga.expires_at > ?
    `)
    .all(slug, Date.now());
  return rows.length === 1 ? rows[0] : null;
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:2rem 1rem;min-height:100vh;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%);color:#e5e7eb}
  .container{max-width:720px;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .25rem}
  .sub{color:#94a3b8;font-size:.9rem;margin:0 0 1.75rem}
  .group{margin-bottom:1.75rem}
  .who{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;
    color:#818cf8;margin:0 0 .6rem}
  .card{display:flex;align-items:center;gap:.9rem;padding:.9rem 1rem;
    margin-bottom:.6rem;border-radius:12px;text-decoration:none;color:inherit;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
  .card:hover{background:rgba(255,255,255,.09)}
  .icon{font-size:1.6rem}
  .title{font-weight:600;text-transform:capitalize}
  .empty{color:#94a3b8;line-height:1.6}
  code{background:rgba(255,255,255,.08);padding:.15rem .4rem;border-radius:4px}
  a.back{display:inline-block;margin-top:1.5rem;color:#818cf8;font-size:.9rem}
</style></head>
<body><div class="container">${body}</div></body></html>`;
}

function appCard(slug, app, showOwnerless) {
  const label = app.replace(/[-_]/g, ' ');
  return `<a class="card" href="/apps/build/${encodeURIComponent(slug)}/${encodeURIComponent(app)}/">
      <span class="icon">🎮</span>
      <span class="title">${escapeHtml(label)}</span>
    </a>`;
}

// Everyone's games in one place. This is what the "Games" button opens.
guestAppsRouter.get('/~games', async (req, res) => {
  const families = openFamilyIds();
  if (families.length !== 1) {
    return res.status(404).send(page('Games', `
      <h1>No workshop is open</h1>
      <p class="empty">Games show up here while the workshop is running.</p>`));
  }
  const familyId = families[0];

  let apps = [];
  try {
    apps = await listGuestApps(familyId);
  } catch { /* container down — render the empty state */ }

  const names = new Map(
    db.prepare('SELECT slug, name FROM guest_sessions WHERE family_id = ?')
      .all(familyId).map((g) => [g.slug, g.name]),
  );

  const bySlug = new Map();
  for (const { slug, app } of apps) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(app);
  }

  const body = bySlug.size === 0
    ? `<h1>Games</h1>
       <p class="sub">Everything built in this workshop.</p>
       <p class="empty">Nothing here yet. Ask Claude to build a game, then come back.<br>
       Tip: a game needs an <code>index.html</code> in its own folder.</p>`
    : `<h1>Games</h1>
       <p class="sub">Everything built in this workshop — play anyone's.</p>
       ${[...bySlug.entries()].map(([slug, list]) => `
         <div class="group">
           <p class="who">${escapeHtml(names.get(slug) || slug)}</p>
           ${list.sort().map((a) => appCard(slug, a)).join('')}
         </div>`).join('')}`;

  res.set('Cache-Control', 'no-store');
  res.send(page('Games', body));
});

// One guest's games — a shareable "here's my stuff" URL.
guestAppsRouter.get('/:name', (req, res) => res.redirect(`/apps/build/${encodeURIComponent(req.params.name)}/`));

guestAppsRouter.get('/:name/', async (req, res) => {
  const guest = resolveOpenGuest(req.params.name);
  if (!guest) return res.status(404).send(page('Not found', '<h1>Nothing here</h1>'));

  let apps = [];
  try {
    apps = (await listGuestApps(guest.family_id)).filter((a) => a.slug === guest.slug);
  } catch { /* container down */ }

  const body = apps.length === 0
    ? `<h1>${escapeHtml(guest.name)}'s games</h1>
       <p class="empty">Nothing built yet.</p>
       <a class="back" href="/apps/build/~games">← All games</a>`
    : `<h1>${escapeHtml(guest.name)}'s games</h1>
       <p class="sub">Tap one to play.</p>
       ${apps.map((a) => a.app).sort().map((a) => appCard(guest.slug, a)).join('')}
       <a class="back" href="/apps/build/~games">← All games</a>`;

  res.set('Cache-Control', 'no-store');
  res.send(page(`${guest.name}'s games`, body));
});

// The games themselves, read straight out of the shared workspace.
async function serveGuestAppFile(req, res) {
  const guest = resolveOpenGuest(req.params.name);
  if (!guest) return res.status(404).send('Not found');

  // The app folder is the boundary, not the workspace: a URL under
  // /alex-b/pong/ may only ever read files under alex-b/pong/. Checking just
  // for a leading `..` isn't enough — `pong/../../CLAUDE.md` normalizes to a
  // path with no `..` left in it and would otherwise be served.
  const appDir = `${guest.slug}/${req.params.app}`;
  const filePath = req.params[0] || 'index.html';
  const relative = path.normalize(path.join(appDir, filePath));
  if (relative !== appDir && !relative.startsWith(`${appDir}/`)) {
    return res.status(400).send('Invalid path');
  }

  try {
    const data = await readGuestContainerFile(guest.family_id, relative);
    res.set('Content-Security-Policy', KID_APP_CSP);
    res.set('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    // Never cache — kids reload constantly while they're still building.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(data);
  } catch {
    res.status(404).send('Not found');
  }
}

guestAppsRouter.get('/:name/:app/', serveGuestAppFile);
guestAppsRouter.get('/:name/:app/*', serveGuestAppFile);
guestAppsRouter.get('/:name/:app', (req, res) => res.redirect(req.originalUrl + '/'));

export { openWindow, guestAppsRouter };
export default router;
