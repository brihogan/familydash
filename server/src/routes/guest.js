import { Router } from 'express';
import { z } from 'zod';
import crypto, { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getOrCreateGuestContainer,
  getGuestContainerStatus,
  nukeGuestWorkspace,
  stopGuestContainer,
  listGuestFolders,
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

export { openWindow };
export default router;
