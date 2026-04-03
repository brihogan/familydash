import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// ─── GET /api/family/turns ────────────────────────────────────────────────
router.get('/turns', authenticate, (req, res, next) => {
  try {
    const turns = db.prepare(`
      SELECT * FROM turns WHERE family_id = ? ORDER BY created_at DESC
    `).all(req.user.familyId);

    // Attach members to each turn
    const stmtMembers = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji, u.role
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ?
      ORDER BY tm.position ASC
    `);

    const result = turns.map((t) => ({
      ...t,
      members: stmtMembers.all(t.id),
    }));

    res.json({ turns: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family/turns/visible ─────────────────────────────────────────
// Returns turns visible to the current user for dashboard display
router.get('/turns/visible', authenticate, (req, res, next) => {
  try {
    const { role, familyId } = req.user;
    let turns;
    if (role === 'parent') {
      turns = db.prepare(`
        SELECT * FROM turns WHERE family_id = ? ORDER BY created_at DESC
      `).all(familyId);
    } else {
      turns = db.prepare(`
        SELECT * FROM turns WHERE family_id = ? AND visibility = 'everyone' ORDER BY created_at DESC
      `).all(familyId);
    }

    const stmtCurrent = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ? AND tm.is_current = 1 AND tm.excluded = 0
      LIMIT 1
    `);

    const stmtLastLog = db.prepare(`
      SELECT created_at FROM turn_logs WHERE turn_id = ? ORDER BY created_at DESC LIMIT 1
    `);

    const result = turns.map((t) => ({
      ...t,
      currentMember: stmtCurrent.get(t.id) || null,
      lastLoggedAt: stmtLastLog.get(t.id)?.created_at || null,
    }));

    res.json({ turns: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family/turns/:id ────────────────────────────────────────────
router.get('/turns/:id', authenticate, (req, res, next) => {
  try {
    const turnId = parseInt(req.params.id, 10);
    const turn = db.prepare('SELECT * FROM turns WHERE id = ? AND family_id = ?')
      .get(turnId, req.user.familyId);
    if (!turn) return res.status(404).json({ error: 'Turn not found.' });

    const members = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji, u.role
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ?
      ORDER BY tm.position ASC
    `).all(turnId);

    res.json({ ...turn, members });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/turns ───────────────────────────────────────────────
const TurnSchema = z.object({
  name: z.string().min(1).max(200),
  filter: z.enum(['all', 'kids', 'parents']).default('all'),
  visibility: z.enum(['everyone', 'parents', 'self']).default('everyone'),
});

router.post('/turns', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const body = TurnSchema.parse(req.body);
    const result = db.prepare(`
      INSERT INTO turns (family_id, name, filter, visibility) VALUES (?, ?, ?, ?)
    `).run(req.user.familyId, body.name, body.filter, body.visibility);

    const turn = db.prepare('SELECT * FROM turns WHERE id = ?').get(result.lastInsertRowid);

    // Auto-populate members based on filter
    const filterClause = body.filter === 'kids' ? "AND role = 'kid'"
      : body.filter === 'parents' ? "AND role = 'parent'" : '';
    const users = db.prepare(`
      SELECT id FROM users WHERE family_id = ? ${filterClause} ORDER BY sort_order ASC, id ASC
    `).all(req.user.familyId);

    const insertMember = db.prepare(`
      INSERT INTO turn_members (turn_id, user_id, position, is_current) VALUES (?, ?, ?, ?)
    `);
    users.forEach((u, i) => {
      insertMember.run(turn.id, u.id, i, i === 0 ? 1 : 0);
    });

    const members = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji, u.role
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ?
      ORDER BY tm.position ASC
    `).all(turn.id);

    res.status(201).json({ ...turn, members });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/turns/:id ────────────────────────────────────────────
// Update turn settings (name, filter) and/or member order + current
const TurnUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filter: z.enum(['all', 'kids', 'parents']).optional(),
  visibility: z.enum(['everyone', 'parents', 'self']).optional(),
  members: z.array(z.object({
    user_id: z.number().int(),
    position: z.number().int(),
    is_current: z.boolean().optional(),
    excluded: z.boolean().optional(),
  })).optional(),
});

router.put('/turns/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const turnId = parseInt(req.params.id, 10);
    const turn = db.prepare('SELECT * FROM turns WHERE id = ? AND family_id = ?')
      .get(turnId, req.user.familyId);
    if (!turn) return res.status(404).json({ error: 'Turn not found.' });

    const body = TurnUpdateSchema.parse(req.body);

    const updateTurn = db.transaction(() => {
      // Update turn fields
      const updates = []; const values = [];
      if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
      if (body.filter !== undefined) { updates.push('filter = ?'); values.push(body.filter); }
      if (body.visibility !== undefined) { updates.push('visibility = ?'); values.push(body.visibility); }
      if (updates.length) {
        values.push(turnId);
        db.prepare(`UPDATE turns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }

      // Sync members if provided
      if (body.members) {
        // Delete old members and insert new set
        db.prepare('DELETE FROM turn_members WHERE turn_id = ?').run(turnId);
        const ins = db.prepare(`
          INSERT INTO turn_members (turn_id, user_id, position, is_current, excluded) VALUES (?, ?, ?, ?, ?)
        `);
        for (const m of body.members) {
          ins.run(turnId, m.user_id, m.position, m.is_current ? 1 : 0, m.excluded ? 1 : 0);
        }
      }
    });
    updateTurn();

    // Return updated turn
    const updated = db.prepare('SELECT * FROM turns WHERE id = ?').get(turnId);
    const members = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji, u.role
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ?
      ORDER BY tm.position ASC
    `).all(turnId);

    res.json({ ...updated, members });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/family/turns/:id ─────────────────────────────────────────
router.delete('/turns/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const turnId = parseInt(req.params.id, 10);
    const result = db.prepare('DELETE FROM turns WHERE id = ? AND family_id = ?')
      .run(turnId, req.user.familyId);
    if (!result.changes) return res.status(404).json({ error: 'Turn not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/turns/:id/log ───────────────────────────────────────
// Log the current turn and advance to the next person
router.post('/turns/:id/log', authenticate, (req, res, next) => {
  try {
    const turnId = parseInt(req.params.id, 10);
    const turn = db.prepare('SELECT * FROM turns WHERE id = ? AND family_id = ?')
      .get(turnId, req.user.familyId);
    if (!turn) return res.status(404).json({ error: 'Turn not found.' });

    const activeMembers = db.prepare(`
      SELECT * FROM turn_members WHERE turn_id = ? AND excluded = 0 ORDER BY position ASC
    `).all(turnId);

    const currentIdx = activeMembers.findIndex((m) => m.is_current);
    if (currentIdx === -1) return res.status(400).json({ error: 'No current member set.' });

    const current = activeMembers[currentIdx];
    const nextIdx = (currentIdx + 1) % activeMembers.length;
    const next_ = activeMembers[nextIdx];

    const logTurn = db.transaction(() => {
      // Record the log
      db.prepare('INSERT INTO turn_logs (turn_id, user_id) VALUES (?, ?)')
        .run(turnId, current.user_id);

      // Advance: clear current, set next
      db.prepare('UPDATE turn_members SET is_current = 0 WHERE turn_id = ?').run(turnId);
      db.prepare('UPDATE turn_members SET is_current = 1 WHERE id = ?').run(next_.id);
    });
    logTurn();

    // Return updated state
    const members = db.prepare(`
      SELECT tm.*, u.name, u.avatar_color, u.avatar_emoji, u.role
      FROM turn_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.turn_id = ?
      ORDER BY tm.position ASC
    `).all(turnId);

    const logs = db.prepare(`
      SELECT tl.*, u.name, u.avatar_color, u.avatar_emoji
      FROM turn_logs tl
      JOIN users u ON u.id = tl.user_id
      WHERE tl.turn_id = ?
      ORDER BY tl.created_at DESC
      LIMIT 20
    `).all(turnId);

    res.json({ ...turn, members, logs });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/family/turns/:id/logs ───────────────────────────────────────
router.get('/turns/:id/logs', authenticate, (req, res, next) => {
  try {
    const turnId = parseInt(req.params.id, 10);
    const turn = db.prepare('SELECT * FROM turns WHERE id = ? AND family_id = ?')
      .get(turnId, req.user.familyId);
    if (!turn) return res.status(404).json({ error: 'Turn not found.' });

    const logs = db.prepare(`
      SELECT tl.*, u.name, u.avatar_color, u.avatar_emoji
      FROM turn_logs tl
      JOIN users u ON u.id = tl.user_id
      WHERE tl.turn_id = ?
      ORDER BY tl.created_at DESC
      LIMIT 50
    `).all(turnId);

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
