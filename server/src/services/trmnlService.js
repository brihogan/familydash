import db from '../db/db.js';
import { getKingOfCrowns } from './streakService.js';
import { getOrGenerateLogs } from './choreService.js';
import { localDateISO } from '../utils/dateHelpers.js';

// Throttle: push at most once every 5 minutes per family
const lastPushByFamily = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

function formatCents(cents) {
  const abs = Math.abs(cents || 0);
  return `$${(abs / 100).toFixed(2)}`;
}

function buildDashboardPayload(familyId) {
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(familyId);
  const today = localDateISO();

  // Generate chore logs for all members
  const familyMembers = db.prepare(
    'SELECT id FROM users WHERE family_id = ? AND is_active = 1'
  ).all(familyId);
  for (const m of familyMembers) {
    getOrGenerateLogs(m.id, today);
  }

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
      u.id, u.name, u.avatar_emoji, u.role, u.ticket_balance, u.show_on_dashboard,
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
    WHERE u.family_id = ? AND u.is_active = 1 AND u.role = 'kid' AND u.show_on_dashboard = 1
    ORDER BY u.sort_order ASC, u.name ASC
  `).all(familyId, familyId, familyId, today, familyId);

  // Trophy counts
  const memberIds = rows.map((r) => r.id);
  const trophyMap = {};
  if (memberIds.length > 0) {
    const ph = memberIds.map(() => '?').join(',');
    const trophyRows = db.prepare(`
      SELECT ta.user_id, COUNT(*) AS trophy_count
      FROM task_assignments ta
      JOIN task_sets ts ON ts.id = ta.task_set_id
      WHERE ta.user_id IN (${ph})
        AND ts.type = 'Award'
        AND ts.is_active = 1
        AND ta.is_active = 1
        AND COALESCE(ta.completion_status, 'approved') != 'pending'
        AND (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1) > 0
        AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id)
            >= (SELECT COALESCE(SUM(repeat_count), 0) FROM task_steps WHERE task_set_id = ts.id AND is_active = 1)
        AND (SELECT COUNT(*) FROM task_step_completions WHERE task_set_id = ts.id AND user_id = ta.user_id AND approval_status = 'pending') = 0
      GROUP BY ta.user_id
    `).all(...memberIds);
    for (const r of trophyRows) trophyMap[r.user_id] = r.trophy_count;

    const kingHolders = getKingOfCrowns(familyId);
    for (const id of memberIds) {
      if (kingHolders.has(id)) trophyMap[id] = (trophyMap[id] || 0) + 1;
    }
  }

  const kids = rows.map((r) => {
    const latest = r.latest_description
      ? r.extra_count > 0
        ? `${r.latest_description} +${r.extra_count} more...`
        : r.latest_description
      : '';
    return {
      name: r.name,
      emoji: r.avatar_emoji || '',
      money: formatCents(r.main_balance_cents),
      tickets: r.ticket_balance,
      chores_done: r.chore_done,
      chores_total: r.chore_total,
      chores_left: r.chore_total - r.chore_done,
      chores_pct: r.chore_total > 0 ? Math.round((r.chore_done / r.chore_total) * 100) : 0,
      trophies: trophyMap[r.id] || 0,
      latest,
    };
  });

  return {
    family_name: family?.name || 'Family',
    kids,
  };
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
