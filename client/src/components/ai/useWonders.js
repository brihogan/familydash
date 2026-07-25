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

export default function useWonders(userId, enabled) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    setLoading(true);
    aiTutorApi.getWonders(userId)
      .then((data) => {
        if (cancelled) return;
        const list = data.threads || [];
        COUNTS.clear();
        for (const t of list) COUNTS.set(t.stepId, t.messageCount);
        setThreads(list);
      })
      .catch(() => { if (!cancelled) setThreads([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, enabled]);

  return { threads, loading };
}
