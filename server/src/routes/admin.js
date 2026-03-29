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

export default router;
