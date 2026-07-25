import { Router } from 'express';
import db from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

// ─── Admin Dashboard ──────────────────────────────────────────────────────
router.get('/dashboard', (req, res, next) => {
  try {
    // Family overview with member counts and last login
    const families = db.prepare(`
      SELECT
        f.id,
        f.name AS family_name,
        f.created_at,
        f.badges_access,
        f.ai_tutor_access,
        f.claude_access,
        COUNT(DISTINCT CASE WHEN u.role = 'kid' AND u.is_active = 1 THEN u.id END) AS kid_count,
        COUNT(DISTINCT CASE WHEN u.role = 'parent' AND u.is_active = 1 THEN u.id END) AS parent_count,
        MAX(ll.created_at) AS last_login,
        (
          SELECT COUNT(*) FROM login_logs ll2
          WHERE ll2.family_id = f.id
            AND ll2.created_at >= datetime('now', '-7 days')
        ) AS logins_last_7d
      FROM families f
      LEFT JOIN users u ON u.family_id = f.id
      LEFT JOIN login_logs ll ON ll.family_id = f.id
      GROUP BY f.id
      ORDER BY last_login DESC NULLS LAST
    `).all();

    // Totals
    const totalFamilies = families.length;
    const activeFamilies = families.filter(f => {
      if (!f.last_login) return false;
      const daysSince = (Date.now() - new Date(f.last_login + 'Z').getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 30;
    }).length;

    res.json({ totalFamilies, activeFamilies, families });
  } catch (err) {
    next(err);
  }
});

// ─── Login Activity (recent logins with IP/UA) ────────────────────────────
router.get('/login-activity', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const logs = db.prepare(`
      SELECT
        ll.id,
        ll.user_id,
        ll.family_id,
        ll.ip_address,
        ll.user_agent,
        ll.created_at,
        u.name AS user_name,
        u.role,
        f.name AS family_name
      FROM login_logs ll
      JOIN users u ON u.id = ll.user_id
      JOIN families f ON f.id = ll.family_id
      ORDER BY ll.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const totalCount = db.prepare('SELECT COUNT(*) AS n FROM login_logs').get().n;

    // Suspicious activity: IPs with logins across multiple families
    const suspiciousIps = db.prepare(`
      SELECT ip_address, COUNT(DISTINCT family_id) AS family_count, COUNT(*) AS login_count
      FROM login_logs
      WHERE ip_address IS NOT NULL
        AND created_at >= datetime('now', '-30 days')
      GROUP BY ip_address
      HAVING COUNT(DISTINCT family_id) > 1
      ORDER BY family_count DESC
      LIMIT 20
    `).all();

    // High-frequency IPs in last 24h (possible bots)
    const highFreqIps = db.prepare(`
      SELECT ip_address, COUNT(*) AS login_count, COUNT(DISTINCT user_id) AS user_count
      FROM login_logs
      WHERE ip_address IS NOT NULL
        AND created_at >= datetime('now', '-1 day')
      GROUP BY ip_address
      HAVING COUNT(*) > 20
      ORDER BY login_count DESC
      LIMIT 20
    `).all();

    res.json({ logs, totalCount, suspiciousIps, highFreqIps });
  } catch (err) {
    next(err);
  }
});

// ─── Family Detail (members + recent logins for one family) ───────────────
router.get('/families/:familyId', (req, res, next) => {
  try {
    const familyId = parseInt(req.params.familyId);

    const members = db.prepare(`
      SELECT u.id, u.name, u.role, u.is_active, u.created_at,
        (SELECT MAX(ll.created_at) FROM login_logs ll WHERE ll.user_id = u.id) AS last_login,
        (SELECT COUNT(*) FROM login_logs ll WHERE ll.user_id = u.id AND ll.created_at >= datetime('now', '-7 days')) AS logins_7d
      FROM users u
      WHERE u.family_id = ?
      ORDER BY u.role, u.name
    `).all(familyId);

    const recentLogins = db.prepare(`
      SELECT ll.created_at, ll.ip_address, ll.user_agent, u.name AS user_name, u.role
      FROM login_logs ll
      JOIN users u ON u.id = ll.user_id
      WHERE ll.family_id = ?
      ORDER BY ll.created_at DESC
      LIMIT 20
    `).all(familyId);

    res.json({ members, recentLogins });
  } catch (err) {
    next(err);
  }
});

// ─── Feature gates per family (super-admin only) ──────────────────────────
// Registration is open, so anything a family can switch on for itself is
// effectively public. These three cost money or carry real responsibility, so
// they're granted here and nowhere else:
//   badges_access   — may use Curiosity Untamed at all
//   ai_tutor_access — may use the badge-step AI tutor (spends our Anthropic key)
//   claude_access   — may use Claude Code terminals / Apps
const FEATURE_COLUMNS = ['badges_access', 'ai_tutor_access', 'claude_access'];

router.patch('/families/:familyId/features', (req, res, next) => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const family = db.prepare('SELECT id FROM families WHERE id = ?').get(familyId);
    if (!family) return res.status(404).json({ error: 'Family not found.' });

    const updates = [];
    const values = [];
    for (const col of FEATURE_COLUMNS) {
      if (req.body?.[col] === undefined) continue;
      updates.push(`${col} = ?`);
      values.push(req.body[col] ? 1 : 0);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(familyId);
    db.prepare(`UPDATE families SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Revoking access shouldn't leave per-user switches on underneath it —
    // otherwise re-granting silently turns the feature back on for everyone it
    // was ever enabled for.
    if (req.body?.ai_tutor_access === false) {
      db.prepare('UPDATE users SET ai_tutor_enabled = 0 WHERE family_id = ?').run(familyId);
    }
    if (req.body?.claude_access === false) {
      db.prepare('UPDATE users SET claude_enabled = 0 WHERE family_id = ?').run(familyId);
    }
    if (req.body?.badges_access === false) {
      db.prepare('UPDATE families SET use_badges = 0 WHERE id = ?').run(familyId);
    }

    const updated = db.prepare(
      'SELECT id, badges_access, ai_tutor_access, claude_access FROM families WHERE id = ?',
    ).get(familyId);
    res.json({ family: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
