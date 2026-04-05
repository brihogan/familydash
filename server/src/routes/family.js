import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { hashPassword, hashPin } from '../services/authService.js';

const EmojiSchema = z.object({
  avatar_emoji: z.string().max(10).nullable(),
});

const router = Router();

// ─── GET /api/family/accounts ─────────────────────────────────────────────
// All active accounts for all family members — any authenticated member can
// call this (needed so kids can pick a transfer destination).

router.get('/accounts', authenticate, (req, res, next) => {
  try {
    const accounts = db.prepare(`
      SELECT a.*, u.name AS owner_name, u.role AS owner_role,
             u.avatar_color AS owner_avatar_color, u.avatar_emoji AS owner_avatar_emoji
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE u.family_id = ? AND u.is_active = 1 AND a.is_active = 1
      ORDER BY u.name ASC, a.sort_order ASC, a.id ASC
    `).all(req.user.familyId);
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family ───────────────────────────────────────────────────────

router.get('/', authenticate, (req, res, next) => {
  try {
    const family = db.prepare('SELECT id, name, claude_access, created_at FROM families WHERE id = ?').get(req.user.familyId);
    const members = db.prepare(`
      SELECT u.id, u.name, u.username, u.email, u.role, u.avatar_color, u.avatar_emoji, u.ticket_balance,
             u.is_active, u.sort_order, u.show_on_dashboard, u.show_balance_on_dashboard, u.require_task_approval,
             u.require_set_approval, u.allow_transfers, u.allow_withdraws, u.require_currency_work, u.chores_enabled, u.allow_login, u.claude_enabled, u.claude_time_limit, u.created_at,
             COALESCE(ct.daily_potential, 0) AS daily_ticket_potential
      FROM users u
      LEFT JOIN (
        SELECT user_id,
          CAST(ROUND(SUM(ticket_reward * (
            CASE WHEN days_of_week &  1 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week &  2 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week &  4 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week &  8 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week & 16 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week & 32 THEN 1 ELSE 0 END +
            CASE WHEN days_of_week & 64 THEN 1 ELSE 0 END
          )) / 7.0) AS INTEGER) AS daily_potential
        FROM chore_templates WHERE is_active = 1 GROUP BY user_id
      ) ct ON ct.user_id = u.id
      WHERE u.family_id = ? ORDER BY u.sort_order ASC, u.role DESC, u.name ASC
    `).all(req.user.familyId);
    res.json({ family, members });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/users ────────────────────────────────────────────────

const AddUserSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('kid'),
    name: z.string().min(1).max(100),
    allowLogin: z.boolean().optional(),
    username: z.string().min(1).max(50).optional(),
    pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits').optional(),
    avatarColor: z.string().optional(),
    avatarEmoji: z.string().max(10).nullable().optional(),
  }),
  z.object({
    role: z.literal('parent'),
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    avatarColor: z.string().optional(),
    avatarEmoji: z.string().max(10).nullable().optional(),
  }),
]);

router.post('/users', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    const body = AddUserSchema.parse(req.body);

    if (body.role === 'kid') {
      const allowLogin = body.allowLogin !== false && body.username && body.pin;
      let usernameVal = null;
      let pinHash = null;

      if (allowLogin) {
        if (!body.username || !body.pin) return res.status(400).json({ error: 'Username and PIN are required when login is enabled.' });
        const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(body.username);
        if (exists) return res.status(409).json({ error: 'Username already taken.' });
        usernameVal = body.username;
        pinHash = await hashPin(body.pin);
      }

      const result = db.prepare(`
        INSERT INTO users (family_id, name, username, pin_hash, role, avatar_color, avatar_emoji, allow_login)
        VALUES (?, ?, ?, ?, 'kid', ?, ?, ?)
      `).run(req.user.familyId, body.name, usernameVal, pinHash, body.avatarColor || '#6366f1', body.avatarEmoji ?? null, allowLogin ? 1 : 0);
      const userId = result.lastInsertRowid;

      db.prepare(`INSERT INTO accounts (user_id, name, type, sort_order) VALUES (?, 'Checking', 'main', 0)`).run(userId);

      const user = db.prepare('SELECT id, name, username, role, avatar_color FROM users WHERE id = ?').get(userId);
      return res.status(201).json(user);
    }

    if (body.role === 'parent') {
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
      if (exists) return res.status(409).json({ error: 'Email already registered.' });

      const passwordHash = await hashPassword(body.password);
      const result = db.prepare(`
        INSERT INTO users (family_id, name, email, password_hash, role, avatar_color, show_on_dashboard, avatar_emoji, chores_enabled)
        VALUES (?, ?, ?, ?, 'parent', ?, 0, ?, 0)
      `).run(req.user.familyId, body.name, body.email, passwordHash, body.avatarColor || '#6366f1', body.avatarEmoji ?? null);
      const userId = result.lastInsertRowid;

      db.prepare(`INSERT INTO accounts (user_id, name, type, sort_order) VALUES (?, 'Checking', 'main', 0)`).run(userId);

      const user = db.prepare('SELECT id, name, email, role, avatar_color, show_on_dashboard, show_balance_on_dashboard FROM users WHERE id = ?').get(userId);
      return res.status(201).json(user);
    }
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/family/users/:id/emoji ────────────────────────────────────────
// Any authenticated user can update their own emoji; parents can update anyone in the family.

router.patch('/users/:id/emoji', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const target = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { avatar_emoji } = EmojiSchema.parse(req.body);
    db.prepare('UPDATE users SET avatar_emoji = ? WHERE id = ?').run(avatar_emoji, userId);
    res.json({ ok: true, avatar_emoji });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/family/users/:id/color ────────────────────────────────────────
// Any authenticated user can update their own color; parents can update anyone in the family.

const ColorSchema = z.object({
  avatar_color: z.string().min(4).max(20),
});

router.patch('/users/:id/color', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const target = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { avatar_color } = ColorSchema.parse(req.body);
    db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(avatar_color, userId);
    res.json({ ok: true, avatar_color });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/users/reorder ────────────────────────────────────────────
// Body: { order: [userId, userId, ...] } — full ordered list of active user ids.
// Must be placed BEFORE /:id to avoid the param swallowing "reorder".

router.put('/users/reorder', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'order must be a non-empty array of user ids.' });
    }

    const update = db.prepare(
      'UPDATE users SET sort_order = ? WHERE id = ? AND family_id = ?'
    );
    const runAll = db.transaction((ids) => {
      ids.forEach((id, idx) => update.run(idx, id, req.user.familyId));
    });
    runAll(order);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/users/:id ─────────────────────────────────────────────

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarColor: z.string().optional(),
  username: z.string().min(1).max(50).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  show_on_dashboard: z.boolean().optional(),
  show_balance_on_dashboard: z.boolean().optional(),
  require_task_approval: z.boolean().optional(),
  require_set_approval: z.enum(['none', 'step', 'set']).optional(),
  allow_transfers: z.boolean().optional(),
  allow_withdraws: z.boolean().optional(),
  require_currency_work: z.boolean().optional(),
  chores_enabled: z.boolean().optional(),
  allow_login: z.boolean().optional(),
  avatar_emoji: z.string().max(10).nullable().optional(),
  is_active: z.boolean().optional(),
  claude_enabled: z.boolean().optional(),
  claude_time_limit: z.number().int().min(5).max(480).optional(),
}).strict();

router.put('/users/:id', authenticate, requireRole('parent'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const body = UpdateUserSchema.parse(req.body);
    const updates = [];
    const values = [];

    if (body.name) { updates.push('name = ?'); values.push(body.name); }
    if (body.avatarColor) { updates.push('avatar_color = ?'); values.push(body.avatarColor); }
    if (body.username && target.role === 'kid') {
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(body.username, userId);
      if (exists) return res.status(409).json({ error: 'Username already taken.' });
      updates.push('username = ?'); values.push(body.username);
    }
    if (body.pin && target.role === 'kid') {
      const pinHash = await hashPin(body.pin);
      updates.push('pin_hash = ?'); values.push(pinHash);
    }
    if (body.email && target.role === 'parent') {
      const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(body.email, userId);
      if (exists) return res.status(409).json({ error: 'Email already in use.' });
      updates.push('email = ?'); values.push(body.email);
    }
    if (body.password && target.role === 'parent') {
      const passwordHash = await hashPassword(body.password);
      updates.push('password_hash = ?'); values.push(passwordHash);
    }
    if (body.show_on_dashboard !== undefined) {
      updates.push('show_on_dashboard = ?'); values.push(body.show_on_dashboard ? 1 : 0);
    }
    if (body.show_balance_on_dashboard !== undefined) {
      updates.push('show_balance_on_dashboard = ?'); values.push(body.show_balance_on_dashboard ? 1 : 0);
    }
    if (body.require_task_approval !== undefined) {
      updates.push('require_task_approval = ?'); values.push(body.require_task_approval ? 1 : 0);
    }
    if (body.require_set_approval !== undefined) {
      updates.push('require_set_approval = ?'); values.push(body.require_set_approval);
    }
    if (body.allow_transfers !== undefined) {
      updates.push('allow_transfers = ?'); values.push(body.allow_transfers ? 1 : 0);
    }
    if (body.allow_withdraws !== undefined) {
      updates.push('allow_withdraws = ?'); values.push(body.allow_withdraws ? 1 : 0);
    }
    if (body.require_currency_work !== undefined) {
      updates.push('require_currency_work = ?'); values.push(body.require_currency_work ? 1 : 0);
    }
    if (body.chores_enabled !== undefined) {
      updates.push('chores_enabled = ?'); values.push(body.chores_enabled ? 1 : 0);
    }
    if (body.allow_login !== undefined) {
      updates.push('allow_login = ?'); values.push(body.allow_login ? 1 : 0);
    }
    if (body.is_active !== undefined) {
      if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot change your own active status.' });
      updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0);
    }
    if (body.avatar_emoji !== undefined) {
      updates.push('avatar_emoji = ?'); values.push(body.avatar_emoji ?? null);
    }
    if (body.claude_enabled !== undefined) {
      updates.push('claude_enabled = ?'); values.push(body.claude_enabled ? 1 : 0);
    }
    if (body.claude_time_limit !== undefined) {
      updates.push('claude_time_limit = ?'); values.push(body.claude_time_limit);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT id, name, username, email, role, avatar_color, show_on_dashboard, show_balance_on_dashboard
      FROM users WHERE id = ?
    `).get(userId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/family/users/:id ─────────────────────────────────────────

router.delete('/users/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot deactivate yourself.' });

    const target = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/family/users/:id/permanent ───────────────────────────────
// Hard-deletes the user and all associated data. Requires parent role.

const permanentDeleteUser = db.transaction((userId, familyId) => {
  // 1. Remove activity_feed rows where this user is the actor (not cascaded)
  db.prepare('DELETE FROM activity_feed WHERE actor_user_id = ?').run(userId);
  // 2. Remove transactions in OTHER users' accounts created by this user (not cascaded)
  db.prepare(`
    DELETE FROM transactions
    WHERE created_by_user_id = ?
    AND account_id NOT IN (SELECT id FROM accounts WHERE user_id = ?)
  `).run(userId, userId);
  // 3. Delete the user — ON DELETE CASCADE handles everything else:
  //    accounts → transactions, recurring_rules
  //    chore_templates → chore_logs
  //    ticket_ledger, reward_redemptions, task_assignments,
  //    task_step_completions, refresh_tokens, activity_feed (subject)
  db.prepare('DELETE FROM users WHERE id = ? AND family_id = ?').run(userId, familyId);
});

router.delete('/users/:id/permanent', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot delete yourself.' });

    const target = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    permanentDeleteUser(userId, req.user.familyId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family/settings ─────────────────────────────────────────────
// Any authenticated family member can read settings.

router.get('/settings', authenticate, (req, res, next) => {
  try {
    const family = db.prepare('SELECT use_banking, use_sets, use_tickets, trmnl_webhook_url FROM families WHERE id = ?').get(req.user.familyId);
    if (!family) return res.status(404).json({ error: 'Family not found.' });
    const resp = { useBanking: family.use_banking === 1, useSets: family.use_sets === 1, useTickets: family.use_tickets === 1 };
    if (req.user.role === 'parent') resp.trmnlWebhookUrl = family.trmnl_webhook_url || '';
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/family/settings ───────────────────────────────────────────
// Parent-only: update family-wide feature flags.

router.patch('/settings', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const { use_banking, use_sets, use_tickets, trmnl_webhook_url } = req.body;
    if (use_banking !== undefined) {
      db.prepare('UPDATE families SET use_banking = ? WHERE id = ?')
        .run(use_banking ? 1 : 0, req.user.familyId);
    }
    if (use_sets !== undefined) {
      db.prepare('UPDATE families SET use_sets = ? WHERE id = ?')
        .run(use_sets ? 1 : 0, req.user.familyId);
    }
    if (use_tickets !== undefined) {
      db.prepare('UPDATE families SET use_tickets = ? WHERE id = ?')
        .run(use_tickets ? 1 : 0, req.user.familyId);
    }
    if (trmnl_webhook_url !== undefined) {
      db.prepare('UPDATE families SET trmnl_webhook_url = ? WHERE id = ?')
        .run(trmnl_webhook_url || null, req.user.familyId);
    }
    const family = db.prepare('SELECT use_banking, use_sets, use_tickets, trmnl_webhook_url FROM families WHERE id = ?').get(req.user.familyId);
    res.json({ useBanking: family.use_banking === 1, useSets: family.use_sets === 1, useTickets: family.use_tickets === 1, trmnlWebhookUrl: family.trmnl_webhook_url || '' });
  } catch (err) {
    next(err);
  }
});

export default router;
