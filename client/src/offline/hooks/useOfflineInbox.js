import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { inboxApi } from '../../api/inbox.api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function useOfflineInbox() {
  const { user } = useAuth();
  const familyId = user?.familyId;

  const cached = useLiveQuery(
    () => familyId ? db.inboxCache.get(familyId) : undefined,
    [familyId],
  );

  const refresh = useCallback(async () => {
    if (!familyId) return;
    try {
      const data = await inboxApi.getInbox();
      await db.inboxCache.put({ familyId, kids: data.kids, lastSync: Date.now() });
      await db.syncMeta.put({ key: `inbox-${familyId}`, lastSync: Date.now() });
      window.dispatchEvent(new CustomEvent('inbox-updated'));
    } catch { /* offline — cached is fine */ }
  }, [familyId]);

  const kids = cached?.kids || [];
  const count = kids.reduce(
    (sum, k) => sum + k.chores.length + k.steps.length + (k.setCompletions || []).length + (k.notifications || []).length,
    0,
  );

  return {
    kids,
    count,
    loading: cached === undefined && !!familyId,
    refresh,
  };
}
