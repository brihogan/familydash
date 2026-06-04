import { Router } from 'express';
import { z } from 'zod';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { generateAwardSteps } from '../services/awardSteps.js';
import { resolveEarnBadgeRef } from '../services/badgeRefLink.js';

const router = Router();

const LEVEL_ORDER = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

// For a requirement/optional row, decide the task_step name + description.
// When a one-line summary (short_text) exists, it becomes the glanceable name
// and the full text moves to the description (shown in focus mode / details).
// Otherwise the full text is the name and there's no separate description.
function stepNameDesc(row) {
  const short = row && typeof row.short_text === 'string' ? row.short_text.trim() : '';
  return short ? { name: short, description: row.text } : { name: row.text, description: '' };
}

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
    // Adding `is_enrolled` + `enrolled_task_set_id` per badge so the
    // browser can highlight badges the user already has. Same gate as
    // bookmarks — only relevant when scoped to a user.
    const bookmarkSelect = bookmarksFor
      ? `, EXISTS (SELECT 1 FROM badge_bookmarks bb WHERE bb.user_id = ? AND bb.badge_id = b.id) AS is_bookmarked,
         (SELECT ts.id FROM task_sets ts
          JOIN task_assignments ta ON ta.task_set_id = ts.id
          WHERE ts.badge_id = b.id AND ts.is_active = 1 AND ta.user_id = ? AND ta.is_active = 1
          LIMIT 1) AS enrolled_task_set_id`
      : '';
    const selectParams = bookmarksFor ? [bookmarksFor, bookmarksFor] : [];
    const whereWithBookmark = bookmarkedOnly
      ? `${where} AND EXISTS (SELECT 1 FROM badge_bookmarks bb WHERE bb.user_id = ? AND bb.badge_id = b.id)`
      : where;
    const whereExtraParams = bookmarkedOnly ? [bookmarksFor] : [];

    // ?enrolledOnly=true — show only badges/awards the user is currently
    //   assigned to (has an active task_set + assignment for). Requires
    //   bookmarksFor since we need the user context. Pairs with the
    //   emerald-border "enrolled" highlight in the BadgeBrowser cards.
    const enrolledOnly = bookmarksFor && req.query.enrolledOnly === 'true';
    let enrolledWhere = '';
    const enrolledWhereParams = [];
    if (enrolledOnly) {
      enrolledWhere = ` AND EXISTS (
        SELECT 1 FROM task_sets ts2
        JOIN task_assignments ta2 ON ta2.task_set_id = ts2.id
        WHERE ts2.badge_id = b.id AND ts2.is_active = 1
          AND ta2.user_id = ? AND ta2.is_active = 1
      )`;
      enrolledWhereParams.push(bookmarksFor);
    }

    // ?enrolledByUserId=:userId — show only badges some OTHER family member
    //   is currently enrolled in. Independent of bookmarksFor (which scopes
    //   the bookmark/enrollment state shown per card). Used by the "Pick a
    //   badge for this step" modal so a parent can pick a badge another kid
    //   already has, letting siblings work on awards together. Authorized
    //   to any same-family member (parent or sibling).
    // ?enrolledByUserId=any — show badges ANY other family member (everyone
    //   except the viewing user, bookmarksFor) is currently enrolled in.
    const enrolledByAny = String(req.query.enrolledByUserId || '').toLowerCase() === 'any';
    const enrolledByRaw = parseInt(req.query.enrolledByUserId || '', 10);
    const enrolledByUserId = Number.isFinite(enrolledByRaw) ? enrolledByRaw : null;
    let enrolledByWhere = '';
    const enrolledByWhereParams = [];
    if (enrolledByAny) {
      // Anyone in the family except the viewing user. Scoped to the caller's
      // family so it can't probe another family.
      enrolledByWhere = ` AND EXISTS (
        SELECT 1 FROM task_sets ts3
        JOIN task_assignments ta3 ON ta3.task_set_id = ts3.id
        JOIN users u3 ON u3.id = ta3.user_id
        WHERE ts3.badge_id = b.id AND ts3.is_active = 1
          AND ta3.is_active = 1 AND u3.family_id = ?
          ${bookmarksFor ? 'AND ta3.user_id != ?' : ''}
      )`;
      enrolledByWhereParams.push(req.user.familyId);
      if (bookmarksFor) enrolledByWhereParams.push(bookmarksFor);
    } else if (enrolledByUserId) {
      // Same-family guard so this can't be used to probe another family.
      const sameFamily = db.prepare(
        `SELECT 1 FROM users WHERE id = ? AND family_id = ?`
      ).get(enrolledByUserId, req.user.familyId);
      if (sameFamily) {
        enrolledByWhere = ` AND EXISTS (
          SELECT 1 FROM task_sets ts3
          JOIN task_assignments ta3 ON ta3.task_set_id = ts3.id
          WHERE ts3.badge_id = b.id AND ts3.is_active = 1
            AND ta3.user_id = ? AND ta3.is_active = 1
        )`;
        enrolledByWhereParams.push(enrolledByUserId);
      } else {
        // Out-of-family or unknown user → return nothing rather than leaking results.
        enrolledByWhere = ' AND 1=0';
      }
    }

    // ?newOnly=true — show only the latest scrape batch (badges whose
    //   scraped_at matches MAX(scraped_at) across the matching `type` filter).
    //   Filter is scoped to the current type ('badge' or 'award') so toggling
    //   it on the badges tab doesn't get polluted by an award batch that was
    //   scraped more recently. With type='all' we use the global MAX.
    const newOnly = req.query.newOnly === 'true';
    let newWhere = '';
    const newWhereParams = [];
    if (newOnly) {
      const isAwardClause = typeParam === 'award' ? 'is_award = 1'
                          : typeParam === 'badge' ? 'is_award = 0'
                          : '1=1';
      const maxScrape = db.prepare(
        `SELECT MAX(scraped_at) AS m FROM badges WHERE ${isAwardClause}`
      ).get()?.m;
      if (maxScrape) {
        newWhere = ' AND b.scraped_at = ?';
        newWhereParams.push(maxScrape);
      } else {
        // No scraped_at anywhere → return nothing rather than everything
        newWhere = ' AND 1=0';
      }
    }

    const finalWhere = whereWithBookmark + newWhere + enrolledWhere + enrolledByWhere;

    const total = db.prepare(`SELECT COUNT(*) AS n FROM badges b WHERE ${finalWhere}`)
      .get(...params, ...whereExtraParams, ...newWhereParams, ...enrolledWhereParams, ...enrolledByWhereParams).n;

    const badges = db.prepare(`
      SELECT b.id, b.name, b.slug, b.category, b.author, b.image_file,
             b.is_specific, b.note, b.description, b.emoji, b.is_active, b.level_opt_counts,
             b.is_award, b.award_type, b.award_config, b.scraped_at
             ${bookmarkSelect}
      FROM badges b
      WHERE ${finalWhere}
      ORDER BY b.name ASC
      LIMIT ? OFFSET ?
    `).all(...selectParams, ...params, ...whereExtraParams, ...newWhereParams, ...enrolledWhereParams, ...enrolledByWhereParams, limit, offset);

    // Per-badge co-assignees: other family members (in the viewer's family) who
    // are currently enrolled in the badge — active assignment, not archived —
    // and haven't finished it yet (completed step instances < total). Shown as
    // avatars on the card. Gated on a known viewing user (bookmarksFor) so we
    // can exclude them and scope to their family.
    if (bookmarksFor && badges.length > 0) {
      const ids = badges.map((b) => b.id);
      const ph  = ids.map(() => '?').join(',');
      const coRows = db.prepare(`
        SELECT ts.badge_id AS bid, u.id, u.name, u.avatar_color, u.avatar_emoji
        FROM task_sets ts
        JOIN task_assignments ta ON ta.task_set_id = ts.id
        JOIN users u ON u.id = ta.user_id
        WHERE ts.badge_id IN (${ph})
          AND ts.is_active = 1 AND ta.is_active = 1 AND ta.archived_at IS NULL
          AND u.family_id = ? AND u.is_active = 1
          AND ta.user_id != ?
          AND (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
            > (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id)
      `).all(...ids, req.user.familyId, bookmarksFor);
      const byBadge = new Map();
      for (const r of coRows) {
        let list = byBadge.get(r.bid);
        if (!list) { list = new Map(); byBadge.set(r.bid, list); }
        if (!list.has(r.id)) list.set(r.id, { id: r.id, name: r.name, avatar_color: r.avatar_color, avatar_emoji: r.avatar_emoji });
      }
      for (const b of badges) {
        const list = byBadge.get(b.id);
        b.co_assignees = list ? [...list.values()] : [];
      }
    }

    // Categories list excludes awards so the area-filter pills stay clean.
    const categories = db.prepare(
      `SELECT DISTINCT category FROM badges WHERE is_active = 1 AND is_award = 0 AND category != '' ORDER BY category ASC`
    ).all().map(r => r.category);

    res.json({ badges, total, page, limit, categories });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/badges/shared-counts ────────────────────────────────────────────
// For each same-family member with a badge_level, return how many badges they
// are CURRENTLY enrolled in that also match the caller's library filters
// (type, category, search, newOnly). Powers the "(N)" annotations in the
// BadgeBrowser's "Shared with…" dropdown so a parent can tell at a glance
// which siblings have anything to coordinate on within the current view.
router.get('/badges/shared-counts', authenticate, (req, res, next) => {
  try {
    const search   = (req.query.search   || '').trim();
    const category = (req.query.category || '').trim();
    const typeParam = (req.query.type || 'badge').toLowerCase();
    const newOnly  = req.query.newOnly === 'true';

    const conditions = ['b.is_active = 1'];
    const params     = [];

    if (typeParam === 'award')      conditions.push(`b.is_award = 1`);
    else if (typeParam === 'badge') conditions.push(`b.is_award = 0`);

    if (search) {
      conditions.push(`b.name LIKE ?`);
      params.push(`%${search}%`);
    }
    if (category) {
      conditions.push(`b.category = ?`);
      params.push(category);
    }
    if (newOnly) {
      const isAwardClause = typeParam === 'award' ? 'is_award = 1'
                          : typeParam === 'badge' ? 'is_award = 0'
                          : '1=1';
      const maxScrape = db.prepare(
        `SELECT MAX(scraped_at) AS m FROM badges WHERE ${isAwardClause}`
      ).get()?.m;
      if (maxScrape) {
        conditions.push('b.scraped_at = ?');
        params.push(maxScrape);
      } else {
        conditions.push('1=0');
      }
    }

    const rows = db.prepare(`
      SELECT ta.user_id AS userId, COUNT(DISTINCT b.id) AS n
      FROM badges b
      JOIN task_sets ts ON ts.badge_id = b.id AND ts.is_active = 1
      JOIN task_assignments ta ON ta.task_set_id = ts.id AND ta.is_active = 1
      JOIN users u ON u.id = ta.user_id
      WHERE u.family_id = ? AND u.is_active = 1 AND u.badge_level IS NOT NULL
        AND ${conditions.join(' AND ')}
      GROUP BY ta.user_id
    `).all(req.user.familyId, ...params);

    const counts = {};
    for (const r of rows) counts[r.userId] = r.n;
    res.json({ counts });
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
      const raw = db.prepare(
        `SELECT id, level, sort_order, text, short_text
         FROM badge_level_requirements
         WHERE badge_id = ? AND level IN (${placeholders})
         ORDER BY sort_order ASC`
      ).all(badgeId, ...levelsToFetch);
      // Some badges (e.g. Marshmallow) share the same starred requirements
      // across every level — the parser intentionally fans them out to each
      // level's row set so per-level progress tracking still works at the
      // task-step layer. But for the badge browser's "required steps" view
      // we want each unique text to appear once. Keep the first occurrence
      // (lowest level wins) and drop subsequent duplicates by normalized
      // text. Cross-references like "Do Preschool requirements 1 & 2" are
      // already stripped at import time, so the comparison is on substantive
      // text only.
      const seen = new Set();
      requirements = raw.filter((r) => {
        const key = (r.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Optional pool. Two flavors of CU badge:
    //   • Shared pool (Shakespeare, etc.) — every row has level=NULL and any
    //     kid can pick from it at any level.
    //   • Per-level (Math) — each row is tagged with the exact level it came
    //     from. The kid only sees their OWN level's options (not cumulative)
    //     since lower-level options are scoped to lower-level kids.
    // With a level requested we return NULL-level rows + the kid's exact
    // level. No level requested (admin view) → return everything.
    let optionals;
    if (levelParam && LEVEL_ORDER.includes(levelParam)) {
      optionals = db.prepare(
        `SELECT id, req_number, text, short_text, level FROM badge_optional_requirements
         WHERE badge_id = ? AND (level IS NULL OR level = ?)
         ORDER BY req_number ASC`
      ).all(badgeId, levelParam);
    } else {
      optionals = db.prepare(
        `SELECT id, req_number, text, short_text, level FROM badge_optional_requirements WHERE badge_id = ? ORDER BY req_number ASC`
      ).all(badgeId);
    }

    // Flag any "Earn the X badge" cross-references so the preview can
    // dotted-underline the phrase (same treatment as the optional picker).
    for (const list of [requirements, optionals]) {
      for (const row of list) {
        const ref = resolveEarnBadgeRef(db, row.text, badgeId);
        row.linked_badge_id   = ref ? ref.id   : null;
        row.linked_badge_name = ref ? ref.name : null;
      }
    }

    const optCounts = JSON.parse(badge.level_opt_counts || '{}');

    res.json({ ...badge, level_opt_counts: optCounts, requirements, optionals });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/badges/:id/optionals ───────────────────────────────────────────
// Full optional pool for a badge (used by the swap chevron in the task view
// and by the "Pick X more optional tasks" modal on the kid's task page).
// Respects the same per-level filter as the detail endpoint so Math-style
// badges only surface the kid's own-level options.
router.get('/badges/:id/optionals', authenticate, (req, res, next) => {
  try {
    const badgeId = parseInt(req.params.id, 10);
    const badge = db.prepare(`SELECT id FROM badges WHERE id = ? AND is_active = 1`).get(badgeId);
    if (!badge) return res.status(404).json({ error: 'Badge not found.' });

    const levelParam = req.query.level || null;
    let optionals;
    if (levelParam && LEVEL_ORDER.includes(levelParam)) {
      optionals = db.prepare(
        `SELECT id, req_number, text, short_text, level FROM badge_optional_requirements
         WHERE badge_id = ? AND (level IS NULL OR level = ?)
         ORDER BY req_number ASC`
      ).all(badgeId, levelParam);
    } else {
      optionals = db.prepare(
        `SELECT id, req_number, text, short_text, level FROM badge_optional_requirements WHERE badge_id = ? ORDER BY req_number ASC`
      ).all(badgeId);
    }

    // Flag optionals that reference another badge ("Earn the X badge") so the
    // picker modal can dotted-underline the phrase — a hint that the step will
    // auto-link to that badge once it's added. Only set when the name resolves
    // to a real badge, so the underline is never a dead promise.
    for (const opt of optionals) {
      const ref = resolveEarnBadgeRef(db, opt.text, badgeId);
      opt.linked_badge_id   = ref ? ref.id   : null;
      opt.linked_badge_name = ref ? ref.name : null;
    }

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

    // Fetch flattened required steps for all levels up to and including
    // userLevel. Shared-starred-req badges (Marshmallow et al.) have the
    // same text rows at every level — dedupe by normalized text so we don't
    // create 12 task_steps for what is really 2 unique required steps.
    const maxIdx = LEVEL_ORDER.indexOf(userLevel);
    const levelsToFetch = LEVEL_ORDER.slice(0, maxIdx + 1);
    const placeholders = levelsToFetch.map(() => '?').join(', ');
    const requiredStepsRaw = db.prepare(
      `SELECT text, short_text FROM badge_level_requirements
       WHERE badge_id = ? AND level IN (${placeholders})
       ORDER BY sort_order ASC`
    ).all(badge.id, ...levelsToFetch);
    const seenText = new Set();
    const requiredSteps = requiredStepsRaw.filter((s) => {
      const key = (s.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (seenText.has(key)) return false;
      seenText.add(key);
      return true;
    });

    // Fetch selected optional step texts
    const selectedOpts = body.selectedOptionalIds.length > 0
      ? db.prepare(
          `SELECT id, text, short_text FROM badge_optional_requirements
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
        VALUES (?, ?, ?, ?, ?, ?, 1, 'How did you complete this step?')
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
          const nd = stepNameDesc(step);
          insertStep.run(taskSetId, nd.name, nd.description, order++, 0, null);
        }
        for (const opt of selectedOpts) {
          const nd = stepNameDesc(opt);
          insertStep.run(taskSetId, nd.name, nd.description, order++, 1, opt.id);
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
      `SELECT id, text, short_text FROM badge_optional_requirements WHERE id = ? AND badge_id = ?`
    ).get(body.addOptionalReqId, taskSet.badge_id);
    if (!newOpt) return res.status(404).json({ error: 'Optional requirement not found for this badge.' });

    const alreadySelected = db.prepare(
      `SELECT id FROM task_steps WHERE task_set_id = ? AND badge_opt_req_id = ? AND is_active = 1`
    ).get(taskSetId, body.addOptionalReqId);
    if (alreadySelected) return res.status(409).json({ error: 'That optional is already selected.' });

    // Get sort_order of the step being removed so the new one takes its place
    const oldStep = db.prepare(`SELECT sort_order FROM task_steps WHERE id = ?`).get(body.removeStepId);

    const swapNd = stepNameDesc(newOpt);
    db.transaction(() => {
      db.prepare(`UPDATE task_steps SET is_active = 0 WHERE id = ?`).run(body.removeStepId);
      db.prepare(
        `INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt)
         VALUES (?, ?, ?, ?, 1, ?, 1, 'How did you complete this step?')`
      ).run(taskSetId, swapNd.name, swapNd.description, oldStep.sort_order, newOpt.id);
    })();

    // Include per-step completed_count for THIS user so the client doesn't
    // briefly drop the kid's checkmarks when they pick / swap an optional.
    // (The detail endpoint hydrates this same field; we mirror it here so
    // setSteps(result.steps) is a complete swap.)
    const steps = db.prepare(
      `SELECT id, name, description, sort_order, is_optional, badge_opt_req_id, repeat_count, limit_one_per_day, require_input, input_prompt, image,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS completed_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS last_completed_at
       FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC`
    ).all(targetId, targetId, taskSetId);

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
      `SELECT id, text, short_text FROM badge_optional_requirements WHERE id = ? AND badge_id = ?`
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

    const addNd = stepNameDesc(newOpt);
    db.prepare(
      `INSERT INTO task_steps (task_set_id, name, description, sort_order, is_optional, badge_opt_req_id, require_input, input_prompt)
       VALUES (?, ?, ?, ?, 1, ?, 1, 'How did you complete this step?')`
    ).run(taskSetId, addNd.name, addNd.description, maxOrder + 1, newOpt.id);

    // Include per-step completed_count for THIS user so the client doesn't
    // briefly drop the kid's checkmarks when they pick / swap an optional.
    // (The detail endpoint hydrates this same field; we mirror it here so
    // setSteps(result.steps) is a complete swap.)
    const steps = db.prepare(
      `SELECT id, name, description, sort_order, is_optional, badge_opt_req_id, repeat_count, limit_one_per_day, require_input, input_prompt, image,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS completed_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS last_completed_at
       FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC`
    ).all(targetId, targetId, taskSetId);

    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/:userId/task-assignments/:taskSetId/remove-optional ─────
// Remove a single optional pick from a badge task set. Used by the toggle UX
// in the optional-picker modal — clicking an already-selected option deselects
// it. Refuses if the underlying step already has any completions (the kid
// would lose progress); they have to swap-out via the existing swap flow.
const RemoveOptionalSchema = z.object({
  removeOptionalReqId: z.number().int().positive(),
});

router.post('/users/:userId/task-assignments/:taskSetId/remove-optional', authenticate, (req, res, next) => {
  try {
    const targetId  = parseInt(req.params.userId,    10);
    const taskSetId = parseInt(req.params.taskSetId, 10);

    const isParent = req.user.role === 'parent';
    const isSelf   = req.user.userId === targetId;
    if (!isParent && !isSelf) return res.status(403).json({ error: 'Forbidden.' });

    const body = RemoveOptionalSchema.parse(req.body);

    const taskSet = db.prepare(
      `SELECT ts.id, ts.badge_id, ts.family_id FROM task_sets ts WHERE ts.id = ? AND ts.is_active = 1`
    ).get(taskSetId);
    if (!taskSet) return res.status(404).json({ error: 'Task set not found.' });
    if (!taskSet.badge_id) return res.status(400).json({ error: 'This task set is not a badge.' });
    if (isParent && taskSet.family_id !== req.user.familyId) return res.status(403).json({ error: 'Forbidden.' });

    const step = db.prepare(
      `SELECT id FROM task_steps WHERE task_set_id = ? AND badge_opt_req_id = ? AND is_active = 1 AND is_optional = 1`
    ).get(taskSetId, body.removeOptionalReqId);
    if (!step) return res.status(404).json({ error: 'That optional is not currently selected.' });

    const completed = db.prepare(
      `SELECT COUNT(*) AS n FROM task_step_completions WHERE task_step_id = ?`
    ).get(step.id).n;
    if (completed > 0) {
      return res.status(409).json({ error: 'This step has progress on it — swap it instead of removing.' });
    }

    db.prepare(`DELETE FROM task_steps WHERE id = ?`).run(step.id);

    // Include per-step completed_count for THIS user so the client doesn't
    // briefly drop the kid's checkmarks when they pick / swap an optional.
    // (The detail endpoint hydrates this same field; we mirror it here so
    // setSteps(result.steps) is a complete swap.)
    const steps = db.prepare(
      `SELECT id, name, description, sort_order, is_optional, badge_opt_req_id, repeat_count, limit_one_per_day, require_input, input_prompt, image,
        (SELECT COUNT(*) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS completed_count,
        (SELECT MAX(completed_at) FROM task_step_completions WHERE task_step_id = task_steps.id AND user_id = ?) AS last_completed_at
       FROM task_steps WHERE task_set_id = ? AND is_active = 1 ORDER BY sort_order ASC`
    ).all(targetId, targetId, taskSetId);

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
