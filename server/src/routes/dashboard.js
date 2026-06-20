import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { buildFamilyDashboard } from '../services/dashboardService.js';
import { pushToTrmnl } from '../services/trmnlService.js';

const router = Router();

router.get('/', authenticate, (req, res, next) => {
  try {
    const members = buildFamilyDashboard(req.user.familyId);
    res.json({ members });

    // Fire-and-forget push to TRMNL (throttled, non-blocking)
    pushToTrmnl(req.user.familyId).catch(() => {});
  } catch (err) {
    next(err);
  }
});

export default router;
