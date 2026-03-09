import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

const CommonChoreSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  ticket_reward: z.number().int().min(0).default(1),
  days_of_week: z.number().int().min(1).max(127).default(127),
});

// ─── GET /api/family/common-chores ──────────────────────────────────────────
router.get('/common-chores', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;

    const templates = db.prepare(`
      SELECT * FROM common_chore_templates
      WHERE family_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(familyId);

    // Get assignments for each template
    const assignments = db.prepare(`
      SELECT cca.common_chore_template_id, cca.user_id, cca.chore_template_id
      FROM common_chore_assignments cca
      JOIN common_chore_templates cct ON cct.id = cca.common_chore_template_id
      WHERE cct.family_id = ? AND cct.is_active = 1
    `).all(familyId);

    // Group assignments by common chore template id
    const assignmentMap = {};
    for (const a of assignments) {
      if (!assignmentMap[a.common_chore_template_id]) assignmentMap[a.common_chore_template_id] = [];
      assignmentMap[a.common_chore_template_id].push({ userId: a.user_id, choreTemplateId: a.chore_template_id });
    }

    const result = templates.map((t) => ({
      ...t,
      assignments: assignmentMap[t.id] || [],
    }));

    res.json({ templates: result });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/common-chores ─────────────────────────────────────────
router.post('/common-chores', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const body = CommonChoreSchema.parse(req.body);
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM common_chore_templates WHERE family_id = ?'
    ).get(familyId).m;

    const result = db.prepare(`
      INSERT INTO common_chore_templates (family_id, name, description, ticket_reward, days_of_week, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(familyId, body.name, body.description, body.ticket_reward, body.days_of_week, maxOrder + 1);

    const template = db.prepare('SELECT * FROM common_chore_templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...template, assignments: [] });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/common-chores/reorder ──────────────────────────────────
// MUST be before /:id route
const ReorderSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), sort_order: z.number().int() })),
});

router.put('/common-chores/reorder', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const { items } = ReorderSchema.parse(req.body);
    const stmt = db.prepare(
      'UPDATE common_chore_templates SET sort_order = ? WHERE id = ? AND family_id = ?'
    );
    const reorderTx = db.transaction(() => {
      // 1. Update common_chore_templates sort_order
      for (const item of items) {
        stmt.run(item.sort_order, item.id, familyId);
      }

      // 2. Build canonical order map: common_chore_template_id → new sort_order
      const commonOrderMap = new Map();
      for (const item of items) {
        commonOrderMap.set(item.id, item.sort_order);
      }

      // 3. Find all kids who have any common chore assignments for this family
      const kidsWithAssignments = db.prepare(`
        SELECT DISTINCT cca.user_id
        FROM common_chore_assignments cca
        JOIN common_chore_templates cct ON cct.id = cca.common_chore_template_id
        WHERE cct.family_id = ? AND cct.is_active = 1
      `).all(familyId);

      const updateSort = db.prepare(
        'UPDATE chore_templates SET sort_order = ? WHERE id = ?'
      );

      // 4. For each kid, propagate the new common chore order
      for (const { user_id: kidId } of kidsWithAssignments) {
        // Get all active chore_templates for this kid, sorted
        const kidChores = db.prepare(`
          SELECT ct.id, ct.sort_order
          FROM chore_templates ct
          WHERE ct.user_id = ? AND ct.is_active = 1
          ORDER BY ct.sort_order ASC, ct.id ASC
        `).all(kidId);

        // Get which of these are common chores
        const kidAssignments = db.prepare(`
          SELECT cca.chore_template_id, cca.common_chore_template_id
          FROM common_chore_assignments cca
          JOIN common_chore_templates cct ON cct.id = cca.common_chore_template_id
          WHERE cca.user_id = ? AND cct.family_id = ? AND cct.is_active = 1
        `).all(kidId, familyId);

        const commonChoreMap = new Map(); // chore_template_id → common_chore_template_id
        for (const a of kidAssignments) {
          commonChoreMap.set(a.chore_template_id, a.common_chore_template_id);
        }

        // Extract the sort_order slots currently occupied by common chores
        const commonSlots = [];
        const commonTemplateIds = [];
        for (const chore of kidChores) {
          if (commonChoreMap.has(chore.id)) {
            commonSlots.push(chore.sort_order);
            commonTemplateIds.push(chore.id);
          }
        }

        if (commonSlots.length < 2) continue; // nothing to reorder

        // Sort common chore template IDs by their new canonical order
        commonTemplateIds.sort((a, b) => {
          const orderA = commonOrderMap.get(commonChoreMap.get(a)) ?? Infinity;
          const orderB = commonOrderMap.get(commonChoreMap.get(b)) ?? Infinity;
          return orderA - orderB;
        });

        // Assign the extracted slots back in the new order
        for (let i = 0; i < commonTemplateIds.length; i++) {
          updateSort.run(commonSlots[i], commonTemplateIds[i]);
        }
      }
    });
    reorderTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/family/common-chores/:id ──────────────────────────────────────
router.put('/common-chores/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const commonId = parseInt(req.params.id, 10);
    const tmpl = db.prepare(
      'SELECT * FROM common_chore_templates WHERE id = ? AND family_id = ? AND is_active = 1'
    ).get(commonId, familyId);
    if (!tmpl) return res.status(404).json({ error: 'Common chore not found.' });

    const body = CommonChoreSchema.partial().parse(req.body);
    const updates = []; const values = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (body.ticket_reward !== undefined) { updates.push('ticket_reward = ?'); values.push(body.ticket_reward); }
    if (body.days_of_week !== undefined) { updates.push('days_of_week = ?'); values.push(body.days_of_week); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    const updateTx = db.transaction(() => {
      values.push(commonId);
      db.prepare(`UPDATE common_chore_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      // Propagate changes to all linked per-kid templates
      const linkedUpdates = []; const linkedValues = [];
      if (body.name !== undefined) { linkedUpdates.push('name = ?'); linkedValues.push(body.name); }
      if (body.description !== undefined) { linkedUpdates.push('description = ?'); linkedValues.push(body.description); }
      if (body.ticket_reward !== undefined) { linkedUpdates.push('ticket_reward = ?'); linkedValues.push(body.ticket_reward); }
      if (body.days_of_week !== undefined) { linkedUpdates.push('days_of_week = ?'); linkedValues.push(body.days_of_week); }

      if (linkedUpdates.length) {
        const linkedIds = db.prepare(
          'SELECT chore_template_id FROM common_chore_assignments WHERE common_chore_template_id = ?'
        ).all(commonId).map((r) => r.chore_template_id);

        if (linkedIds.length) {
          const placeholders = linkedIds.map(() => '?').join(',');
          db.prepare(
            `UPDATE chore_templates SET ${linkedUpdates.join(', ')} WHERE id IN (${placeholders})`
          ).run(...linkedValues, ...linkedIds);
        }
      }
    });

    updateTx();
    const updated = db.prepare('SELECT * FROM common_chore_templates WHERE id = ?').get(commonId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/family/common-chores/:id ───────────────────────────────────
router.delete('/common-chores/:id', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const commonId = parseInt(req.params.id, 10);

    const deleteTx = db.transaction(() => {
      // Soft-delete linked per-kid templates
      const linkedIds = db.prepare(
        'SELECT chore_template_id FROM common_chore_assignments WHERE common_chore_template_id = ?'
      ).all(commonId).map((r) => r.chore_template_id);

      if (linkedIds.length) {
        const placeholders = linkedIds.map(() => '?').join(',');
        db.prepare(`UPDATE chore_templates SET is_active = 0 WHERE id IN (${placeholders})`).run(...linkedIds);
      }

      // Remove assignments
      db.prepare('DELETE FROM common_chore_assignments WHERE common_chore_template_id = ?').run(commonId);

      // Soft-delete the common template
      const result = db.prepare(
        'UPDATE common_chore_templates SET is_active = 0 WHERE id = ? AND family_id = ?'
      ).run(commonId, familyId);

      if (!result.changes) throw Object.assign(new Error('Not found.'), { status: 404 });
    });

    deleteTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/family/common-chores/:id/assign ─────────────────────────────
// Toggle assignment for a user. Body: { userId, assigned: true/false }
router.post('/common-chores/:id/assign', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;
    const commonId = parseInt(req.params.id, 10);
    const { userId, assigned } = req.body;

    const tmpl = db.prepare(
      'SELECT * FROM common_chore_templates WHERE id = ? AND family_id = ? AND is_active = 1'
    ).get(commonId, familyId);
    if (!tmpl) return res.status(404).json({ error: 'Common chore not found.' });

    const targetUser = db.prepare(
      'SELECT id, family_id FROM users WHERE id = ? AND is_active = 1'
    ).get(userId);
    if (!targetUser || targetUser.family_id !== familyId) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const assignTx = db.transaction(() => {
      const existing = db.prepare(
        'SELECT * FROM common_chore_assignments WHERE common_chore_template_id = ? AND user_id = ?'
      ).get(commonId, userId);

      if (assigned && !existing) {
        // Create a per-kid chore_templates row
        const maxOrder = db.prepare(
          'SELECT COALESCE(MAX(sort_order), 0) AS m FROM chore_templates WHERE user_id = ?'
        ).get(userId).m;

        const insertResult = db.prepare(`
          INSERT INTO chore_templates (user_id, name, description, ticket_reward, days_of_week, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, tmpl.name, tmpl.description, tmpl.ticket_reward, tmpl.days_of_week, maxOrder + 1);

        db.prepare(`
          INSERT INTO common_chore_assignments (common_chore_template_id, user_id, chore_template_id)
          VALUES (?, ?, ?)
        `).run(commonId, userId, insertResult.lastInsertRowid);
      } else if (!assigned && existing) {
        // Soft-delete the per-kid template and remove the assignment
        db.prepare('UPDATE chore_templates SET is_active = 0 WHERE id = ?').run(existing.chore_template_id);
        db.prepare('DELETE FROM common_chore_assignments WHERE id = ?').run(existing.id);
      }
    });

    assignTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
