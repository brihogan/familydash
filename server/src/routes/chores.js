import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireOwnOrParent } from '../middleware/requireOwnOrParent.js';
import { requireDateAccess } from '../middleware/requireDateAccess.js';
import { getOrGenerateLogs } from '../services/choreService.js';
import { insertActivity } from '../services/activityService.js';
import { assertSameFamily } from '../utils/assertions.js';
import { localDateISO as todayISO } from '../utils/dateHelpers.js';

const router = Router();

// ─── GET /api/users/:id/chores ─────────────────────────────────────────────

router.get('/:id/chores', authenticate, requireOwnOrParent, requireDateAccess, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const date = req.query.date || todayISO();
    const logs = getOrGenerateLogs(userId, date);
    res.json({ date, logs });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/chores/:cid/complete ─────────────────────────────

router.post('/:id/chores/:cid/complete', authenticate, requireOwnOrParent, requireDateAccess, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const logId = parseInt(req.params.cid, 10);
    assertSameFamily(userId, req.user.familyId);

    const date = req.body?.date || req.query.date || todayISO();

    const log = db.prepare(`
      SELECT cl.*, ct.name AS chore_name
      FROM chore_logs cl
      JOIN chore_templates ct ON ct.id = cl.chore_template_id
      WHERE cl.id = ? AND cl.user_id = ? AND cl.log_date = ?
    `).get(logId, userId, date);

    if (!log) return res.status(404).json({ error: 'Chore log not found.' });
    if (log.completed_at) return res.status(409).json({ error: 'Chore already completed.' });

    const user = db.prepare('SELECT family_id, require_task_approval FROM users WHERE id = ?').get(userId);
    const family = db.prepare('SELECT use_tickets FROM families WHERE id = ?').get(user.family_id);
    const useTickets = family?.use_tickets !== 0;

    // If approval is required AND the actor is NOT a parent: mark pending, no tickets yet
    if (user.require_task_approval && req.user.role !== 'parent') {
      db.prepare(`UPDATE chore_logs SET completed_at = datetime('now'), approval_status = 'pending' WHERE id = ?`).run(logId);
      const updated = db.prepare('SELECT * FROM chore_logs WHERE id = ?').get(logId);
      const balance = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
      return res.json({ log: updated, ticketBalance: balance });
    }

    const completeTx = db.transaction(() => {
      db.prepare(`UPDATE chore_logs SET completed_at = datetime('now') WHERE id = ?`).run(logId);

      if (log.ticket_reward_at_time > 0) {
        if (useTickets) {
          db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
            .run(log.ticket_reward_at_time, userId);

          db.prepare(`
            INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
            VALUES (?, ?, 'chore_reward', ?, ?, 'chore_log')
          `).run(userId, log.ticket_reward_at_time, `Completed: ${log.chore_name}`, logId);
        }

        insertActivity({
          familyId: user.family_id,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'chore_completed',
          description: useTickets
            ? `Completed chore: ${log.chore_name} (+${log.ticket_reward_at_time} tickets)`
            : `Completed chore: ${log.chore_name}`,
          referenceId: logId,
          referenceType: 'chore_log',
          amountCents: useTickets ? log.ticket_reward_at_time : null,
        });
      }
    });

    completeTx();

    // Check if all chores for this log_date are now completed → chores_all_done milestone
    const allLogs = db.prepare(
      'SELECT completed_at FROM chore_logs WHERE user_id = ? AND log_date = ?'
    ).all(userId, date);
    if (allLogs.length > 0 && allLogs.every((l) => l.completed_at)) {
      const refType = `log_date:${date}`;
      const alreadyLogged = db.prepare(`
        SELECT id FROM activity_feed
        WHERE subject_user_id = ? AND event_type = 'chores_all_done'
          AND reference_type = ?
      `).get(userId, refType);
      if (!alreadyLogged) {
        insertActivity({
          familyId: user.family_id,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'chores_all_done',
          description: `Completed all chores for ${date}! 🌟`,
          referenceId: null,
          referenceType: refType,
          amountCents: null,
        });
      }
    }

    const updated = db.prepare('SELECT * FROM chore_logs WHERE id = ?').get(logId);
    const balance = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
    res.json({ log: updated, ticketBalance: balance });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/chores/:cid/uncomplete ───────────────────────────

router.post('/:id/chores/:cid/uncomplete', authenticate, requireOwnOrParent, requireDateAccess, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const logId = parseInt(req.params.cid, 10);
    assertSameFamily(userId, req.user.familyId);

    // If no date is supplied (e.g. undo from activity feed), look it up from the log itself
    const dateParam = req.body?.date || req.query.date;
    const date = dateParam || (() => {
      const row = db.prepare('SELECT log_date FROM chore_logs WHERE id = ?').get(logId);
      return row?.log_date || todayISO();
    })();

    const log = db.prepare(`
      SELECT cl.*, ct.name AS chore_name
      FROM chore_logs cl
      JOIN chore_templates ct ON ct.id = cl.chore_template_id
      WHERE cl.id = ? AND cl.user_id = ? AND cl.log_date = ?
    `).get(logId, userId, date);

    if (!log) return res.status(404).json({ error: 'Chore log not found.' });
    if (!log.completed_at) return res.status(409).json({ error: 'Chore not yet completed.' });

    // If pending approval, just cancel without ticket reversal
    if (log.approval_status === 'pending') {
      db.prepare('UPDATE chore_logs SET completed_at = NULL, approval_status = NULL WHERE id = ?').run(logId);
      const updated = db.prepare('SELECT * FROM chore_logs WHERE id = ?').get(logId);
      const balance = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
      return res.json({ log: updated, ticketBalance: balance });
    }

    const undoUserRow = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
    const undoFamily = db.prepare('SELECT use_tickets FROM families WHERE id = ?').get(undoUserRow.family_id);
    const useTickets = undoFamily?.use_tickets !== 0;

    const uncompleteTx = db.transaction(() => {
      db.prepare('UPDATE chore_logs SET completed_at = NULL WHERE id = ?').run(logId);

      if (log.ticket_reward_at_time > 0) {
        if (useTickets) {
          const currentUser = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId);
          const newBalance = Math.max(0, currentUser.ticket_balance - log.ticket_reward_at_time);
          db.prepare('UPDATE users SET ticket_balance = ? WHERE id = ?').run(newBalance, userId);

          db.prepare(`
            INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
            VALUES (?, ?, 'chore_reward', ?, ?, 'chore_log')
          `).run(userId, -log.ticket_reward_at_time, `Undone: ${log.chore_name}`, logId);
        }

        insertActivity({
          familyId: undoUserRow.family_id,
          subjectUserId: userId,
          actorUserId: req.user.userId,
          eventType: 'chore_undone',
          description: useTickets
            ? `Undid chore: ${log.chore_name} (-${log.ticket_reward_at_time} tickets)`
            : `Undid chore: ${log.chore_name}`,
          referenceId: logId,
          referenceType: 'chore_log',
          amountCents: useTickets ? -log.ticket_reward_at_time : null,
        });
      }
    });

    uncompleteTx();
    const updated = db.prepare('SELECT * FROM chore_logs WHERE id = ?').get(logId);
    const balance = db.prepare('SELECT ticket_balance FROM users WHERE id = ?').get(userId).ticket_balance;
    res.json({ log: updated, ticketBalance: balance });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/users/:id/chore-templates ───────────────────────────────────

router.get('/:id/chore-templates', authenticate, requireOwnOrParent, (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const templates = db.prepare(`
      SELECT ct.*, cca.common_chore_template_id AS common_chore_id
      FROM chore_templates ct
      LEFT JOIN common_chore_assignments cca ON cca.chore_template_id = ct.id
      WHERE ct.user_id = ? AND ct.is_active = 1
      ORDER BY ct.sort_order ASC, ct.id ASC
    `).all(userId);
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:id/chore-templates ──────────────────────────────────

const ChoreTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  ticket_reward: z.number().int().min(0).default(1),
  days_of_week: z.number().int().min(1).max(127).default(127),
});

router.post('/:id/chore-templates', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const body = ChoreTemplateSchema.parse(req.body);
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM chore_templates WHERE user_id = ?').get(userId).m;
    const result = db.prepare(`
      INSERT INTO chore_templates (user_id, name, description, ticket_reward, days_of_week, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, body.name, body.description, body.ticket_reward, body.days_of_week, maxOrder + 1);
    const template = db.prepare('SELECT * FROM chore_templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/users/:id/chore-templates/reorder ───────────────────────────
// MUST be before /:tid route

const ReorderSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), sort_order: z.number().int() })),
});

router.put('/:id/chore-templates/reorder', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    assertSameFamily(userId, req.user.familyId);
    const { items } = ReorderSchema.parse(req.body);
    const updateStmt = db.prepare('UPDATE chore_templates SET sort_order = ? WHERE id = ? AND user_id = ?');
    const reorderTx = db.transaction(() => {
      for (const item of items) {
        updateStmt.run(item.sort_order, item.id, userId);
      }
    });
    reorderTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/users/:id/chore-templates/:tid ──────────────────────────────

const UpdateChoreTemplateSchema = ChoreTemplateSchema.partial();

router.put('/:id/chore-templates/:tid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const templateId = parseInt(req.params.tid, 10);
    assertSameFamily(userId, req.user.familyId);

    const tmpl = db.prepare('SELECT id FROM chore_templates WHERE id = ? AND user_id = ? AND is_active = 1').get(templateId, userId);
    if (!tmpl) return res.status(404).json({ error: 'Template not found.' });

    const body = UpdateChoreTemplateSchema.parse(req.body);
    const updates = []; const values = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (body.ticket_reward !== undefined) { updates.push('ticket_reward = ?'); values.push(body.ticket_reward); }
    if (body.days_of_week !== undefined) { updates.push('days_of_week = ?'); values.push(body.days_of_week); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(templateId);
    db.prepare(`UPDATE chore_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM chore_templates WHERE id = ?').get(templateId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/users/:id/chore-templates/:tid ───────────────────────────

router.delete('/:id/chore-templates/:tid', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const templateId = parseInt(req.params.tid, 10);
    assertSameFamily(userId, req.user.familyId);
    const result = db.prepare(
      'UPDATE chore_templates SET is_active = 0 WHERE id = ? AND user_id = ?'
    ).run(templateId, userId);
    if (!result.changes) return res.status(404).json({ error: 'Template not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
