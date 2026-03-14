import { useCallback } from 'react';
import db from '../db.js';
import { dashboardApi } from '../../api/dashboard.api.js';
import useOfflineQuery from './useOfflineQuery.js';

export default function useOfflineDashboard() {
  const fetchFn = useCallback(async () => {
    const data = await dashboardApi.getDashboard();
    await db.dashboardMembers.bulkPut(
      data.members.map((m) => ({ ...m, familyId: m.familyId || m.family_id })),
    );
  }, []);

  const { data, loading, isStale, refresh } = useOfflineQuery({
    cacheKey: 'dashboard',
    queryFn: () => db.dashboardMembers.toArray(),
    fetchFn,
    deps: [],
  });

  return { members: data || [], loading, isStale, refresh };
}
