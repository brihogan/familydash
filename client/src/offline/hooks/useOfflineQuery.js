import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';
import { isSyncInProgress } from '../syncEngine.js';

const STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generic offline-first query hook.
 *
 * @param {object} opts
 * @param {string} opts.cacheKey  - Key in syncMeta table to track last fetch
 * @param {function} opts.queryFn - Dexie query that returns cached data (passed to useLiveQuery)
 * @param {function} opts.fetchFn - Async function that fetches from API and writes to Dexie
 * @param {Array} opts.deps       - Dependency array for re-fetching
 */
export default function useOfflineQuery({ cacheKey, queryFn, fetchFn, deps = [] }) {
  const [isStale, setIsStale] = useState(true);
  const fetchingRef = useRef(false);

  // Reactive read from Dexie — auto re-renders when data changes
  const data = useLiveQuery(queryFn, deps);

  // loading = true only when we have no cached data at all
  const loading = data === undefined;

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;

    // Don't fetch while sync engine is active or mutations are queued —
    // the sync engine pushes first, then pulls fresh data.
    if (isSyncInProgress()) return;
    const pendingCount = await db.mutationQueue
      .where('status').anyOf('pending', 'processing').count();
    if (pendingCount > 0) return;

    fetchingRef.current = true;
    try {
      await fetchFn();
      await db.syncMeta.put({ key: cacheKey, lastSync: Date.now() });
      setIsStale(false);
    } catch {
      // Network error — stale data is fine
    } finally {
      fetchingRef.current = false;
    }
  }, [cacheKey, fetchFn]);

  // On mount / dep change: check staleness and fetch if needed
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const meta = await db.syncMeta.get(cacheKey);
      const stale = !meta || Date.now() - meta.lastSync > STALE_MS;
      if (!cancelled) setIsStale(stale);
      if (stale || data === undefined) {
        await refresh();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  return { data: data ?? null, loading, isStale, refresh };
}
