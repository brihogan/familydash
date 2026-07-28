// Every conversation a kid has had, fetched once per page.
//
// Backs three things: the Wonders page, the resume pill, and the "💬 n" marker
// on step rows. The counts live in a module-level map so a deeply nested step
// row can read one without threading a prop through every call site — the
// fetching component re-renders its children when the data lands.

import { useState, useEffect } from 'react';
import { aiTutorApi } from '../../api/aiTutor.api.js';

const COUNTS = new Map(); // stepId -> message count

export function threadCountFor(stepId) {
  return COUNTS.get(stepId) || 0;
}

// Fetching this list is also what kicks off recaps for conversations that have
// gone quiet — they're written in the background and land a few seconds after
// the response. One delayed refetch picks them up; polling would be a lot of
// requests to catch a thing that happens once.
const RECAP_REFETCH_MS = 9000;

export default function useWonders(userId, enabled) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    let timer = null;
    setLoading(true);

    const load = (isRetry) => aiTutorApi.getWonders(userId)
      .then((data) => {
        if (cancelled) return;
        const list = data.threads || [];
        COUNTS.clear();
        for (const t of list) COUNTS.set(t.stepId, t.messageCount);
        setThreads(list);
        // Only ever one retry — if a recap failed, refetching forever won't fix it.
        if (!isRetry && data.recapsPending > 0) {
          timer = setTimeout(() => load(true), RECAP_REFETCH_MS);
        }
      })
      .catch(() => { if (!cancelled && !isRetry) setThreads([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    load(false);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [userId, enabled]);

  return { threads, loading };
}
