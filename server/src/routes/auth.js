import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  hashPassword,
  comparePassword,
  hashPin,
  comparePin,
} from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const REFRESH_COOKIE = 'refreshToken';
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost'];
const BASE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Previously this hard-coded `secure: process.env.NODE_ENV === 'production'`,
// which meant production builds always asked the browser for a Secure
// cookie. That's correct behind Cloudflare at dash.straychips.com (HTTPS),
// but breaks on the LAN at http://miniserver.local:3001 — browsers silently
// drop Secure cookies over plain HTTP, leaving the refresh token unset and
// every subsequent /auth/refresh call returns 401.
//
// `trust proxy` is on (see app.js), so `req.secure` honors X-Forwarded-Proto
// from Cloudflare for the HTTPS hostname while staying false for direct LAN
// HTTP requests. That gives us the right answer in both environments
// without any manual host sniffing.
function getCookieOpts(req) {
  const origin = req.headers.origin;
  if (origin && CAPACITOR_ORIGINS.includes(origin)) {
    return { ...BASE_COOKIE_OPTS, sameSite: 'none', secure: true };
  }
  return { ...BASE_COOKIE_OPTS, secure: !!req.secure };
}

function issueTokens(res, req, payload, remember = true) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store hashed refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, remember)
    VALUES (?, ?, ?, ?)
  `).run(payload.userId, hashToken(refreshToken), expiresAt, remember ? 1 : 0);

  const cookieOpts = getCookieOpts(req);
  if (!remember) delete cookieOpts.maxAge; // session cookie — expires when browser closes

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);

  // Set a non-httpOnly name cookie readable by the multiplayer SDK on the apps
  // subdomain. domain=.straychips.com makes it available across subdomains.
  const appsHost = process.env.APPS_HOST || '';
  if (appsHost && payload.name) {
    const rootDomain = appsHost.replace(/^[^.]+/, ''); // ".straychips.com"
    res.cookie('mp_name', payload.name.split(' ')[0], {
      domain: rootDomain,
      path: '/',
      sameSite: 'lax',
      secure: !!req.secure,
      httpOnly: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  return { accessToken, refreshToken };
}

// ─── Register ──────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  familyName: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/register', async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await hashPassword(body.password);

    const registerTx = db.transaction(() => {
      const family = db.prepare('INSERT INTO families (name) VALUES (?)').run(body.familyName);
      const familyId = family.lastInsertRowid;

      const user = db.prepare(`
        INSERT INTO users (family_id, name, email, password_hash, role, show_on_dashboard)
        VALUES (?, ?, ?, ?, 'parent', 0)
      `).run(familyId, body.name, body.email, passwordHash);
      const userId = user.lastInsertRowid;

      db.prepare(`
        INSERT INTO accounts (user_id, name, type, sort_order)
        VALUES (?, 'Checking', 'main', 0)
      `).run(userId);

      return { familyId, userId };
    });

    const { familyId, userId } = registerTx();
    const payload = { userId, familyId, role: 'parent', name: body.name, avatarColor: '#6366f1', avatarEmoji: null, isAdmin: false };
    const { accessToken, refreshToken } = issueTokens(res, req, payload);

    res.status(201).json({ accessToken, refreshToken, user: { id: userId, name: body.name, role: 'parent', familyId } });
  } catch (err) {
    next(err);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────

const LoginSchema = z.union([
  z.object({ email: z.string().email(), password: z.string(), rememberMe: z.boolean().optional() }),
  z.object({ username: z.string(), pin: z.string().regex(/^\d{4}$/), rememberMe: z.boolean().optional() }),
]);

router.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    let user;

    if ('email' in body) {
      user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(body.email);
      if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
      const valid = await comparePassword(body.password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    } else {
      user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1').get(body.username);
      if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
      if (!user.allow_login) return res.status(403).json({ error: 'Login is not enabled for this account.' });
      const valid = await comparePin(body.pin, user.pin_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = { userId: user.id, familyId: user.family_id, role: user.role, name: user.name, avatarColor: user.avatar_color, avatarEmoji: user.avatar_emoji || null, isAdmin: !!user.is_admin };
    const { accessToken, refreshToken } = issueTokens(res, req, payload, body.rememberMe !== false);

    // Log the login event
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    db.prepare('INSERT INTO login_logs (user_id, family_id, ip_address, user_agent) VALUES (?, ?, ?, ?)').run(user.id, user.family_id, ip, ua);

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role, familyId: user.family_id, avatarColor: user.avatar_color },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Refresh ───────────────────────────────────────────────────────────────

router.post('/refresh', (req, res, next) => {
  try {
    // Accept refresh token from cookie (browser) OR request body (native apps)
    const rawToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (!rawToken) return res.status(401).json({ error: 'No refresh token.' });

    const payload = verifyRefreshToken(rawToken);
    if (!payload) return res.status(401).json({ error: 'Invalid refresh token.' });

    const tokenHash = hashToken(rawToken);
    const stored = db.prepare(`
      SELECT id, remember FROM refresh_tokens
      WHERE token_hash = ? AND expires_at > datetime('now')
    `).get(tokenHash);
    if (!stored) return res.status(401).json({ error: 'Refresh token not found or expired.' });

    // Rotate: delete old token
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);

    // Look up current name/color in case it changed since the token was issued
    const userRecord = db.prepare('SELECT name, avatar_color, avatar_emoji, is_admin FROM users WHERE id = ? AND is_active = 1').get(payload.userId);
    if (!userRecord) return res.status(401).json({ error: 'User not found.' });

    const newPayload = { userId: payload.userId, familyId: payload.familyId, role: payload.role, name: userRecord.name, avatarColor: userRecord.avatar_color, avatarEmoji: userRecord.avatar_emoji || null, isAdmin: !!userRecord.is_admin };
    const { accessToken, refreshToken } = issueTokens(res, req, newPayload, !!stored.remember);

    res.json({ accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────

router.post('/logout', authenticate, (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (rawToken) {
      db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(rawToken));
    }
    const opts = getCookieOpts(req);
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: opts.secure, sameSite: opts.sameSite, path: '/' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
