import { useCallback, useMemo } from 'react';
import db from '../db.js';
import { familyApi } from '../../api/family.api.js';
import useOfflineQuery from './useOfflineQuery.js';

export default function useOfflineFamily() {
  const fetchFn = useCallback(async () => {
    const data = await familyApi.getFamily();
    await db.familyMembers.bulkPut(data.members);
  }, []);

  const { data, loading, isStale, refresh } = useOfflineQuery({
    cacheKey: 'family',
    queryFn: () => db.familyMembers.toArray(),
    fetchFn,
    deps: [],
  });

  const members = data || [];
  const kids = useMemo(
    () => members.filter((m) => (m.role === 'kid' || m.chores_enabled) && m.is_active),
    [members],
  );

  return { members, kids, loading, isStale, refresh };
}
