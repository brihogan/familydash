import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { activityApi } from '../api/activity.api.js';
import { familyApi } from '../api/family.api.js';
import ActivityRow, { GroupedActivityList } from '../components/shared/ActivityRow.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';

// ─── Filter config ───────────────────────────────────────────────────────────

const TYPE_GROUPS = {
  bank:    ['deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'allowance', 'manual_adjustment'],
  chores:  ['chore_completed', 'chore_undone', 'chores_all_done'],
  tasks:   ['task_step_completed', 'task_step_undone', 'taskset_completed'],
  rewards: ['reward_redeemed'],
  tickets: ['tickets_added', 'tickets_removed'],
};

const TYPE_OPTIONS = [
  { key: 'all',     label: 'All' },
  { key: 'bank',    label: 'Bank' },
  { key: 'chores',  label: 'Chores' },
  { key: 'tasks',   label: 'Sets/Steps' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'tickets', label: 'Tickets' },
];

const DATE_OPTIONS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d',        label: 'Last 7 days' },
  { key: 'all',       label: 'All' },
];

// Returns local midnight converted to UTC in SQLite's "YYYY-MM-DD HH:MM:SS" format.
// offsetDays=0 → today's midnight, offsetDays=1 → yesterday's midnight, etc.
// Using SQLite format (space separator, no Z) ensures correct string comparison
// against stored timestamps regardless of the T vs space separator issue.
function localMidnightUTC(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offsetDays) d.setDate(d.getDate() - offsetDays);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const SELECT_CLS = 'border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400';

// ─── Page ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function FamilyActivityPage() {
  const location = useLocation();

  // filter state — pre-populate userId from ?userId= query param if present
  const [dateKey, setDateKey]   = useState('today');
  const [typeKey, setTypeKey]   = useState('all');
  const [userId,  setUserId]    = useState(() => new URLSearchParams(location.search).get('userId') ?? '');

  // data state
  const [activity,  setActivity]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [members,   setMembers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Load family members once for the person filter
  useEffect(() => {
    familyApi.getFamily()
      .then(({ members: m }) => setMembers(m.filter(mb => mb.is_active && mb.show_on_dashboard)))
      .catch(() => {});
  }, []);

  const buildParams = useCallback((p) => {
    const params = { page: p, limit: PAGE_SIZE };

    if (dateKey === 'today') {
      params.from = localMidnightUTC(0);
    } else if (dateKey === 'yesterday') {
      params.from = localMidnightUTC(1);
      params.to   = localMidnightUTC(0);
    } else if (dateKey === '7d') {
      params.from = localMidnightUTC(6);
    }
    // 'all' → no date params

    if (typeKey !== 'all') {
      params.event_types = TYPE_GROUPS[typeKey].join(',');
    }

    if (userId) {
      params.subject_user_id = userId;
    }

    return params;
  }, [dateKey, typeKey, userId]);

  const fetchActivity = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await activityApi.getFamilyActivity(buildParams(p));
      setActivity(data.activity);
      setTotal(data.total);
      setPage(p);
    } catch {
      setError('Failed to load activity.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Re-fetch from page 1 whenever any filter changes
  useEffect(() => { fetchActivity(1); }, [fetchActivity]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        <FontAwesomeIcon icon={faScroll} className="mr-2 text-brand-500" />
        Family Activity
      </h1>

      {/* ── Filter bar ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 mb-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">Date</span>
            <select className={SELECT_CLS} value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
              {DATE_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500">Type</span>
            <div className="flex items-center gap-1">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setTypeKey(opt.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    typeKey === opt.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 dark:text-gray-500">Person</span>
              <select className={SELECT_CLS} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Everyone</option>
                {members.map(m => (
                  <option key={m.id} value={String(m.id)}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : activity.length === 0 ? (
        <EmptyState title="No activity found" description="Try adjusting the filters above." />
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 shadow-sm mb-4">
            <GroupedActivityList activity={activity} onUndone={() => fetchActivity(page)} />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{total} total events</span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchActivity(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button
                  onClick={() => fetchActivity(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
