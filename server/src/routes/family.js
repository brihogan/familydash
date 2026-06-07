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
             u.require_set_approval, u.allow_transfers, u.allow_withdraws, u.require_currency_work, u.chores_enabled, u.allow_login, u.claude_enabled, u.claude_time_limit, u.claude_model, u.public_slug, u.badge_level, u.max_active_badges, u.badge_notify_mode, u.menubar_layout, u.created_at,
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

// ─── GET /api/family/shared-task-sets ───────────────────────────────────────
// Parent-only: task sets that 2+ family members are working on, REGARDLESS of
// level. Badges/awards are grouped by badge_id (a kid at any level counts);
// regular task sets are grouped by their own task_set_id. Each item carries the
// member avatars + a representative (userId, taskSetId) for opening the grid.
router.get('/shared-task-sets', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const fam = req.user.familyId;

    // Badges/awards: one row per (badge, enrolled member). Group by badge_id.
    const badgeRows = db.prepare(`
      SELECT ts.badge_id AS group_id, ts.id AS task_set_id,
             u.id AS user_id, u.name AS user_name, u.avatar_color, u.avatar_emoji,
             b.name AS title, b.emoji, b.image_file, b.is_award
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id AND ts.is_active = 1 AND ts.badge_id IS NOT NULL
      JOIN users    u  ON u.id = ta.user_id AND u.family_id = ? AND u.is_active = 1
      JOIN badges   b  ON b.id = ts.badge_id
      WHERE ta.is_active = 1 AND ta.archived_at IS NULL
      ORDER BY b.name COLLATE NOCASE ASC
    `).all(fam);

    // Regular sets: one row per (set, assignee). Group by task_set_id.
    const setRows = db.prepare(`
      SELECT ts.id AS group_id, ts.id AS task_set_id,
             u.id AS user_id, u.name AS user_name, u.avatar_color, u.avatar_emoji,
             ts.name AS title, ts.emoji
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id AND ts.is_active = 1 AND ts.badge_id IS NULL
      JOIN users    u  ON u.id = ta.user_id AND u.family_id = ? AND u.is_active = 1
      WHERE ta.is_active = 1 AND ta.archived_at IS NULL
      ORDER BY ts.name COLLATE NOCASE ASC
    `).all(fam);

    const groups = new Map(); // key -> item
    const collect = (rows, kind) => {
      for (const r of rows) {
        const key = `${kind}:${r.group_id}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            kind,
            id: r.group_id,
            title: r.title,
            emoji: r.emoji || null,
            image_file: kind === 'badge' ? (r.image_file || null) : null,
            is_award: kind === 'badge' ? r.is_award === 1 : false,
            // representative target for opening the grid
            repUserId: r.user_id,
            repTaskSetId: r.task_set_id,
            members: [],
            _seen: new Set(),
          };
          groups.set(key, g);
        }
        if (!g._seen.has(r.user_id)) {
          g._seen.add(r.user_id);
          g.members.push({ id: r.user_id, name: r.user_name, avatar_color: r.avatar_color, avatar_emoji: r.avatar_emoji });
        }
      }
    };
    collect(badgeRows, 'badge');
    collect(setRows, 'set');

    // Pinned items (per family) sort to the top.
    const pinned = new Set(
      db.prepare('SELECT kind, ref_id FROM shared_task_set_pins WHERE family_id = ?').all(fam).map((r) => `${r.kind}:${r.ref_id}`),
    );

    const items = [...groups.values()]
      .filter((g) => g.members.length >= 2)
      .map(({ _seen, ...g }) => ({ ...g, memberCount: g.members.length, pinned: pinned.has(`${g.kind}:${g.id}`) }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.is_award !== b.is_award) return a.is_award ? -1 : 1;
        return a.title.localeCompare(b.title);
      });

    res.json({ taskSets: items });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/shared-pins ───────────────────────────────────────────
// Pin/unpin a shared task set for the family (parent only). { kind, refId, pinned }
router.post('/shared-pins', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const kind = req.body?.kind;
    const refId = parseInt(req.body?.refId, 10);
    const pinned = req.body?.pinned === true;
    if ((kind !== 'badge' && kind !== 'set') || !Number.isFinite(refId)) {
      return res.status(400).json({ error: 'kind and refId are required.' });
    }
    if (pinned) {
      db.prepare('INSERT OR IGNORE INTO shared_task_set_pins (family_id, kind, ref_id) VALUES (?, ?, ?)').run(req.user.familyId, kind, refId);
    } else {
      db.prepare('DELETE FROM shared_task_set_pins WHERE family_id = ? AND kind = ? AND ref_id = ?').run(req.user.familyId, kind, refId);
    }
    res.json({ pinned });
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

// ─── PATCH /api/family/users/:id/menubar ──────────────────────────────────────
// Self-or-parent: update which item keys occupy the mobile bottom-bar's
// primary slots. Stored as JSON {"primary":[key,...]}. Server doesn't
// validate keys against any whitelist — the client self-heals stale keys.

const MenubarSchema = z.object({
  primary: z.array(z.string().min(1).max(40)).max(8),
});

router.patch('/users/:id/menubar', authenticate, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const target = db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(userId, req.user.familyId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { primary } = MenubarSchema.parse(req.body);
    const json = JSON.stringify({ primary });
    db.prepare('UPDATE users SET menubar_layout = ? WHERE id = ?').run(json, userId);
    res.json({ ok: true, menubar_layout: { primary } });
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
  claude_model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
  badge_level: z.enum(['preschool', 'level1', 'level2', 'level3', 'level4', 'level5']).nullable().optional(),
  max_active_badges: z.number().int().min(1).max(50).optional(),
  badge_notify_mode: z.enum(['off', 'each_step', 'on_completion']).optional(),
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
      // Auto-assign a public slug when enabling Claude Code
      if (body.claude_enabled && !target.public_slug) {
        const slugWords = ['fox','owl','elk','jay','ace','arc','bay','cub','dew','elm','fin','gem','haze','ice','jet','koi','lark','mist','neon','opal','pine','reef','star','tide','wolf','yak','zap','bolt','cove','dart','echo','fern','glow','hawk','iris','jade','kelp','lynx','moth','nova','onyx','puma','sage','tusk','vale','wren','zinc'];
        const taken = new Set(db.prepare('SELECT public_slug FROM users WHERE public_slug IS NOT NULL').all().map((r) => r.public_slug));
        let slug;
        for (const w of slugWords.sort(() => Math.random() - 0.5)) {
          if (!taken.has(w)) { slug = w; break; }
        }
        if (!slug) { for (let i = 1; !slug; i++) { const c = slugWords[Math.floor(Math.random() * slugWords.length)] + i; if (!taken.has(c)) slug = c; } }
        updates.push('public_slug = ?'); values.push(slug);
      }
    }
    if (body.claude_time_limit !== undefined) {
      updates.push('claude_time_limit = ?'); values.push(body.claude_time_limit);
    }
    if (body.claude_model !== undefined) {
      updates.push('claude_model = ?'); values.push(body.claude_model);
    }
    if (body.badge_level !== undefined) {
      updates.push('badge_level = ?'); values.push(body.badge_level ?? null);
    }
    if (body.max_active_badges !== undefined) {
      updates.push('max_active_badges = ?'); values.push(body.max_active_badges);
    }
    if (body.badge_notify_mode !== undefined) {
      updates.push('badge_notify_mode = ?'); values.push(body.badge_notify_mode);
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
    const family = db.prepare('SELECT use_banking, use_sets, use_tickets, use_badges, trmnl_webhook_url, chores_label, sets_steps_label FROM families WHERE id = ?').get(req.user.familyId);
    if (!family) return res.status(404).json({ error: 'Family not found.' });
    const resp = {
      useBanking: family.use_banking === 1,
      useSets: family.use_sets === 1,
      useTickets: family.use_tickets === 1,
      useBadges: family.use_badges === 1,
      choresLabel: family.chores_label || 'Chores',
      setsStepsLabel: family.sets_steps_label || 'Sets & Steps',
    };
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
    const { use_banking, use_sets, use_tickets, use_badges, trmnl_webhook_url, chores_label, sets_steps_label } = req.body;
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
    if (use_badges !== undefined) {
      db.prepare('UPDATE families SET use_badges = ? WHERE id = ?')
        .run(use_badges ? 1 : 0, req.user.familyId);
    }
    if (trmnl_webhook_url !== undefined) {
      db.prepare('UPDATE families SET trmnl_webhook_url = ? WHERE id = ?')
        .run(trmnl_webhook_url || null, req.user.familyId);
    }
    if (chores_label !== undefined) {
      const cleaned = String(chores_label).trim().slice(0, 40) || 'Chores';
      db.prepare('UPDATE families SET chores_label = ? WHERE id = ?')
        .run(cleaned, req.user.familyId);
    }
    if (sets_steps_label !== undefined) {
      const cleaned = String(sets_steps_label).trim().slice(0, 40) || 'Sets & Steps';
      db.prepare('UPDATE families SET sets_steps_label = ? WHERE id = ?')
        .run(cleaned, req.user.familyId);
    }
    const family = db.prepare('SELECT use_banking, use_sets, use_tickets, use_badges, trmnl_webhook_url, chores_label, sets_steps_label FROM families WHERE id = ?').get(req.user.familyId);
    res.json({
      useBanking: family.use_banking === 1,
      useSets: family.use_sets === 1,
      useTickets: family.use_tickets === 1,
      useBadges: family.use_badges === 1,
      trmnlWebhookUrl: family.trmnl_webhook_url || '',
      choresLabel: family.chores_label || 'Chores',
      setsStepsLabel: family.sets_steps_label || 'Sets & Steps',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
