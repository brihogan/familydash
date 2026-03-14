import { useCallback } from 'react';
import db from '../db.js';
import { overviewApi } from '../../api/overview.api.js';
import { activityApi } from '../../api/activity.api.js';
import useOfflineQuery from './useOfflineQuery.js';

export default function useOfflineOverview(userId) {
  const uid = Number(userId);

  // ── Overview (chart, stat cards, etc.) ─────────────────────────────────────
  const overviewFetchFn = useCallback(async () => {
    const data = await overviewApi.getOverview(userId);
    await db.overviewCache.put({ userId: uid, ...data, _ts: Date.now() });
  }, [userId, uid]);

  const { data: overview, loading: overviewLoading, refresh: refreshOverview } = useOfflineQuery({
    cacheKey: `overview-${uid}`,
    queryFn: () => db.overviewCache.get(uid),
    fetchFn: overviewFetchFn,
    deps: [uid],
  });

  // ── Activity feed (all recent, filtered client-side) ───────────────────────
  const activityFetchFn = useCallback(async () => {
    const data = await activityApi.getUserActivity(userId, { limit: 200 });
    await db.activityCache.put({
      userId: uid,
      activity: data.activity ?? [],
      _ts: Date.now(),
    });
  }, [userId, uid]);

  const { data: activityCache, loading: activityLoading, refresh: refreshActivity } = useOfflineQuery({
    cacheKey: `activity-${uid}`,
    queryFn: () => db.activityCache.get(uid),
    fetchFn: activityFetchFn,
    deps: [uid],
  });

  const allActivity = activityCache?.activity ?? [];

  return {
    overview: overview || null,
    overviewLoading,
    refreshOverview,
    allActivity,
    activityLoading,
    refreshActivity,
  };
}
