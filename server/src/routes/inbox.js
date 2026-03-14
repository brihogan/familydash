import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { insertActivity } from '../services/activityService.js';

const router = Router();

// ─── GET /api/inbox ────────────────────────────────────────────────────────
// Returns all pending approval items grouped by kid (parent only).

router.get('/', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;

    const kids = db.prepare(`
      SELECT id, name, avatar_color, avatar_emoji
      FROM users
      WHERE family_id = ? AND role = 'kid' AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(familyId);

    const result = [];
    for (const kid of kids) {
      const chores = db.prepare(`
        SELECT cl.id, ct.name AS chore_name, cl.log_date, cl.completed_at, cl.ticket_reward_at_time
        FROM chore_logs cl
        JOIN chore_templates ct ON ct.id = cl.chore_template_id
        WHERE cl.user_id = ? AND cl.approval_status = 'pending'
        ORDER BY cl.completed_at ASC
      `).all(kid.id);

      const steps = db.prepare(`
        SELECT tsc.id, tsc.task_set_id, ts_set.name AS task_set_name,
               ts_set.emoji AS task_set_emoji, ts_set.ticket_reward AS task_set_ticket_reward,
               ts_step.id AS step_id, ts_step.name AS step_name, tsc.completed_at,
               (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = tsc.task_set_id AND is_active = 1) AS total_step_count,
               (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = tsc.task_set_id AND user_id = tsc.user_id AND (approval_status IS NULL OR approval_status = 'approved')) AS approved_step_count,
               (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = tsc.task_set_id AND user_id = tsc.user_id AND approval_status = 'pending') AS pending_step_count
        FROM task_step_completions tsc
        JOIN task_sets  ts_set  ON ts_set.id  = tsc.task_set_id
        JOIN task_steps ts_step ON ts_step.id = tsc.task_step_id
        WHERE tsc.user_id = ? AND tsc.approval_status = 'pending'
        ORDER BY tsc.task_set_id ASC, tsc.completed_at ASC
      `).all(kid.id);

      const setCompletions = db.prepare(`
        SELECT ta.id, ta.task_set_id, ts.name AS task_set_name, ts.emoji AS task_set_emoji,
               ts.ticket_reward
        FROM task_assignments ta
        JOIN task_sets ts ON ts.id = ta.task_set_id
        WHERE ta.user_id = ? AND ta.completion_status = 'pending' AND ta.is_active = 1
        ORDER BY ta.task_set_id ASC
      `).all(kid.id);

      if (chores.length + steps.length + setCompletions.length > 0) {
        result.push({ ...kid, chores, steps, setCompletions });
      }
    }

    res.json({ kids: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/inbox/count ──────────────────────────────────────────────────
// Lightweight count for nav badge (parent only).

router.get('/count', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const familyId = req.user.familyId;

    const choreCount = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM chore_logs cl
      JOIN users u ON u.id = cl.user_id
      WHERE u.family_id = ? AND u.role = 'kid' AND u.is_active = 1
        AND cl.approval_status = 'pending'
    `).get(familyId).cnt;

    const stepCount = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM task_step_completions tsc
      JOIN users u ON u.id = tsc.user_id
      WHERE u.family_id = ? AND u.role = 'kid' AND u.is_active = 1
        AND tsc.approval_status = 'pending'
    `).get(familyId).cnt;

    const setCount = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM task_assignments ta
      JOIN users u ON u.id = ta.user_id
      WHERE u.family_id = ? AND u.role = 'kid' AND u.is_active = 1
        AND ta.completion_status = 'pending' AND ta.is_active = 1
    `).get(familyId).cnt;

    res.json({ count: choreCount + stepCount + setCount });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/inbox/approve ───────────────────────────────────────────────
// Body: { chore_log_ids?: number[], step_completion_ids?: number[] }

router.post('/approve', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const { chore_log_ids = [], step_completion_ids = [], set_completion_ids = [] } = req.body;
    const familyId = req.user.familyId;
    const family   = db.prepare('SELECT use_tickets FROM families WHERE id = ?').get(familyId);
    const useTickets = family?.use_tickets !== 0;

    const approveTx = db.transaction(() => {
      // ── Approve chore logs ────────────────────────────────────────────────
      const affectedChoreKeys = new Set();

      for (const logId of chore_log_ids) {
        const log = db.prepare(`
          SELECT cl.*, ct.name AS chore_name
          FROM chore_logs cl
          JOIN chore_templates ct ON ct.id = cl.chore_template_id
          WHERE cl.id = ? AND cl.approval_status = 'pending'
        `).get(logId);
        if (!log) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(log.user_id);
        if (owner?.family_id !== familyId) continue;

        db.prepare(`UPDATE chore_logs SET approval_status = 'approved' WHERE id = ?`).run(logId);

        if (useTickets && log.ticket_reward_at_time > 0) {
          db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
            .run(log.ticket_reward_at_time, log.user_id);
          db.prepare(`
            INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
            VALUES (?, ?, 'chore_reward', ?, ?, 'chore_log')
          `).run(log.user_id, log.ticket_reward_at_time, `Completed: ${log.chore_name}`, logId);
        }

        insertActivity({
          familyId,
          subjectUserId: log.user_id,
          actorUserId:   req.user.userId,
          eventType:     'chore_completed',
          description:   useTickets && log.ticket_reward_at_time > 0
            ? `Completed chore: ${log.chore_name} (+${log.ticket_reward_at_time} tickets)`
            : `Completed chore: ${log.chore_name}`,
          referenceId:   logId,
          referenceType: 'chore_log',
          amountCents:   useTickets ? log.ticket_reward_at_time : null,
        });

        affectedChoreKeys.add(`${log.user_id}:${log.log_date}`);
      }

      // Check chores_all_done milestone for affected user+date pairs
      for (const key of affectedChoreKeys) {
        const [uid, date] = key.split(':');
        const allLogs = db.prepare(
          `SELECT completed_at, approval_status FROM chore_logs WHERE user_id = ? AND log_date = ?`
        ).all(uid, date);
        const allApproved = allLogs.length > 0 && allLogs.every(
          (l) => l.completed_at && l.approval_status !== 'pending'
        );
        if (allApproved) {
          const refType = `log_date:${date}`;
          const alreadyLogged = db.prepare(`
            SELECT id FROM activity_feed
            WHERE subject_user_id = ? AND event_type = 'chores_all_done'
              AND reference_type = ?
          `).get(uid, refType);
          if (!alreadyLogged) {
            insertActivity({
              familyId,
              subjectUserId: parseInt(uid),
              actorUserId:   req.user.userId,
              eventType:     'chores_all_done',
              description:   `Completed all chores for ${date}! 🌟`,
              referenceId:   null,
              referenceType: refType,
              amountCents:   null,
            });
          }
        }
      }

      // ── Approve step completions ──────────────────────────────────────────
      for (const completionId of step_completion_ids) {
        const completion = db.prepare(`
          SELECT tsc.*, ts_step.name AS step_name, ts_set.name AS task_set_name,
                 ts_set.ticket_reward
          FROM task_step_completions tsc
          JOIN task_steps ts_step ON ts_step.id = tsc.task_step_id
          JOIN task_sets  ts_set  ON ts_set.id  = tsc.task_set_id
          WHERE tsc.id = ? AND tsc.approval_status = 'pending'
        `).get(completionId);
        if (!completion) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(completion.user_id);
        if (owner?.family_id !== familyId) continue;

        db.prepare(`UPDATE task_step_completions SET approval_status = 'approved' WHERE id = ?`).run(completionId);

        insertActivity({
          familyId,
          subjectUserId: completion.user_id,
          actorUserId:   req.user.userId,
          eventType:     'task_step_completed',
          description:   `Completed step: ${completion.step_name} (${completion.task_set_name})`,
          referenceId:   completion.task_set_id,
          referenceType: 'task_set',
          amountCents:   completion.task_step_id,
        });

        // Check if task set is now fully done (all steps approved or null)
        const totalSteps = db.prepare(
          `SELECT COUNT(*) AS cnt FROM task_steps WHERE task_set_id = ? AND is_active = 1`
        ).get(completion.task_set_id).cnt;

        const doneSteps = db.prepare(`
          SELECT COUNT(*) AS cnt FROM task_step_completions
          WHERE task_set_id = ? AND user_id = ?
            AND (approval_status IS NULL OR approval_status = 'approved')
        `).get(completion.task_set_id, completion.user_id).cnt;

        if (totalSteps > 0 && doneSteps >= totalSteps) {
          const ticketReward = completion.ticket_reward ?? 0;
          if (useTickets && ticketReward > 0) {
            db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
              .run(ticketReward, completion.user_id);
            db.prepare(`
              INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
              VALUES (?, ?, 'manual', ?, ?, 'task_set')
            `).run(completion.user_id, ticketReward,
              `Completed task set: ${completion.task_set_name} (+${ticketReward} tickets)`,
              completion.task_set_id);
          }
          insertActivity({
            familyId,
            subjectUserId: completion.user_id,
            actorUserId:   req.user.userId,
            eventType:     'taskset_completed',
            description:   `Completed all steps in: ${completion.task_set_name} 🎯`,
            referenceId:   completion.task_set_id,
            referenceType: 'task_set',
            amountCents:   useTickets && ticketReward > 0 ? ticketReward : null,
          });
        }
      }

      // ── Approve set completions ─────────────────────────────────────────
      for (const assignmentId of set_completion_ids) {
        const assignment = db.prepare(`
          SELECT ta.*, ts.name AS task_set_name, ts.ticket_reward
          FROM task_assignments ta
          JOIN task_sets ts ON ts.id = ta.task_set_id
          WHERE ta.id = ? AND ta.completion_status = 'pending'
        `).get(assignmentId);
        if (!assignment) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(assignment.user_id);
        if (owner?.family_id !== familyId) continue;

        db.prepare("UPDATE task_assignments SET completion_status = 'approved' WHERE id = ?").run(assignmentId);

        if (useTickets && assignment.ticket_reward > 0) {
          db.prepare('UPDATE users SET ticket_balance = ticket_balance + ? WHERE id = ?')
            .run(assignment.ticket_reward, assignment.user_id);
          db.prepare(`
            INSERT INTO ticket_ledger (user_id, amount, type, description, reference_id, reference_type)
            VALUES (?, ?, 'manual', ?, ?, 'task_set')
          `).run(assignment.user_id, assignment.ticket_reward,
            `Completed task set: ${assignment.task_set_name} (+${assignment.ticket_reward} tickets)`,
            assignment.task_set_id);
        }

        insertActivity({
          familyId,
          subjectUserId: assignment.user_id,
          actorUserId:   req.user.userId,
          eventType:     'taskset_completed',
          description:   `Completed all steps in: ${assignment.task_set_name} 🎯`,
          referenceId:   assignment.task_set_id,
          referenceType: 'task_set',
          amountCents:   useTickets && assignment.ticket_reward > 0 ? assignment.ticket_reward : null,
        });
      }
    });

    approveTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/inbox/deny ──────────────────────────────────────────────────
// Body: { chore_log_ids?: number[], step_completion_ids?: number[] }

router.post('/deny', authenticate, requireRole('parent'), (req, res, next) => {
  try {
    const { chore_log_ids = [], step_completion_ids = [], set_completion_ids = [] } = req.body;
    const familyId = req.user.familyId;

    const denyTx = db.transaction(() => {
      for (const logId of chore_log_ids) {
        const log = db.prepare(
          `SELECT user_id FROM chore_logs WHERE id = ? AND approval_status = 'pending'`
        ).get(logId);
        if (!log) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(log.user_id);
        if (owner?.family_id !== familyId) continue;
        db.prepare(`UPDATE chore_logs SET completed_at = NULL, approval_status = NULL WHERE id = ?`).run(logId);
      }

      for (const completionId of step_completion_ids) {
        const completion = db.prepare(
          `SELECT user_id FROM task_step_completions WHERE id = ? AND approval_status = 'pending'`
        ).get(completionId);
        if (!completion) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(completion.user_id);
        if (owner?.family_id !== familyId) continue;
        db.prepare(`DELETE FROM task_step_completions WHERE id = ?`).run(completionId);
      }

      for (const assignmentId of set_completion_ids) {
        const assignment = db.prepare(
          `SELECT user_id FROM task_assignments WHERE id = ? AND completion_status = 'pending'`
        ).get(assignmentId);
        if (!assignment) continue;
        const owner = db.prepare('SELECT family_id FROM users WHERE id = ?').get(assignment.user_id);
        if (owner?.family_id !== familyId) continue;
        db.prepare(`UPDATE task_assignments SET completion_status = NULL WHERE id = ?`).run(assignmentId);
      }
    });

    denyTx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
