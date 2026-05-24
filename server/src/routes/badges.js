import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { generateAwardSteps } from '../services/awardSteps.js';

const router = Router();

const LEVEL_ORDER = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

// ─── GET /api/badges ──────────────────────────────────────────────────────────
// List badges with optional search and category filter. Paginated.
router.get('/badges', authenticate, (req, res, next) => {
  try {
    const search   = (req.query.search   || '').trim();
    const category = (req.query.category || '').trim();
    const names    = (req.query.names    || '').trim(); // comma-separated exact-match list
    const page     = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset   = (page - 1) * limit;
    // Parents only: switch to viewing ONLY soft-disabled badges (so they can find
    // ones with no required steps and decide whether to re-enable them).
    const onlyInactive = req.user.role === 'parent' && req.query.onlyInactive === 'true';
    // Type filter: 'badge' (default, hides awards), 'award' (only awards), 'all'
    const typeParam = (req.query.type || 'badge').toLowerCase();

    const conditions = [onlyInactive ? 'b.is_active = 0' : 'b.is_active = 1'];
    const params     = [];

    if (typeParam === 'award')      conditions.push(`b.is_award = 1`);
    else if (typeParam === 'badge') conditions.push(`b.is_award = 0`);
    // 'all' adds no filter

    if (search) {
      conditions.push(`b.name LIKE ?`);
      params.push(`%${search}%`);
    }
    if (category) {
      conditions.push(`b.category = ?`);
      params.push(category);
    }
    if (names) {
      const list = names.split(',').map(n => n.trim()).filter(Boolean).slice(0, 50);
      if (list.length > 0) {
        const placeholders = list.map(() => '?').join(', ');
        conditions.push(`b.name IN (${placeholders}) COLLATE NOCASE`);
        params.push(...list);
      }
    }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    // Compute total against the same where clause used for the rows query so
    // pagination matches when bookmarkedOnly is on (bookmark filter is added
    // a few lines below after we know whether to apply it).

    // ?bookmarksFor=:userId — include the user's bookmark state per badge.
    // ?bookmarkedOnly=true — limit results to badges this user has bookmarked
    //   (requires bookmarksFor). Default ordering stays alphabetical so the
    //   list doesn't reshuffle when a kid bookmarks/unbookmarks.
    const bookmarksForRaw = parseInt(req.query.bookmarksFor || '', 10);
    const bookmarksFor = Number.isFinite(bookmarksForRaw) ? bookmarksForRaw : null;
    const bookmarkedOnly = bookmarksFor && req.query.bookmarkedOnly === 'true';
    const bookmarkSelect = bookmarksFor
      ? `, EXISTS (SELECT 1 FROM badge_bookmarks bb WHERE bb.user_id = ? AND bb.badge_id = b.id) AS is_bookmarked`
      : '';
    const selectParams = bookmarksFor ? [bookmarksFor] : [];
    const whereWithBookmark = bookmarkedOnly
      ? `${where} AND EXISTS (SELECT 1 FROM badge_bookmarks bb WHERE bb.user_id = ? AND bb.badge_id = b.id)`
      : where;
    const whereExtraParams = bookmarkedOnly ? [bookmarksFor] : [];

    const total = db.prepare(`SELECT COUNT(*) AS n FROM badges b WHERE ${whereWithBookmark}`).get(...params, ...whereExtraParams).n;

    const badges = db.prepare(`
      SELECT b.id, b.name, b.slug, b.category, b.author, b.image_file,
             b.is_specific, b.note, b.description, b.emoji, b.is_active, b.level_opt_counts,
             b.is_award, b.award_type, b.award_config
             ${bookmarkSelect}
      FROM badges b
      WHERE ${whereWithBookmark}
      ORDER BY b.name ASC
      LIMIT ? OFFSET ?
    `).all(...selectParams, ...params, ...whereExtraParams, limit, offset);

    // Categories list excludes awards so the area-filter pills stay clean.
    const categories = db.prepare(
      `SELECT DISTINCT category FROM badges WHERE is_active = 1 AND is_award = 0 AND category != '' ORDER BY category ASC`
    ).all().map(r => r.category);

    res.json({ badges, total, page, limit, categories });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/badges/:id ──────────────────────────────────────────────────────
// Badge detail: metadata + level requirements up to `?level=` + full optional pool.
router.get('/badges/:id', authenticate, (req, res, next) => {
  try {
    const badgeId = parseInt(req.params.id, 10);
    const badge = db.prepare(
      `SELECT id, name, slug, category, author, image_file, is_specific, note, description, emoji, source_url, level_opt_counts,
              is_award, award_type, award_config
       FROM badges WHERE id = ? AND is_active = 1`
    ).get(badgeId);
    if (!badge) return res.status(404).json({ error: 'Badge not found.' });

    const levelParam = req.query.level || null;
    let requirements = [];
    if (levelParam && LEVEL_ORDER.includes(levelParam)) {
      const maxIdx = LEVEL_ORDER.indexOf(levelParam);
      const levelsToFetch = LEVEL_ORDER.slice(0, maxIdx + 1);
      const placeholders = levelsToFetch.map(() => '?').join(', ');
      requirements = db.prepare(
        `SELECT id, level, sort_order, text
         FROM badge_level_requirements
         WHERE badge_id = ? AND level IN (${placeholders})
         ORDER BY sort_order ASC`
      ).all(badgeId, ...levelsToFetch);
    }

    const optionals = db.prepare(
      `SELECT id, req_number, text FROM badge_optional_requirements WHERE badge_id = ? ORDER BY req_number ASC`
    ).all(badgeId);

    const optCounts = JSON.parse(badge.level_opt_counts || '{}');

    res.json({ ...badge, level_opt_counts: optCounts, requirements, optionals });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/badges/:id/optionals ───────────────────────────────────────────
// Full optional pool for a badge (used by the swap chevron in the task view).
router.get('/badges/:id/optionals', authenticate, (req, res, next) => {
  try {
    const badgeId = parseInt(req.params.id, 10);
    const badge = db.prepare(`SELECT id FROM badges WHERE id = ? AND is_active = 1`).get(badgeId);
    if (!badge) return res.status(404).json({ error: 'Badge not found.' });

    const optionals = db.prepare(
      `SELECT id, req_number, text FROM badge_optional_requirements WHERE badge_id = ? ORDER BY req_number ASC`
    ).all(badgeId);

    res.json({ optionals });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:userId/badges/enroll ───────────────────────────────────
// Enroll a user in a badge: creates an Award task_set + task_steps + assignment.
const EnrollSchema = z.object({
  badgeId:             z.number().int().positive(),
  selectedOptionalIds: z.array(z.number().int().positive()),
});

router.post('/users/:userId/badges/enroll', authenticate, (req, res, next) => {
  try {
    const targetId = parseInt(req.params.userId, 10);

    // Only the user themselves or a parent in the same family may enroll
    const targetUser = db.prepare(
      `SELECT u.id, u.family_id, u.badge_level, u.max_active_badges, u.require_set_approval
       FROM users u WHERE u.id = ? AND u.is_active = 1`
    ).get(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const isParent = req.user.role === 'parent';
    const isSelf   = req.user.userId === targetId;
    if (!isParent && !isSelf) return res.status(403).json({ error: 'Forbidden.' });
    if (isParent && targetUser.family_id !== req.user.familyId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const body = EnrollSchema.parse(req.body);

    // Fetch badge
    const badge = db.prepare(
      `SELECT id, name, category, description, emoji, level_opt_counts, is_award, award_type, award_config
       FROM badges WHERE id = ? AND is_active = 1`
    ).get(body.badgeId);
    if (!badge) return res.status(404).json({ error: 'Badge not found.' });

    const userLevel = targetUser.badge_level;
    if (!userLevel) return res.status(400).json({ error: 'User does not have a badge level set.' });

    const optCounts = JSON.parse(badge.level_opt_counts || '{}');
    const requiredOptCount = optCounts[userLevel] ?? 0;

    if (body.selectedOptionalIds.length > requiredOptCount) {
      return res.status(400).json({
        error: `Cannot select more than ${requiredOptCount} optional requirement${requiredOptCount === 1 ? '' : 's'} for ${userLevel}.`,
      });
    }

    // Check active badge count
    const activeBadgeCount = db.prepare(`
      SELECT COUNT(*) AS n FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id
      WHERE ta.user_id = ? AND ta.is_active = 1 AND ta.completion_status IS NULL
        AND ts.badge_id IS NOT NULL AND ts.is_active = 1
    `).get(targetId).n;

    if (activeBadgeCount >= targetUser.max_active_badges) {
      return res.status(400).json({
        error: `Already at the maximum of ${targetUser.max_active_badges} active badge${targetUser.max_active_badges === 1 ? '' : 's'}.`,
      });
    }

    // Block re-enrollment only if there's an IN-PROGRESS instance of this badge.
    // Fully-earned badges (at any level) are OK to re-enroll — e.g. a kid levels up
    // and wants to do the badge again at the higher level.
    const inProgress = db.prepare(`
      SELECT ts.id, ts.badge_level
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id
      WHERE ta.user_id = ? AND ta.is_active = 1 AND ta.completion_status IS NULL
        AND ts.badge_id = ? AND ts.is_active = 1
        AND (
          SELECT COUNT(*) FROM task_step_completions tsc
          WHERE tsc.task_set_id = ts.id AND tsc.user_id = ?
        ) < (
          SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps
          WHERE task_set_id = ts.id AND is_active = 1
        )
    `).get(targetId, body.badgeId, targetId);
    if (inProgress) {
      const lvlLabel = inProgress.badge_level || 'a previous level';
      return res.status(409).json({
        error: `This badge is already in progress (${lvlLabel}). Finish or remove that one before starting a new one.`,
      });
    }

    // Validate selected optional IDs belong to this badge
    if (requiredOptCount > 0) {
      const validOpts = db.prepare(
        `SELECT id FROM badge_optional_requirements WHERE badge_id = ? AND id IN (${body.selectedOptionalIds.map(() => '?').join(',')})`
      ).all(badge.id, ...body.selectedOptionalIds);
      if (validOpts.length !== body.selectedOptionalIds.length) {
        return res.status(400).json({ error: 'One or more selected optional requirements are invalid.' });
      }
    }

    // Fetch flattened required steps for all levels up to and including userLevel
    const maxIdx = LEVEL_ORDER.indexOf(userLevel);
    const levelsToFetch = LEVEL_ORDER.slice(0, maxIdx + 1);
    const placeholders = levelsToFetch.map(() => '?').join(', ');
    const requiredSteps = db.prepare(
      `SELECT text FROM badge_level_requirements
       WHERE badge_id = ? AND level IN (${placeholders})
       ORDER BY sort_order ASC`
    ).all(badge.id, ...levelsToFetch);

    // Fetch selected optional step texts
    const selectedOpts = body.selectedOptionalIds.length > 0
      ? db.prepare(
          `SELECT id, text FROM badge_optional_requirements
           WHERE badge_id = ? AND id IN (${body.selectedOptionalIds.map(() => '?').join(',')})
           ORDER BY req_number ASC`
        ).all(badge.id, ...body.selectedOptionalIds)
      : [];

    // Create task_set + steps + assignment in a transaction
    const enroll = db.transaction(() => {
      // Curiosity badges: category = "Curiosity"; tags = ["Badge", <Area of Discovery>]
      // CuriosityUntamed Awards: category = "Curiosity"; tags = ["Award"]
      //   so the settings/tasks tag filter has a single "Award" chip (the
      //   task_set type is "One-Off" for both — same as user-created one-offs).
      const isAward  = badge.is_award === 1;
      const tagsJson = isAward
        ? JSON.stringify(['Award'])
        : JSON.stringify(['Badge', badge.category].filter(Boolean));
      const setResult = db.prepare(`
        INSERT INTO task_sets (family_id, name, type, emoji, description, category, tags, ticket_reward, display_mode, notify_mode, badge_id, badge_level)
        VALUES (?, ?, 'One-Off', ?, ?, 'Curiosity', ?, 0, 'list', 'off', ?, ?)
      `).run(targetUser.family_id, badge.name, badge.emoji || null, badge.description || '', tagsJson, badge.id, userLevel);

      const taskSetId = setResult.lastInsertRowid;

      const insertStep = db.prepare(`
        INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt)
        VALUES (?, ?, '', ?, ?, ?, 1, 'How did you complete this step?')
      `);

      let order = 0;
      if (isAward) {
        // Awards: generate steps from award_config. Mix of activities and
        // badge/area references; the linked metadata lets the UI add badge
        // image + progress + "Start badge" links on top of the standard row.
        const insertAwardStep = db.prepare(`
          INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional,
                                  badge_opt_req_id, require_input, input_prompt,
                                  linked_badge_id, linked_badge_category, level)
          VALUES (?, ?, '', ?, 0, NULL, 0, '', ?, ?, ?)
        `);
        let awardCfg = {};
        try { awardCfg = JSON.parse(badge.award_config || '{}'); } catch (_) {}
        const awardSteps = generateAwardSteps(db, badge.award_type, awardCfg, userLevel);
        for (const s of awardSteps) {
          insertAwardStep.run(taskSetId, s.name, order++, s.linked_badge_id, s.linked_badge_category, s.level);
        }
      } else {
        for (const step of requiredSteps) {
          insertStep.run(taskSetId, step.text, order++, 0, null);
        }
        for (const opt of selectedOpts) {
          insertStep.run(taskSetId, opt.text, order++, 1, opt.id);
        }
      }

      db.prepare(`
        INSERT INTO task_assignments (task_set_id, user_id, assigned_by)
        VALUES (?, ?, ?)
      `).run(taskSetId, targetId, req.user.userId);

      return taskSetId;
    });

    const taskSetId = enroll();
    res.status(201).json({ taskSetId });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/users/:userId/task-assignments/:taskSetId/optional-swap ───────
// Swap one optional pick: remove an existing optional step and add a new one.
const SwapSchema = z.object({
  removeStepId:     z.number().int().positive(),
  addOptionalReqId: z.number().int().positive(),
});

router.patch('/users/:userId/task-assignments/:taskSetId/optional-swap', authenticate, (req, res, next) => {
  try {
    const targetId  = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);

    const isParent = req.user.role === 'parent';
    const isSelf   = req.user.userId === targetId;
    if (!isParent && !isSelf) return res.status(403).json({ error: 'Forbidden.' });

    const body = SwapSchema.parse(req.body);

    const taskSet = db.prepare(
      `SELECT ts.id, ts.badge_id, ts.family_id FROM task_sets ts WHERE ts.id = ? AND ts.is_active = 1`
    ).get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });
    if (!taskSet.badge_id) return res.status(400).json({ error: 'This task set is not a badge.' });
    if (isParent && taskSet.family_id !== req.user.familyId) return res.status(403).json({ error: 'Forbidden.' });

    // Verify step to remove is optional, belongs to this set, and has no completions
    const stepToRemove = db.prepare(
      `SELECT id, is_optional FROM task_steps WHERE id = ? AND task_set_id = ? AND is_active = 1`
    ).get(body.removeStepId, taskSetId);
    if (!stepToRemove) return res.status(404).json({ error: 'Step not found.' });
    if (!stepToRemove.is_optional) return res.status(400).json({ error: 'Cannot swap a required step.' });

    const completions = db.prepare(
      `SELECT COUNT(*) AS n FROM task_step_completions WHERE task_step_id = ? AND user_id = ?`
    ).get(body.removeStepId, targetId).n;
    if (completions > 0) return res.status(400).json({ error: 'Cannot swap a step that has already been completed.' });

    // Verify new optional req belongs to this badge and is not already in the set
    const newOpt = db.prepare(
      `SELECT id, text FROM badge_optional_requirements WHERE id = ? AND badge_id = ?`
    ).get(body.addOptionalReqId, taskSet.badge_id);
    if (!newOpt) return res.status(404).json({ error: 'Optional requirement not found for this badge.' });

    const alreadySelected = db.prepare(
      `SELECT id FROM task_steps WHERE task_set_id = ? AND badge_opt_req_id = ? AND is_active = 1`
    ).get(taskSetId, body.addOptionalReqId);
    if (alreadySelected) return res.status(409).json({ error: 'That optional is already selected.' });

    // Get sort_order of the step being removed so the new one takes its place
    const oldStep = db.prepare(`SELECT sort_order FROM task_steps WHERE id = ?`).get(body.removeStepId);

    db.transaction(() => {
      db.prepare(`UPDATE task_steps SET is_active = 0 WHERE id = ?`).run(body.removeStepId);
      db.prepare(
        `INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt)
         VALUES (?, ?, '', ?, 1, ?, 1, 'How did you complete this step?')`
      ).run(taskSetId, newOpt.text, oldStep.sort_order, newOpt.id);
    })();

    const steps = db.prepare(
      `SELECT id, name, description, sort_order, is_optional, badge_opt_req_id, repeat_count, limit_one_per_day, require_input, input_prompt, image
       FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC`
    ).all(taskSetId);

    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:userId/task-assignments/:taskSetId/add-optional ─────────
// Add a single optional step to an existing badge task set. Used when a kid is
// filling in their picks on a badge that was assigned without all optionals chosen.
const AddOptionalSchema = z.object({
  addOptionalReqId: z.number().int().positive(),
});

router.post('/users/:userId/task-assignments/:taskSetId/add-optional', authenticate, (req, res, next) => {
  try {
    const targetId  = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);

    const isParent = req.user.role === 'parent';
    const isSelf   = req.user.userId === targetId;
    if (!isParent && !isSelf) return res.status(403).json({ error: 'Forbidden.' });

    const body = AddOptionalSchema.parse(req.body);

    const taskSet = db.prepare(
      `SELECT ts.id, ts.badge_id, ts.badge_level, ts.family_id FROM task_sets ts WHERE ts.id = ? AND ts.is_active = 1`
    ).get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });
    if (!taskSet.badge_id) return res.status(400).json({ error: 'This task set is not a badge.' });
    if (isParent && taskSet.family_id !== req.user.familyId) return res.status(403).json({ error: 'Forbidden.' });

    // Get badge optional pick count for this level
    const badge = db.prepare(`SELECT level_opt_counts FROM badges WHERE id = ?`).get(taskSet.badge_id);
    const optCounts = JSON.parse(badge?.level_opt_counts || '{}');
    const requiredOptCount = optCounts[taskSet.badge_level] ?? 0;

    // Count current selected optionals
    const currentCount = db.prepare(
      `SELECT COUNT(*) AS n FROM task_steps WHERE task_set_id = ? AND is_active = 1 AND is_optional = 1`
    ).get(taskSetId).n;

    if (currentCount >= requiredOptCount) {
      return res.status(400).json({ error: `Already have all ${requiredOptCount} optional pick${requiredOptCount === 1 ? '' : 's'} selected.` });
    }

    // Verify new optional req belongs to badge and isn't already selected
    const newOpt = db.prepare(
      `SELECT id, text FROM badge_optional_requirements WHERE id = ? AND badge_id = ?`
    ).get(body.addOptionalReqId, taskSet.badge_id);
    if (!newOpt) return res.status(404).json({ error: 'Optional requirement not found for this badge.' });

    const alreadySelected = db.prepare(
      `SELECT id FROM task_steps WHERE task_set_id = ? AND badge_opt_req_id = ? AND is_active = 1`
    ).get(taskSetId, body.addOptionalReqId);
    if (alreadySelected) return res.status(409).json({ error: 'That optional is already selected.' });

    // Use next sort_order
    const maxOrder = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM task_steps WHERE task_set_id = ?`
    ).get(taskSetId).m;

    db.prepare(
      `INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt)
       VALUES (?, ?, '', ?, 1, ?, 1, 'How did you complete this step?')`
    ).run(taskSetId, newOpt.text, maxOrder + 1, newOpt.id);

    const steps = db.prepare(
      `SELECT id, name, description, sort_order, is_optional, badge_opt_req_id, repeat_count, limit_one_per_day, require_input, input_prompt, image
       FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC`
    ).all(taskSetId);

    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

// ─── Bookmarks: POST /api/users/:userId/badges/:badgeId/bookmark ──────────
// Idempotent (INSERT OR IGNORE on the composite PK).
router.post('/users/:userId/badges/:badgeId/bookmark', authenticate, (req, res, next) => {
  try {
    const userId  = parseInt(req.params.userId,  10);
    const badgeId = parseInt(req.params.badgeId, 10);
    const targetUser = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (req.user.role === 'parent' && targetUser.family_id !== req.user.familyId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    db.prepare(
      'INSERT OR IGNORE INTO badge_bookmarks (user_id, badge_id) VALUES (?, ?)'
    ).run(userId, badgeId);
    res.json({ bookmarked: true });
  } catch (err) { next(err); }
});

// DELETE /api/users/:userId/badges/:badgeId/bookmark
router.delete('/users/:userId/badges/:badgeId/bookmark', authenticate, (req, res, next) => {
  try {
    const userId  = parseInt(req.params.userId,  10);
    const badgeId = parseInt(req.params.badgeId, 10);
    const targetUser = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    if (req.user.userId !== userId && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (req.user.role === 'parent' && targetUser.family_id !== req.user.familyId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    db.prepare(
      'DELETE FROM badge_bookmarks WHERE user_id = ? AND badge_id = ?'
    ).run(userId, badgeId);
    res.json({ bookmarked: false });
  } catch (err) { next(err); }
});

export default router;
