import { Router } from 'express';
import db from '../db/db.js';
import { requireDeviceToken } from '../middleware/deviceAuth.js';
import { buildFamilyDashboard } from '../services/dashboardService.js';

const router = Router();

// ─── GET /api/device/dashboard ───────────────────────────────────────────────
// Read-only family snapshot for wearable / embedded clients (the Garmin FamDash
// app). Authenticated by a device token (X-Api-Key header), NOT a JWT. Returns a
// compact, self-describing shape — no 2KB cap like the TRMNL webhook, so task
// set names are sent in full.
router.get('/dashboard', requireDeviceToken('read'), (req, res, next) => {
  try {
    const familyId = req.device.familyId;
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(familyId);
    const members = buildFamilyDashboard(familyId);

    const users = members.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: m.avatarEmoji || '',
      isParent: m.role === 'parent',
      balanceCents: m.mainBalanceCents || 0,
      tickets: m.ticketBalance || 0,
      choreDone: m.choreDone || 0,
      choreTotal: m.choreTotal || 0,
      trophies: m.trophyCount || 0,
      taskSets: (m.taskSets || []).map((t) => ({
        name: t.name,
        emoji: t.emoji || '',
        done: t.completedCount || 0,
        total: t.stepCount || 0,
      })),
      activity: m.lastActivityDisplay || '',
    }));

    res.set('Cache-Control', 'no-store');
    res.json({
      family: family?.name || 'Family',
      generatedAt: new Date().toISOString(),
      users,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
