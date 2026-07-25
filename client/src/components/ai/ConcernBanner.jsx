// Parent-only alert for AI tutor conversations that raised a concern and
// haven't been opened yet.
//
// This is the one part of the feature where latency matters: the tutor has
// already told the child to talk to a grown-up, and this is what makes sure the
// grown-up finds out today rather than whenever they next wander into Wonders.
// It disappears on its own once the thread is opened (reading it stamps
// flag_seen_at server-side).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faChevronRight, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { aiTutorApi } from '../../api/aiTutor.api.js';

export default function ConcernBanner({ isParent }) {
  const navigate = useNavigate();
  const [concerns, setConcerns] = useState([]);

  useEffect(() => {
    if (!isParent) return;
    let cancelled = false;
    aiTutorApi.getConcerns()
      .then((d) => { if (!cancelled) setConcerns(d.concerns || []); })
      .catch(() => { if (!cancelled) setConcerns([]); });
    return () => { cancelled = true; };
  }, [isParent]);

  if (!isParent || concerns.length === 0) return null;

  const urgent = concerns.filter((c) => c.level === 'urgent');
  const heads  = concerns.filter((c) => c.level !== 'urgent');

  return (
    <div className="mb-5 flex flex-col gap-3">
      {urgent.length > 0 && (
        <Group
          tone="urgent"
          title={urgent.length === 1 ? 'Worth a chat' : `${urgent.length} conversations worth a chat`}
          items={urgent}
          navigate={navigate}
        />
      )}
      {heads.length > 0 && (
        <Group
          tone="heads"
          title={heads.length === 1 ? 'Something they asked about' : `${heads.length} things they asked about`}
          items={heads}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// Two tiers, deliberately different in weight. If a question about a swear word
// looked the same as a disclosure of being hurt, the alert would stop meaning
// anything within a week.
const TONES = {
  urgent: {
    wrap:   'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20',
    title:  'text-red-900 dark:text-red-100',
    sub:    'text-red-700/80 dark:text-red-200/70',
    body:   'text-red-800/90 dark:text-red-200/80',
    foot:   'text-red-700/70 dark:text-red-200/60',
    icon:   faTriangleExclamation,
  },
  heads: {
    wrap:   'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20',
    title:  'text-amber-900 dark:text-amber-100',
    sub:    'text-amber-700/80 dark:text-amber-200/70',
    body:   'text-amber-800/90 dark:text-amber-200/80',
    foot:   'text-amber-700/70 dark:text-amber-200/60',
    icon:   faCircleInfo,
  },
};

function Group({ tone, title, items, navigate }) {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border p-4 ${t.wrap}`}>
      <p className={`text-sm font-semibold flex items-center gap-2 ${t.title}`}>
        <FontAwesomeIcon icon={t.icon} />
        {title}
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {items.map((c) => (
          <button
            key={c.threadId}
            onClick={() => navigate(`/wonders/${c.userId}`)}
            className="text-left w-full rounded-lg bg-white/70 dark:bg-gray-900/40 px-3 py-2 hover:bg-white dark:hover:bg-gray-900/70 transition-colors"
          >
            <p className={`text-sm ${t.title}`}>
              <span className="font-semibold">{c.userName}</span>
              <span className={t.sub}> · {c.badgeName}</span>
              <FontAwesomeIcon icon={faChevronRight} className="ml-1.5 text-[10px] opacity-60" />
            </p>
            {c.reason && <p className={`mt-0.5 text-xs ${t.body}`}>{c.reason}</p>}
          </button>
        ))}
      </div>

      <p className={`mt-2 text-[11px] ${t.foot}`}>
        This clears once you open the conversation.
      </p>
    </div>
  );
}
