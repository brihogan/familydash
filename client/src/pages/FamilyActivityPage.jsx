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
  chores:  ['chore_completed', 'chore_undone'],
  rewards: ['reward_redeemed'],
  tickets: ['tickets_added', 'tickets_removed'],
};

const TYPE_OPTIONS = [
  { key: 'all',     label: 'All' },
  { key: 'bank',    label: 'Bank' },
  { key: 'chores',  label: 'Chores' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'tickets', label: 'Tickets' },
];

const DATE_OPTIONS = [
  { key: '48h',  label: 'Last 48h',   hours: 48 },
  { key: '7d',   label: '7 days',     hours: 168 },
  { key: '30d',  label: '30 days',    hours: 720 },
  { key: 'all',  label: 'All time',   hours: null },
];

const SELECT_CLS = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent';

// ─── Page ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function FamilyActivityPage() {
  const location = useLocation();

  // filter state — pre-populate userId from ?userId= query param if present
  const [dateKey, setDateKey]   = useState('48h');
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

    const dateOpt = DATE_OPTIONS.find(d => d.key === dateKey);
    if (dateOpt?.hours) {
      params.from = new Date(Date.now() - dateOpt.hours * 3_600_000).toISOString();
    }

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
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        <FontAwesomeIcon icon={faScroll} className="mr-2 text-brand-500" />
        Family Activity
      </h1>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 mb-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Date</span>
            <select className={SELECT_CLS} value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
              {DATE_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">Type</span>
            <div className="flex items-center gap-1">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setTypeKey(opt.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    typeKey === opt.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Person</span>
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
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : activity.length === 0 ? (
        <EmptyState title="No activity found" description="Try adjusting the filters above." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 px-4 shadow-sm mb-4">
            <GroupedActivityList activity={activity} onUndone={() => fetchActivity(page)} />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{total} total events</span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchActivity(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button
                  onClick={() => fetchActivity(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
