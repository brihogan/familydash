// AI tutor endpoints — one conversation per (user, task_step).
//
// The security boundary is resolveStep(): a thread can only exist for a step
// that belongs to a task set actually assigned to that user, and the user must
// be in the caller's family. Kids reach only their own threads; parents can
// read any thread in their family (and the kid is told so in the UI).

import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { assertSameFamily } from '../utils/assertions.js';
import { insertNotification } from '../services/notificationService.js';
import { tierForLevel } from '../constants/aiTiers.js';
import {
  generateReply, generateOpener, summarizeForKid, aiTutorConfigured,
} from '../services/aiTutor.js';

const router = Router();

// A kid can send this many tutor messages a day. Generous enough that a real
// rabbit hole never hits it, low enough that a stuck button can't run up a bill.
const DAILY_MESSAGE_CAP = 120;

const askSchema = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(['chat', 'answer_review']).optional().default('chat'),
  // Did they tap a suggested follow-up or type it themselves? Advisory only —
  // never trusted for anything but display.
  source: z.enum(['chip', 'typed', 'term', 'selection']).optional(),
});

// ── Context resolution (also the authorization check) ────────────────────────

// The per-kid switch. Off by default; a parent turns it on in Settings. Checked
// on every entry point so flipping it off takes effect immediately, including
// for a kid who already has the panel open.
// Two gates, both required. `families.ai_tutor_access` is the super-admin one —
// this feature spends our Anthropic key and registration is open, so a family
// can't switch it on for itself. `users.ai_tutor_enabled` is the parent's own
// per-kid choice within a family that's been allowed.
function tutorEnabledFor(userId) {
  const row = db.prepare(`
    SELECT u.ai_tutor_enabled, f.ai_tutor_access
      FROM users u JOIN families f ON f.id = u.family_id
     WHERE u.id = ?
  `).get(userId);
  return !!(row?.ai_tutor_enabled && row?.ai_tutor_access);
}

function assertTutorEnabledFor(userId) {
  if (!tutorEnabledFor(userId)) {
    const err = new Error('The AI tutor is turned off for this person.');
    err.status = 403;
    throw err;
  }
}

// A conversation went somewhere a parent should know about today. Flag the
// thread and drop a notification — the tutor has already told the child to
// speak to a grown-up; this makes sure the grown-up hears about it too.
function flagThread(threadId, userId, reason, level, familyId) {
  const prev = db.prepare(`SELECT flagged_at, flag_level FROM ai_threads WHERE id = ?`).get(threadId);

  // An urgent flag always wins: a thread that later escalates must not stay
  // filed under "heads up" just because it was flagged softly first.
  const escalating = level === 'urgent' && prev?.flag_level !== 'urgent';
  db.prepare(`
    UPDATE ai_threads
       SET flagged_at = datetime('now'), flag_reason = ?, flag_level = ?
         , flag_seen_at = CASE WHEN ? THEN NULL ELSE flag_seen_at END
     WHERE id = ?
  `).run(reason, escalating ? 'urgent' : (prev?.flag_level || level), escalating ? 1 : 0, threadId);

  // One notification per thread per level — a long difficult conversation
  // shouldn't produce a notification per message, but an escalation should.
  if (prev?.flagged_at && !escalating) return;

  try {
    const kid = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId);
    const name = kid?.name || 'your child';
    insertNotification({
      familyId,
      subjectUserId: userId,
      kind: level === 'urgent' ? 'ai_tutor_concern' : 'ai_tutor_heads_up',
      title: level === 'urgent'
        ? `Worth a chat with ${name}`
        : `Something ${name} asked about`,
      body: reason,
      referenceType: 'ai_thread',
      referenceId: threadId,
    });
  } catch (err) {
    console.warn(`[ai] could not raise concern notification: ${err.message}`);
  }
}

function resolveStep(userId, stepId, familyId) {
  assertSameFamily(userId, familyId);

  const row = db.prepare(`
    SELECT
      s.id          AS step_id,
      s.name        AS step_name,
      s.description AS step_description,
      ts.id         AS task_set_id,
      ts.name       AS task_set_name,
      ts.badge_id,
      ts.badge_level,
      b.name        AS badge_name,
      b.description AS badge_description,
      u.name        AS user_name
    FROM task_steps s
    JOIN task_sets  ts ON ts.id = s.task_set_id
    JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ?
    JOIN users u ON u.id = ta.user_id
    LEFT JOIN badges b ON b.id = ts.badge_id
    WHERE s.id = ?
  `).get(userId, stepId);

  if (!row) {
    const err = new Error('Step not found for this user.');
    err.status = 404;
    throw err;
  }
  return row;
}

// The step's own text is the source of truth for what's being asked. `ai_mode`
// comes from the offline classification pass, matched on the requirement text.
function stepAiMode(text) {
  const row = db.prepare(`
    SELECT ai_mode FROM badge_level_requirements WHERE text = ? AND ai_mode IS NOT NULL
    UNION ALL
    SELECT ai_mode FROM badge_optional_requirements WHERE text = ? AND ai_mode IS NOT NULL
    LIMIT 1
  `).get(text, text);
  return row?.ai_mode || null;
}

function loadThread(userId, stepId) {
  return db.prepare(
    `SELECT * FROM ai_threads WHERE user_id = ? AND task_step_id = ?`,
  ).get(userId, stepId);
}

function loadMessages(threadId) {
  const rows = db.prepare(
    `SELECT m.id, m.role, m.kind, m.text, m.chips, m.cross_badge, m.source, m.terms, m.author_id,
            u.name AS author_name
       FROM ai_messages m
       LEFT JOIN users u ON u.id = m.author_id
      WHERE m.thread_id = ? ORDER BY m.id`,
  ).all(threadId);

  let offered = []; // chips shown by the most recent AI turn

  return rows.map((m) => {
    const chips = JSON.parse(m.chips || '[]');

    // Rows written before `source` existed carry null. Infer them: a kid turn
    // whose text exactly matches a chip the tutor had just offered was a tap.
    let source = m.source;
    if (!source && m.role === 'kid' && m.kind === 'chat') {
      source = offered.includes(m.text) ? 'chip' : 'typed';
    }
    if (m.role === 'ai') offered = chips;

    return {
      id: m.id,
      role: m.role,
      kind: m.kind,
      text: m.text,
      chips,
      crossBadge: m.cross_badge ? JSON.parse(m.cross_badge) : null,
      source: source || null,
      terms: JSON.parse(m.terms || '[]'),
      // Null author = the thread's owner. Set only when someone else (a parent
      // working alongside them) typed this turn.
      authorId: m.author_id || null,
      authorName: m.author_id ? (m.author_name || null) : null,
    };
  });
}

function insertMessage(threadId, msg) {
  const info = db.prepare(`
    INSERT INTO ai_messages (thread_id, role, kind, text, chips, cross_badge, source, terms, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    threadId, msg.role, msg.kind || 'chat', msg.text,
    JSON.stringify(msg.chips || []),
    msg.crossBadge ? JSON.stringify(msg.crossBadge) : null,
    msg.source || null,
    JSON.stringify(msg.terms || []),
    msg.authorId ?? null,
  );
  db.prepare(`
    UPDATE ai_threads
       SET message_count = message_count + 1, last_message_at = datetime('now')
     WHERE id = ?
  `).run(threadId);
  return info.lastInsertRowid;
}

function pushTrail(threadId, topic) {
  if (!topic) return;
  const row = db.prepare(`SELECT trail FROM ai_threads WHERE id = ?`).get(threadId);
  const trail = JSON.parse(row?.trail || '[]');
  if (trail[trail.length - 1] === topic) return;
  trail.push(topic);
  db.prepare(`UPDATE ai_threads SET trail = ? WHERE id = ?`).run(JSON.stringify(trail.slice(-12)), threadId);
}

function kidContext(userId) {
  return db.prepare(`SELECT summary, topics FROM ai_kid_context WHERE user_id = ?`).get(userId) || null;
}

function messagesToday(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n
      FROM ai_messages m
      JOIN ai_threads t ON t.id = m.thread_id
     WHERE t.user_id = ? AND m.role = 'kid' AND date(m.created_at) = date('now')
  `).get(userId).n;
}

// Rebuild the rolling curiosity note from threads that have moved on since the
// last pass. Returns false when there's nothing to do.
async function refreshKidContext(userId) {
  const threads = db.prepare(`
    SELECT t.step_text, t.trail, ts.name AS badge
      FROM ai_threads t
      JOIN task_sets ts ON ts.id = t.task_set_id
     WHERE t.user_id = ? AND t.message_count > 1
       AND (t.summarized_at IS NULL OR t.summarized_at < t.last_message_at)
     ORDER BY t.last_message_at DESC
     LIMIT 12
  `).all(userId);
  if (!threads.length) return false;

  const existing = kidContext(userId);
  const summary = await summarizeForKid({
    existingSummary: existing?.summary || '',
    threadSummaries: threads.map(
      (t) => `- ${t.badge}: ${JSON.parse(t.trail || '[]').join(' → ') || t.step_text.slice(0, 80)}`,
    ),
  });
  if (!summary) return false;

  db.prepare(`
    INSERT INTO ai_kid_context (user_id, summary, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET summary = excluded.summary, updated_at = datetime('now')
  `).run(userId, summary);
  db.prepare(`UPDATE ai_threads SET summarized_at = datetime('now') WHERE user_id = ?`).run(userId);
  return summary;
}

// Kick the summariser without making the caller wait for it. The note is for
// the NEXT thread, so it never needs to be fresh for this request — and a
// summariser failure must never break opening a conversation.
//
// Guarded on both a quiet period (a thread still being actively used shouldn't
// be summarised mid-rabbit-hole) and a cooldown, so this costs at most a few
// cheap calls a day per kid.
const SUMMARY_QUIET_MINUTES = 20;
const SUMMARY_COOLDOWN_MINUTES = 60;

function maybeRefreshKidContext(userId) {
  try {
    const due = db.prepare(`
      SELECT 1
        FROM ai_threads t
        LEFT JOIN ai_kid_context c ON c.user_id = t.user_id
       WHERE t.user_id = ?
         AND t.message_count > 1
         AND (t.summarized_at IS NULL OR t.summarized_at < t.last_message_at)
         AND t.last_message_at < datetime('now', ?)
         AND (c.updated_at IS NULL OR c.updated_at < datetime('now', ?))
       LIMIT 1
    `).get(userId, `-${SUMMARY_QUIET_MINUTES} minutes`, `-${SUMMARY_COOLDOWN_MINUTES} minutes`);
    if (!due) return;

    refreshKidContext(userId).catch((err) => {
      console.warn(`[ai] curiosity summary failed for user ${userId}: ${err.message}`);
    });
  } catch (err) {
    console.warn(`[ai] curiosity summary check failed: ${err.message}`);
  }
}

function contextFor(step, userId) {
  const stepText = step.step_description || step.step_name;
  return {
    badgeLevel:       step.badge_level,
    mode:             stepAiMode(stepText),
    badgeName:        step.badge_name || step.task_set_name,
    badgeDescription: step.badge_description,
    stepText,
    kidName:          (step.user_name || '').split(' ')[0],
    kidContext:       kidContext(userId),
  };
}

// ─── GET /api/ai/steps/:stepId/thread ─────────────────────────────────────────
// Resume (or open) the conversation for a step. Creating the opener costs a
// model call, so it only happens when `?open=1` — merely rendering a step row
// must not spend anything.
router.get('/ai/users/:userId/steps/:stepId/thread', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stepId = parseInt(req.params.stepId, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: you can only access your own conversations.' });
    }

    if (!tutorEnabledFor(userId)) return res.json({ enabled: false, reason: 'off', messages: [] });

    const step = resolveStep(userId, stepId, req.user.familyId);
    const tier = tierForLevel(step.badge_level);
    if (!tier.enabled) return res.json({ enabled: false, tier: tier.key, messages: [] });

    // Fold any finished conversations into their curiosity note before we build
    // this thread's prompt. Fire-and-forget — it's for the next thread, not this one.
    if (req.user.userId === userId) maybeRefreshKidContext(userId);

    let thread = loadThread(userId, stepId);

    if (!thread && req.query.open === '1') {
      if (!aiTutorConfigured()) return res.status(503).json({ error: 'AI tutor is not configured.' });
      if (messagesToday(userId) >= DAILY_MESSAGE_CAP) {
        return res.status(429).json({ error: "That's enough AI for today — come back tomorrow." });
      }

      const ctx = contextFor(step, userId);

      // Claim the thread row BEFORE generating anything. Two near-simultaneous
      // opens (a remount, a double-tap, React's dev double-effect) would
      // otherwise both generate an opener and then collide on the unique index —
      // one 500, and two model calls paid for. INSERT OR IGNORE makes the claim
      // atomic; whoever loses just waits for the winner's opener to land.
      const info = db.prepare(`
        INSERT OR IGNORE INTO ai_threads (user_id, task_step_id, task_set_id, badge_level, step_text, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, stepId, step.task_set_id, step.badge_level, ctx.stepText, ctx.mode);

      if (info.changes > 0) {
        thread = db.prepare(`SELECT * FROM ai_threads WHERE id = ?`).get(info.lastInsertRowid);
        const opener = await generateOpener(ctx);
        insertMessage(thread.id, { role: 'ai', kind: 'chat', ...opener });
        if (opener.topic) pushTrail(thread.id, opener.topic);
      } else {
        // Lost the race — another request is generating the opener right now.
        // Wait briefly so the common case still resolves in one round trip, but
        // do NOT block for the whole generation: if it's still coming we say so
        // (`generating` below) and let the client poll. Returning an empty
        // message list here is what made the panel render blank until reload.
        for (let i = 0; i < 8; i += 1) {
          thread = loadThread(userId, stepId);
          if (thread?.message_count > 0) break;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    const messages = thread ? loadMessages(thread.id) : [];

    res.json({
      enabled:  true,
      tier:     tier.key,
      mode:     thread?.mode || null,
      threadId: thread?.id || null,
      messages,
      // The thread exists but its opening message hasn't been written yet —
      // another request is still waiting on the model. The client should keep
      // its "thinking" state and poll rather than render an empty conversation.
      generating: !!thread && messages.length === 0,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/ai/steps/:stepId/messages ──────────────────────────────────────
// Ask something, or hand over a draft answer for the coach (`kind`).
router.post('/ai/users/:userId/steps/:stepId/messages', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stepId = parseInt(req.params.stepId, 10);
    // The owner, or a parent in the same family sitting with them and working
    // the step together. The thread still belongs to the kid; the parent's own
    // turns are recorded as theirs (author_id) so the transcript doesn't pass
    // them off as the child's.
    const isOwner = req.user.userId === userId;
    if (!isOwner && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Only the person working on a step can talk about it.' });
    }
    if (!isOwner) assertSameFamily(userId, req.user.familyId);
    if (!aiTutorConfigured()) return res.status(503).json({ error: 'AI tutor is not configured.' });
    assertTutorEnabledFor(userId);

    const { text, kind, source } = askSchema.parse(req.body);
    const step = resolveStep(userId, stepId, req.user.familyId);
    const tier = tierForLevel(step.badge_level);
    if (!tier.enabled) return res.status(403).json({ error: 'AI tutor is off at this level.' });

    if (messagesToday(userId) >= DAILY_MESSAGE_CAP) {
      return res.status(429).json({ error: "That's enough AI for today — come back tomorrow." });
    }

    const thread = loadThread(userId, stepId);
    if (!thread) return res.status(409).json({ error: 'Open the conversation first.' });

    const history = loadMessages(thread.id);
    const ctx = contextFor(step, userId);

    // Persist the kid's turn before calling out, so a model failure doesn't
    // silently swallow what they typed.
    insertMessage(thread.id, {
      role: 'kid', kind, text,
      source: kind === 'chat' ? source : null,
      authorId: isOwner ? null : req.user.userId,
    });

    const reply = await generateReply({ ...ctx, history, input: text, kind, source });
    const id = insertMessage(thread.id, { role: 'ai', kind: 'chat', ...reply });
    pushTrail(thread.id, reply.topic);
    if (reply.concern) flagThread(thread.id, userId, reply.concern, reply.concernLevel, req.user.familyId);

    res.status(201).json({
      message: {
        id, role: 'ai', kind: 'chat',
        text: reply.text, chips: reply.chips, crossBadge: reply.crossBadge, terms: reply.terms,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/ai/users/:userId/wonders ────────────────────────────────────────
// Every conversation this kid has had, newest first.
router.get('/ai/users/:userId/wonders', authenticate, (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    assertSameFamily(userId, req.user.familyId);

    const rows = db.prepare(`
      SELECT t.id, t.task_step_id, t.task_set_id, t.badge_level, t.step_text, t.mode,
             t.trail, t.message_count, t.last_message_at, t.flagged_at, t.flag_reason, t.flag_seen_at, t.flag_level,
             (SELECT COUNT(*) FROM ai_messages m
               WHERE m.thread_id = t.id AND m.role = 'kid'
                 AND m.kind = 'chat' AND m.source = 'typed'
                 AND m.author_id IS NULL) AS typed_count,
             ts.name AS task_set_name, ts.emoji,
             b.image_file AS badge_image_file
        FROM ai_threads t
        JOIN task_sets ts ON ts.id = t.task_set_id
        LEFT JOIN badges b ON b.id = ts.badge_id
       WHERE t.user_id = ? AND t.message_count > 1
       ORDER BY t.last_message_at DESC
       LIMIT 100
    `).all(userId);

    res.json({
      threads: rows.map((r) => ({
        threadId:       r.id,
        stepId:         r.task_step_id,
        taskSetId:      r.task_set_id,
        badgeName:      r.task_set_name,
        badgeEmoji:     r.emoji,
        badgeImageFile: r.badge_image_file,
        badgeLevel:     r.badge_level,
        stepText:       r.step_text,
        mode:           r.mode,
        trail:          JSON.parse(r.trail || '[]'),
        messageCount:   r.message_count,
        // Questions they typed themselves rather than tapping a suggestion —
        // the sharper signal of whether they're actually reaching.
        typedCount:     r.typed_count,
        lastMessageAt:  r.last_message_at,
        // Only a parent sees why a thread was flagged; a kid just sees their own
        // conversation, unlabelled.
        flagged:        req.user.role === 'parent' ? !!r.flagged_at : false,
        flagReason:     req.user.role === 'parent' ? r.flag_reason : null,
        flagUnseen:     req.user.role === 'parent' ? (!!r.flagged_at && !r.flag_seen_at) : false,
        flagLevel:      req.user.role === 'parent' ? (r.flag_level || 'urgent') : null,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/ai/concerns ─────────────────────────────────────────────────────
// Every flagged conversation in the family a parent hasn't opened yet. Parents
// only — this is the whole point of the flag, and the latency between a kid
// saying something worrying and a parent noticing is what it's here to shorten.
router.get('/ai/concerns', authenticate, (req, res, next) => {
  try {
    if (req.user.role !== 'parent') return res.json({ concerns: [] });

    const rows = db.prepare(`
      SELECT t.id, t.user_id, t.task_set_id, t.flag_reason, t.flagged_at, t.flag_level,
             u.name AS user_name, ts.name AS badge_name
        FROM ai_threads t
        JOIN users u ON u.id = t.user_id
        JOIN task_sets ts ON ts.id = t.task_set_id
       WHERE u.family_id = ?
         AND t.flagged_at IS NOT NULL
         AND t.flag_seen_at IS NULL
       ORDER BY CASE WHEN COALESCE(t.flag_level, 'urgent') = 'urgent' THEN 0 ELSE 1 END,
                t.flagged_at DESC
       LIMIT 20
    `).all(req.user.familyId);

    res.json({
      concerns: rows.map((r) => ({
        threadId:  r.id,
        userId:    r.user_id,
        userName:  r.user_name,
        taskSetId: r.task_set_id,
        badgeName: r.badge_name,
        reason:    r.flag_reason,
        level:     r.flag_level || 'urgent',
        flaggedAt: r.flagged_at,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/ai/users/:userId/threads/:threadId ──────────────────────────────
// Read a whole conversation. This is the parent's window into what their kid has
// been talking about — and the kid is told in the UI that it exists.
router.get('/ai/users/:userId/threads/:threadId', authenticate, (req, res, next) => {
  try {
    const userId   = parseInt(req.params.userId, 10);
    const threadId = parseInt(req.params.threadId, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    assertSameFamily(userId, req.user.familyId);

    const thread = db.prepare(`
      SELECT t.*, ts.name AS task_set_name, ts.emoji
        FROM ai_threads t
        JOIN task_sets ts ON ts.id = t.task_set_id
       WHERE t.id = ? AND t.user_id = ?
    `).get(threadId, userId);
    if (!thread) return res.status(404).json({ error: 'Conversation not found.' });

    // A parent opening a flagged thread has now seen it.
    if (req.user.role === 'parent' && thread.flagged_at && !thread.flag_seen_at) {
      db.prepare(`UPDATE ai_threads SET flag_seen_at = datetime('now') WHERE id = ?`).run(threadId);
    }

    res.json({
      thread: {
        threadId:    thread.id,
        stepId:      thread.task_step_id,
        taskSetId:   thread.task_set_id,
        badgeName:   thread.task_set_name,
        badgeEmoji:  thread.emoji,
        badgeLevel:  thread.badge_level,
        stepText:    thread.step_text,
        trail:       JSON.parse(thread.trail || '[]'),
        flagged:     req.user.role === 'parent' ? !!thread.flagged_at : false,
        flagReason:  req.user.role === 'parent' ? thread.flag_reason : null,
        flagLevel:   req.user.role === 'parent' ? (thread.flag_level || 'urgent') : null,
      },
      messages: loadMessages(threadId),
    });
  } catch (err) { next(err); }
});

// ─── POST /api/ai/users/:userId/context/refresh ───────────────────────────────
// Rebuild the rolling curiosity summary from threads that have gone quiet.
router.post('/ai/users/:userId/context/refresh', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (req.user.role !== 'parent' && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    assertSameFamily(userId, req.user.familyId);
    if (!aiTutorConfigured()) return res.status(503).json({ error: 'AI tutor is not configured.' });

    const summary = await refreshKidContext(userId);
    res.json({ updated: !!summary, summary: summary || null });
  } catch (err) { next(err); }
});

// ─── POST /api/ai/users/:userId/handoff ───────────────────────────────────────
// Follow a cross-badge pointer. The conversation wandered from Alien Life into
// Astronomy; this finds the kid's own Astronomy enrolment, picks the step that
// best matches what they were just asking about, and seeds that step's thread
// with a handoff note so it opens mid-thought instead of from scratch.
//
// If they aren't enrolled in the badge we say so and let the client offer the
// badge preview — we never enrol them behind their back.
const handoffSchema = z.object({
  fromStepId: z.coerce.number().int().positive(),
  badgeId:    z.coerce.number().int().positive(),
});

router.post('/ai/users/:userId/handoff', authenticate, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (req.user.userId !== userId) {
      return res.status(403).json({ error: 'Only the person working on a step can follow a link.' });
    }
    if (!aiTutorConfigured()) return res.status(503).json({ error: 'AI tutor is not configured.' });

    const { fromStepId, badgeId } = handoffSchema.parse(req.body);
    assertSameFamily(userId, req.user.familyId);

    const from = resolveStep(userId, fromStepId, req.user.familyId);
    const fromThread = loadThread(userId, fromStepId);
    const trail = JSON.parse(fromThread?.trail || '[]');
    const lastTopic = trail[trail.length - 1] || null;

    const badge = db.prepare(`SELECT id, name FROM badges WHERE id = ? AND is_active = 1`).get(badgeId);
    if (!badge) return res.status(404).json({ error: 'That badge is not in the library.' });

    // Their own enrolment in the target badge, if any.
    const target = db.prepare(`
      SELECT ts.id AS task_set_id, ts.badge_level
        FROM task_sets ts
        JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.user_id = ?
       WHERE ts.badge_id = ?
       ORDER BY ts.id DESC
       LIMIT 1
    `).get(userId, badgeId);

    if (!target) {
      return res.json({ enrolled: false, badgeId: badge.id, badgeName: badge.name });
    }

    // Prefer an unfinished step, and among those the one whose text overlaps
    // most with what they were just talking about.
    const steps = db.prepare(`
      SELECT s.id, s.name, s.description
        FROM task_steps s
       WHERE s.task_set_id = ?
         AND s.id NOT IN (
           SELECT task_step_id FROM task_step_completions WHERE user_id = ? AND task_set_id = ?
         )
       ORDER BY s.sort_order
    `).all(target.task_set_id, userId, target.task_set_id);

    if (!steps.length) {
      return res.json({ enrolled: true, taskSetId: target.task_set_id, stepId: null, badgeName: badge.name });
    }

    const words = (lastTopic || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const score = (s) => {
      const hay = `${s.name} ${s.description || ''}`.toLowerCase();
      return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    };
    const best = steps.reduce((a, b) => (score(b) > score(a) ? b : a), steps[0]);

    let thread = loadThread(userId, best.id);
    if (!thread) {
      if (messagesToday(userId) >= DAILY_MESSAGE_CAP) {
        return res.status(429).json({ error: "That's enough AI for today — come back tomorrow." });
      }
      const step = resolveStep(userId, best.id, req.user.familyId);
      const ctx = contextFor(step, userId);

      const info = db.prepare(`
        INSERT OR IGNORE INTO ai_threads (user_id, task_step_id, task_set_id, badge_level, step_text, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, best.id, target.task_set_id, target.badge_level, ctx.stepText, ctx.mode);

      // Someone already opened this step directly — just send them to it.
      if (info.changes === 0) {
        return res.json({ enrolled: true, taskSetId: target.task_set_id, stepId: best.id, badgeName: badge.name });
      }
      thread = db.prepare(`SELECT * FROM ai_threads WHERE id = ?`).get(info.lastInsertRowid);

      insertMessage(thread.id, {
        role: 'ai',
        kind: 'handoff',
        text: `carried over from ${from.task_set_name}`,
      });

      const opener = await generateReply({
        ...ctx,
        history: [],
        kind: 'chat',
        input:
          `I was just working on the "${from.task_set_name}" badge and got onto ` +
          `${lastTopic ? `"${lastTopic}"` : 'a related idea'}, which led me here. ` +
          `In two or three sentences, pick up where that left off and connect it to THIS step. ` +
          `Do not greet me again and do not restate the step.`,
      });
      insertMessage(thread.id, { role: 'ai', kind: 'chat', ...opener });
      if (opener.topic) pushTrail(thread.id, opener.topic);
    }

    res.json({
      enrolled:  true,
      taskSetId: target.task_set_id,
      stepId:    best.id,
      badgeName: badge.name,
    });
  } catch (err) { next(err); }
});

export default router;
