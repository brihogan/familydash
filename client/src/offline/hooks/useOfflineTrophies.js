import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { taskSetsApi } from '../../api/taskSets.api.js';
import useOfflineQuery from './useOfflineQuery.js';

export default function useOfflineTrophies(userId) {
  const uid = Number(userId);

  const fetchFn = useCallback(async () => {
    const data = await taskSetsApi.getUserTaskSets(userId);
    await db.trophyCache.put({ userId: uid, ...data, lastSync: Date.now() });
  }, [userId, uid]);

  const { data: cached, loading, refresh } = useOfflineQuery({
    cacheKey: `trophies-${uid}`,
    queryFn: () => db.trophyCache.get(uid),
    fetchFn,
    deps: [uid],
  });

  const taskSets = cached?.taskSets || [];
  const streaks = cached?.streaks ?? { current: 0, longest: 0 };
  const savingsStreak = cached?.savingsStreak ?? null;
  const crownStreak = cached?.crownStreak ?? { current: 0, longest: 0 };
  const hasKingOfCrowns = cached?.hasKingOfCrowns ?? false;

  // Filter to completed awards (trophy-worthy)
  const trophies = taskSets
    .filter((ts) => ts.type === 'Award' && ts.step_count > 0 && ts.completed_count === ts.step_count
      && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0))
    .sort((a, b) => {
      if (!a.earned_at && !b.earned_at) return 0;
      if (!a.earned_at) return 1;
      if (!b.earned_at) return -1;
      return b.earned_at.localeCompare(a.earned_at);
    });

  return {
    trophies,
    streaks,
    savingsStreak,
    crownStreak,
    hasKingOfCrowns,
    loading: loading && !cached,
    refresh,
  };
}
