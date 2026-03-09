import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TaskSetSchema = z.object({
  name:          z.string().min(1).max(200),
  type:          z.enum(['Award', 'Project']),
  emoji:         z.string().max(10).nullable().optional(),
  description:   z.string().max(1000).default(''),
  category:      z.string().max(100).default('').transform((s) => s.trim()),
  ticket_reward: z.number().int().min(0).default(0),
});

const StepSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(500).default(''),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRow(row) {
  return row;
}

function assertSetInFamily(setId, familyId) {
  const ts = db.prepare(
    'SELECT id FROM task_sets WHERE id = ? AND family_id = ? AND is_active = 1'
  ).get(setId, familyId);
  if (!ts) { const e = new Error('Task set not found.'); e.status = 404; throw e; }
  return ts;
}

// ─── Task-set routes ──────────────────────────────────────────────────────────

// GET /api/family/task-sets
router.get('/task-sets', authenticate, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT ts.*,
        (SELECT COUNT(*) FROM task_steps       WHERE task_set_id = ts.id AND is_active = 1)                    AS step_count,
        (SELECT COUNT(*) FROM task_assignments ta
         JOIN users u ON u.id = ta.user_id
         WHERE ta.task_set_id = ts.id AND ta.is_active = 1
           AND (u.role = 'kid' OR u.chores_enabled = 1)) AS assignment_count
      FROM task_sets ts
      WHERE ts.family_id = ? AND ts.is_active = 1
      ORDER BY ts.name ASC
    `).all(req.user.familyId);
    res.json({ taskSets: rows.map(parseRow) });
  } catch (err) { next(err); }
});

// GET /api/family/task-sets/:id
router.get('/task-sets/:id', authenticate, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare(
      'SELECT * FROM task_sets WHERE id = ? AND family_id = ? AND is_active = 1'
    ).get(id, req.user.familyId);
    if (!row) return res.status(404).json({ error: 'Task set not found.' });

    const steps = db.prepare(
      'SELECT * FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC'
    ).all(id);

    res.json({ taskSet: parseRow(row), steps });
  } catch (err) { next(err); }
});

// POST /api/family/task-sets
router.post('/task-sets', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const body = TaskSetSchema.parse(req.body);
    const result = db.prepare(
      'INSERT INTO task_sets (family_id, name, type, emoji, description, category, ticket_reward) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.familyId, body.name, body.type, body.emoji ?? null, body.description, body.category, body.ticket_reward);
    res.status(201).json(parseRow(db.prepare('SELECT * FROM task_sets WHERE id = ?').get(result.lastInsertRowid)));
  } catch (err) { next(err); }
});

// PUT /api/family/task-sets/:id
router.put('/task-sets/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    assertSetInFamily(id, req.user.familyId);

    const body = TaskSetSchema.partial().parse(req.body);
    const updates = []; const values = [];
    if (body.name          !== undefined) { updates.push('name = ?');          values.push(body.name); }
    if (body.type          !== undefined) { updates.push('type = ?');          values.push(body.type); }
    if (body.emoji         !== undefined) { updates.push('emoji = ?');         values.push(body.emoji ?? null); }
    if (body.description   !== undefined) { updates.push('description = ?');   values.push(body.description); }
    if (body.category      !== undefined) { updates.push('category = ?');      values.push(body.category); }
    if (body.ticket_reward !== undefined) { updates.push('ticket_reward = ?'); values.push(body.ticket_reward); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(id);
    db.prepare(`UPDATE task_sets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(parseRow(db.prepare('SELECT * FROM task_sets WHERE id = ?').get(id)));
  } catch (err) { next(err); }
});

// DELETE /api/family/task-sets/:id
router.delete('/task-sets/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = db.prepare(
      'UPDATE task_sets SET is_active = 0 WHERE id = ? AND family_id = ?'
    ).run(id, req.user.familyId);
    if (!result.changes) return res.status(404).json({ error: 'Task set not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Assignment routes (parent-only) ──────────────────────────────────────────

// GET /api/family/task-sets/:id/assignments
router.get('/task-sets/:id/assignments', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    assertSetInFamily(id, req.user.familyId);
    const rows = db.prepare(`
      SELECT ta.user_id, COUNT(tsc.id) AS completed_count
      FROM task_assignments ta
      LEFT JOIN task_step_completions tsc
        ON tsc.task_set_id = ta.task_set_id AND tsc.user_id = ta.user_id
      WHERE ta.task_set_id = ? AND ta.is_active = 1
      GROUP BY ta.user_id
    `).all(id);
    res.json({
      assignedUserIds:  rows.map((r) => r.user_id),
      completionCounts: Object.fromEntries(rows.map((r) => [r.user_id, r.completed_count])),
    });
  } catch (err) { next(err); }
});

// PUT /api/family/task-sets/:id/assignments
router.put('/task-sets/:id/assignments', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    assertSetInFamily(id, req.user.familyId);

    const { userIds } = z.object({ userIds: z.array(z.number().int().positive()) }).parse(req.body);

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const validUsers = db.prepare(
        `SELECT id FROM users WHERE id IN (${placeholders}) AND family_id = ? AND is_active = 1`
      ).all(...userIds, req.user.familyId);
      if (validUsers.length !== userIds.length) {
        return res.status(400).json({ error: 'Invalid user IDs.' });
      }
    }

    // Capture who is currently assigned before making changes
    const prevAssigned = db.prepare(
      'SELECT user_id FROM task_assignments WHERE task_set_id = ? AND is_active = 1'
    ).all(id).map((r) => r.user_id);

    const upsert = db.prepare(`
      INSERT INTO task_assignments (task_set_id, user_id, assigned_by, is_active)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(task_set_id, user_id) DO UPDATE SET
        is_active = 1, assigned_by = excluded.assigned_by, assigned_at = datetime('now')
    `);
    const applyAssignments = db.transaction((ids) => {
      // Deactivate all current, then upsert the new set
      db.prepare('UPDATE task_assignments SET is_active = 0 WHERE task_set_id = ?').run(id);
      for (const uid of ids) upsert.run(id, uid, req.user.userId);
      // Delete step completions for any users who were removed
      const removedIds = prevAssigned.filter((uid) => !ids.includes(uid));
      if (removedIds.length > 0) {
        const ph = removedIds.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM task_step_completions WHERE task_set_id = ? AND user_id IN (${ph})`
        ).run(id, ...removedIds);
      }
    });
    applyAssignments(userIds);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/family/task-sets/:id/history
router.get('/task-sets/:id/history', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    assertSetInFamily(id, req.user.familyId);

    const rows = db.prepare(`
      SELECT
        'assigned'        AS event_type,
        ta.assigned_at    AS created_at,
        ta.user_id,
        u.name            AS user_name,
        u.avatar_color,
        u.avatar_emoji,
        COALESCE(ab.name, '?') AS actor_name,
        ta.is_active,
        NULL              AS amount_cents
      FROM task_assignments ta
      JOIN  users u  ON u.id  = ta.user_id
      LEFT JOIN users ab ON ab.id = ta.assigned_by
      WHERE ta.task_set_id = ?

      UNION ALL

      SELECT
        af.event_type,
        af.created_at,
        af.subject_user_id AS user_id,
        u.name             AS user_name,
        u.avatar_color,
        u.avatar_emoji,
        actor.name         AS actor_name,
        NULL               AS is_active,
        af.amount_cents
      FROM activity_feed af
      JOIN users u     ON u.id     = af.subject_user_id
      JOIN users actor ON actor.id = af.actor_user_id
      WHERE af.reference_id    = ?
        AND af.reference_type  = 'task_set'
        AND af.event_type IN ('taskset_completed', 'taskset_uncompleted', 'taskset_reset')

      ORDER BY created_at DESC
    `).all(id, id);

    res.json({ history: rows });
  } catch (err) { next(err); }
});

// ─── Step routes ──────────────────────────────────────────────────────────────

// PATCH /api/family/task-sets/:id/steps/reorder
router.patch('/task-sets/:id/steps/reorder', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const setId = parseInt(req.params.id, 10);
    assertSetInFamily(setId, req.user.familyId);
    const { order } = z.object({
      order: z.array(z.object({ id: z.number().int().positive(), sort_order: z.number().int() })),
    }).parse(req.body);
    const update = db.prepare('UPDATE task_steps SET sort_order = ? WHERE id = ? AND task_set_id = ?');
    db.transaction((items) => { for (const item of items) update.run(item.sort_order, item.id, setId); })(order);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/family/task-sets/:id/steps
router.post('/task-sets/:id/steps', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const setId = parseInt(req.params.id, 10);
    assertSetInFamily(setId, req.user.familyId);

    const body = StepSchema.parse(req.body);
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM task_steps WHERE task_set_id = ?'
    ).get(setId).m;

    const result = db.prepare(
      'INSERT INTO task_steps (task_set_id, name, description, sort_order) VALUES (?, ?, ?, ?)'
    ).run(setId, body.name, body.description, maxOrder + 1);

    res.status(201).json(db.prepare('SELECT * FROM task_steps WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

// PUT /api/family/task-sets/:id/steps/:sid
router.put('/task-sets/:id/steps/:sid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const setId  = parseInt(req.params.id,  10);
    const stepId = parseInt(req.params.sid, 10);

    const step = db.prepare(`
      SELECT ts.id FROM task_steps ts
      JOIN task_sets tset ON tset.id = ts.task_set_id
      WHERE ts.id = ? AND ts.task_set_id = ? AND tset.family_id = ? AND ts.is_active = 1
    `).get(stepId, setId, req.user.familyId);
    if (!step) return res.status(404).json({ error: 'Step not found.' });

    const body = StepSchema.partial().parse(req.body);
    const updates = []; const values = [];
    if (body.name        !== undefined) { updates.push('name = ?');        values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(stepId);
    db.prepare(`UPDATE task_steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM task_steps WHERE id = ?').get(stepId));
  } catch (err) { next(err); }
});

// DELETE /api/family/task-sets/:id/steps/:sid
router.delete('/task-sets/:id/steps/:sid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const setId  = parseInt(req.params.id,  10);
    const stepId = parseInt(req.params.sid, 10);

    const result = db.prepare(`
      UPDATE task_steps SET is_active = 0
      WHERE id = ? AND task_set_id = ?
        AND task_set_id IN (SELECT id FROM task_sets WHERE family_id = ?)
    `).run(stepId, setId, req.user.familyId);
    if (!result.changes) return res.status(404).json({ error: 'Step not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
