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
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function issueTokens(res, payload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store hashed refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(payload.userId, hashToken(refreshToken), expiresAt);

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
  return accessToken;
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
    const payload = { userId, familyId, role: 'parent', name: body.name, avatarColor: '#6366f1', avatarEmoji: null };
    const accessToken = issueTokens(res, payload);

    res.status(201).json({ accessToken, user: { id: userId, name: body.name, role: 'parent', familyId } });
  } catch (err) {
    next(err);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────

const LoginSchema = z.union([
  z.object({ email: z.string().email(), password: z.string() }),
  z.object({ username: z.string(), pin: z.string().regex(/^\d{4}$/) }),
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
      user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(body.username);
      if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
      const valid = await comparePin(body.pin, user.pin_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = { userId: user.id, familyId: user.family_id, role: user.role, name: user.name, avatarColor: user.avatar_color, avatarEmoji: user.avatar_emoji || null };
    const accessToken = issueTokens(res, payload);

    res.json({
      accessToken,
      user: { id: user.id, name: user.name, role: user.role, familyId: user.family_id, avatarColor: user.avatar_color },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Refresh ───────────────────────────────────────────────────────────────

router.post('/refresh', (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) return res.status(401).json({ error: 'No refresh token.' });

    const payload = verifyRefreshToken(rawToken);
    if (!payload) return res.status(401).json({ error: 'Invalid refresh token.' });

    const tokenHash = hashToken(rawToken);
    const stored = db.prepare(`
      SELECT id FROM refresh_tokens
      WHERE token_hash = ? AND expires_at > datetime('now')
    `).get(tokenHash);
    if (!stored) return res.status(401).json({ error: 'Refresh token not found or expired.' });

    // Rotate: delete old token
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);

    // Look up current name/color in case it changed since the token was issued
    const userRecord = db.prepare('SELECT name, avatar_color, avatar_emoji FROM users WHERE id = ? AND is_active = 1').get(payload.userId);
    if (!userRecord) return res.status(401).json({ error: 'User not found.' });

    const newPayload = { userId: payload.userId, familyId: payload.familyId, role: payload.role, name: userRecord.name, avatarColor: userRecord.avatar_color, avatarEmoji: userRecord.avatar_emoji || null };
    const accessToken = issueTokens(res, newPayload);

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────

router.post('/logout', authenticate, (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(rawToken));
    }
    res.clearCookie(REFRESH_COOKIE);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
