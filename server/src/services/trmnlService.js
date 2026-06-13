import db from '../db/db.js';
import { getOrGenerateLogs } from './choreService.js';
import { localDateISO } from '../utils/dateHelpers.js';

// Throttle: push at most once every 5 minutes per family
const lastPushByFamily = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

const MAX_TILES = 8; // chores + tasksets combined, per user

function formatCents(cents) {
  const n = cents || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

function pct(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

// Compact one-line activity string: trim the (sometimes huge) description, then
// append the "+N more..." suffix when there were other recent events. Kept short
// because TRMNL's free-tier webhook rejects payloads over 2KB.
function buildLatest(description, extraCount) {
  if (!description) return '';
  let text = description.trim();
  if (text.length > 38) text = `${text.slice(0, 37).trimEnd()}…`;
  return extraCount > 0 ? `${text} +${extraCount} more...` : text;
}

export function buildDashboardPayload(familyId) {
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(familyId);
  const today = localDateISO();

  // Generate chore logs for all members
  const familyMembers = db.prepare(
    'SELECT id FROM users WHERE family_id = ? AND is_active = 1'
  ).all(familyId);
  for (const m of familyMembers) {
    getOrGenerateLogs(m.id, today);
  }

  // Every active member (parents + kids) gets a square on the TRMNL grid.
  const rows = db.prepare(`
    WITH latest_activity AS (
      SELECT subject_user_id, MAX(created_at) AS latest_at
      FROM activity_feed WHERE family_id = ?
      GROUP BY subject_user_id
    ),
    activity_window AS (
      SELECT
        af.subject_user_id,
        COUNT(*) - 1 AS extra_count,
        (SELECT description FROM activity_feed af2
         WHERE af2.subject_user_id = af.subject_user_id AND af2.family_id = ?
         ORDER BY af2.created_at DESC,
           CASE af2.event_type WHEN 'taskset_completed' THEN 0 WHEN 'chores_all_done' THEN 0 ELSE 1 END ASC
         LIMIT 1) AS latest_description
      FROM activity_feed af
      JOIN latest_activity la ON af.subject_user_id = la.subject_user_id
      WHERE af.family_id = ?
        AND af.created_at >= datetime(la.latest_at, '-30 minutes')
      GROUP BY af.subject_user_id
    )
    SELECT
      u.id, u.name, u.avatar_emoji, u.avatar_color, u.role, u.ticket_balance,
      a.balance_cents AS main_balance_cents,
      COALESCE(ch.total, 0) AS chore_total,
      COALESCE(ch.done, 0)  AS chore_done,
      aw.latest_description,
      aw.extra_count
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id AND a.type = 'main' AND a.is_active = 1
    LEFT JOIN activity_window aw ON aw.subject_user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) AS total,
        COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS done
      FROM chore_logs WHERE log_date = ?
      GROUP BY user_id
    ) ch ON ch.user_id = u.id
    WHERE u.family_id = ? AND u.is_active = 1
    ORDER BY u.sort_order ASC, u.role DESC, u.name ASC
  `).all(familyId, familyId, familyId, today, familyId);

  const memberIds = rows.map((r) => r.id);
  const tasksByUser = {};

  if (memberIds.length > 0) {
    const ph = memberIds.map(() => '?').join(',');

    // Active task sets (not yet completed) per member — mirrors the main dashboard.
    const taskRows = db.prepare(`
      SELECT user_id, name, emoji, type, badge_image_file, step_count, completed_count FROM (
        SELECT
          ta.user_id,
          ts.name,
          ts.emoji,
          ts.type,
          b.image_file AS badge_image_file,
          (SELECT COALESCE(SUM(s.repeat_count), 0) FROM task_steps s WHERE s.task_set_id = ts.id AND s.is_active = 1)
            + CASE WHEN ts.badge_id IS NOT NULL
                THEN MAX(0, COALESCE(CAST(json_extract(b.level_opt_counts, '$.' || ts.badge_level) AS INTEGER), 0)
                          - (SELECT COUNT(DISTINCT COALESCE(badge_opt_req_id, -1))
                             FROM task_steps WHERE task_set_id = ts.id AND is_active = 1 AND is_optional = 1))
                ELSE 0
              END AS step_count,
          (SELECT COUNT(*) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS completed_count,
          (SELECT MAX(completed_at) FROM task_step_completions c WHERE c.task_set_id = ts.id AND c.user_id = ta.user_id) AS earned_at
        FROM task_assignments ta
        JOIN task_sets ts ON ts.id = ta.task_set_id
        LEFT JOIN badges b ON b.id = ts.badge_id
        WHERE ta.user_id IN (${ph}) AND ta.is_active = 1 AND ts.is_active = 1
      ) WHERE NOT (
        step_count > 0 AND completed_count = step_count
        AND type = 'One-Off'
        AND date(earned_at, 'localtime') < ?
      )
      ORDER BY user_id, CASE type WHEN 'Project' THEN 0 ELSE 1 END, name
    `).all(...memberIds, today);
    for (const row of taskRows) {
      (tasksByUser[row.user_id] ||= []).push(row);
    }
  }

  const users = rows.map((r) => {
    const latest = buildLatest(r.latest_description, r.extra_count);

    // Combined tiles: chores first (when assigned), then task sets, capped at
    // MAX_TILES. Only {emoji, pct} are sent — the markup derives "complete" from
    // pct === 100 — to stay under TRMNL's 2KB webhook payload cap.
    const tiles = [];
    if (r.chore_total > 0) {
      tiles.push({ emoji: '🧹', pct: pct(r.chore_done, r.chore_total) });
    }
    for (const t of tasksByUser[r.id] || []) {
      if (tiles.length >= MAX_TILES) break;
      const p = pct(t.completed_count, t.step_count);
      // Prefer the actual badge image (bare filename — markup prepends the public
      // /api/uploads/badges/ base); fall back to an emoji when there's no badge.
      tiles.push(
        t.badge_image_file
          ? { img: t.badge_image_file, pct: p }
          : { emoji: t.emoji || (t.type === 'Project' ? '📋' : '⭐'), pct: p }
      );
    }

    return {
      name: r.name,
      emoji: r.avatar_emoji || '',
      initial: (r.name || '?').trim().charAt(0).toUpperCase(),
      is_parent: r.role === 'parent',
      money: formatCents(r.main_balance_cents),
      money_negative: (r.main_balance_cents || 0) < 0,
      tickets: r.ticket_balance,
      tiles,
      latest,
    };
  });

  const payload = { family_name: family?.name || 'Family', users };

  // TRMNL's free-tier webhook hard-rejects bodies >2KB (HTTP 422). Degrade
  // gracefully so a push never silently fails: first drop badge images (the
  // markup falls back to a generic emoji), then shorten activity lines.
  const CAP = 2000;
  const bodyLen = () => JSON.stringify({ merge_variables: payload }).length;
  if (bodyLen() > CAP) {
    for (const u of users) for (const t of u.tiles) {
      if (t.img) { delete t.img; t.emoji = '⭐'; }
    }
  }
  if (bodyLen() > CAP) {
    for (const u of users) u.latest = (u.latest || '').slice(0, 24);
  }
  return payload;
}

/**
 * Push dashboard data to TRMNL webhook.
 * @param {number} familyId
 * @param {boolean} force - bypass throttle
 */
export async function pushToTrmnl(familyId, force = false) {
  const family = db.prepare('SELECT trmnl_webhook_url FROM families WHERE id = ?').get(familyId);
  const webhookUrl = family?.trmnl_webhook_url;
  if (!webhookUrl) return;

  const now = Date.now();
  if (!force && (now - (lastPushByFamily.get(familyId) || 0)) < THROTTLE_MS) return;
  lastPushByFamily.set(familyId, now);

  try {
    const payload = buildDashboardPayload(familyId);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge_variables: payload }),
    });
    if (!res.ok) {
      console.error(`TRMNL push failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('TRMNL push error:', err.message);
  }
}
