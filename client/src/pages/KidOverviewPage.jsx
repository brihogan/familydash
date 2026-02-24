import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTachographDigital } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { overviewApi } from '../api/overview.api.js';
import { activityApi } from '../api/activity.api.js';
import { familyApi } from '../api/family.api.js';
import { formatCents } from '../utils/formatCents.js';
import ActivityRow, { GroupedActivityList } from '../components/shared/ActivityRow.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';

// ─── Activity filter config ───────────────────────────────────────────────────

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
  { key: '48h',  label: 'Last 48h',  hours: 48 },
  { key: '7d',   label: '7 days',    hours: 168 },
  { key: '30d',  label: '30 days',   hours: 720 },
  { key: 'all',  label: 'All time',  hours: null },
];

const SEL = 'border border-gray-200 rounded-md px-2 py-1 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-400';

// ─── Weekly bar chart ─────────────────────────────────────────────────────────

function WeeklyChart({ data }) {
  const globalMax = Math.max(
    ...data.flatMap((d) => [d.ticketsFromChores + d.ticketsFromParents, d.choresTotal]),
    1,
  );

  return (
    <div>
      <div className="flex items-end gap-3 h-28">
        {data.map((day) => {
          const ticketsTotal = day.ticketsFromChores + day.ticketsFromParents;
          return (
          <div key={day.date} className="flex-1 flex flex-col gap-1">
            {/* Number labels */}
            <div className="flex gap-0.5 justify-center text-center">
              {ticketsTotal > 0 && (
                <span className="text-xs text-amber-600 font-medium leading-none">{ticketsTotal}</span>
              )}
            </div>
            {/* Bars */}
            <div
              className={`flex gap-0.5 items-end ${day.isToday ? 'opacity-100' : 'opacity-80'}`}
              style={{ height: '88px' }}
            >
              {/* Tickets: stacked chores (amber, bottom) + parent (green, top) */}
              {ticketsTotal > 0 ? (
                <div
                  className="flex-1 flex flex-col rounded-t-sm overflow-hidden transition-all"
                  style={{ height: `${Math.max((ticketsTotal / globalMax) * 88, 4)}px` }}
                  title={`${day.ticketsFromChores} from chores, ${day.ticketsFromParents} from parent`}
                >
                  {day.ticketsFromParents > 0 && (
                    <div className="bg-emerald-400 w-full" style={{ flex: day.ticketsFromParents }} />
                  )}
                  {day.ticketsFromChores > 0 && (
                    <div className="bg-amber-400 w-full" style={{ flex: day.ticketsFromChores }} />
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-[2px] rounded-t-sm bg-gray-100" />
              )}
              {/* Chores: stacked done (blue, bottom) + undone (red, top) */}
              {day.choresTotal > 0 ? (
                <div
                  className="flex-1 flex flex-col rounded-t-sm overflow-hidden transition-all"
                  style={{ height: `${Math.max((day.choresTotal / globalMax) * 88, 4)}px` }}
                  title={`${day.choresDone}/${day.choresTotal} chores done`}
                >
                  {day.choresTotal - day.choresDone > 0 && (
                    <div className="bg-red-400 w-full" style={{ flex: day.choresTotal - day.choresDone }} />
                  )}
                  {day.choresDone > 0 && (
                    <div className="bg-blue-400 w-full" style={{ flex: day.choresDone }} />
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-[2px] rounded-t-sm bg-gray-100" />
              )}
            </div>
          </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="flex gap-3 mt-1">
        {data.map((day) => (
          <div
            key={day.date}
            className={`flex-1 text-center text-xs truncate ${
              day.isToday ? 'font-semibold text-brand-600' : 'text-gray-400'
            }`}
          >
            {day.label}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-3 justify-center mt-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-400" />
          <span className="text-xs text-gray-500">Tickets (chores)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span className="text-xs text-gray-500">Tickets (parent)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-400" />
          <span className="text-xs text-gray-500">Chores done</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-400" />
          <span className="text-xs text-gray-500">Chores pending</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

function StatCard({ onClick, children, accent = 'brand' }) {
  const colors = {
    brand:  'hover:border-brand-300',
    green:  'hover:border-green-300',
    amber:  'hover:border-amber-300',
  };
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer transition-colors ${colors[accent]}`}
    >
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KidOverviewPage() {
  const { userId } = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isParent   = user?.role === 'parent';

  const [overview,   setOverview]   = useState(null);
  const [activity,   setActivity]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [actLoading, setActLoading] = useState(true);
  const [error,      setError]      = useState('');

  const [actDateKey, setActDateKey] = useState('48h');
  const [actTypeKey, setActTypeKey] = useState('all');
  const [kids,       setKids]       = useState([]);

  // Fetch kid list for the switcher (parent only, once)
  useEffect(() => {
    if (!isParent) return;
    familyApi.getFamily()
      .then(({ members }) => setKids(members.filter((m) => m.role === 'kid' && m.is_active)))
      .catch(() => {});
  }, [isParent]);

  // Fetch overview once per userId change
  useEffect(() => {
    setLoading(true);
    setError('');
    overviewApi.getOverview(userId)
      .then(setOverview)
      .catch(() => setError('Failed to load overview.'))
      .finally(() => setLoading(false));
  }, [userId]);

  // Fetch activity whenever userId or filters change
  const fetchActivity = useCallback(() => {
    setActLoading(true);
    const params = { limit: 50 };
    const dateOpt = DATE_OPTIONS.find((d) => d.key === actDateKey);
    if (dateOpt?.hours) {
      params.from = new Date(Date.now() - dateOpt.hours * 3_600_000).toISOString();
    }
    if (actTypeKey !== 'all') {
      params.event_types = TYPE_GROUPS[actTypeKey].join(',');
    }
    activityApi.getUserActivity(userId, params)
      .then((d) => setActivity(d.activity ?? []))
      .catch(() => {})
      .finally(() => setActLoading(false));
  }, [userId, actDateKey, actTypeKey]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error)   return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
  );
  if (!overview) return null;

  const { memberName, ticketBalance, accounts, choreProgressToday, last7Days } = overview;
  const mainAccount    = accounts.find((a) => a.type === 'main');
  const subAccounts    = accounts.filter((a) => a.type !== 'main');
  const chorePct       = choreProgressToday.total > 0
    ? Math.round((choreProgressToday.done / choreProgressToday.total) * 100)
    : 0;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <FontAwesomeIcon icon={faTachographDigital} className="mr-2 text-brand-500" />
            {isParent ? `${memberName}'s Overview` : 'My Overview'}
          </h1>
          {isParent && kids.length > 1 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-xs text-gray-400">Switch to:</span>
              <select
                value={userId}
                onChange={(e) => navigate(`/kid/${e.target.value}`)}
                className="text-sm font-medium text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer hover:border-brand-400 transition-colors"
              >
                {kids.map((k) => (
                  <option key={k.id} value={String(k.id)}>{k.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {isParent && (
          <Link
            to="/family-activity"
            className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
          >
            Full activity →
          </Link>
        )}
      </div>

      {/* ── 7-day chart ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Last 7 Days</h2>
        <WeeklyChart data={last7Days} />
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Bank */}
        <StatCard onClick={() => navigate(`/bank/${userId}`)} accent="green">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bank</p>
          {mainAccount && (
            <p className="text-2xl font-mono font-bold text-gray-900 mb-2">
              {formatCents(mainAccount.balance_cents)}
            </p>
          )}
          {subAccounts.length > 0 && (
            <div className="space-y-1 border-t border-gray-100 pt-2">
              {subAccounts.map((a) => (
                <div key={a.id} className="flex justify-between text-xs text-gray-500">
                  <span className="truncate">{a.name}</span>
                  <span className="font-mono">{formatCents(a.balance_cents)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-brand-500 mt-3">View bank →</p>
        </StatCard>

        {/* Tickets */}
        <StatCard onClick={() => navigate(`/tickets/${userId}`)} accent="amber">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tickets</p>
          <p className="text-2xl font-bold text-amber-600 mb-1">
            {ticketBalance} <span className="text-lg">🎟</span>
          </p>
          <p className="text-xs text-gray-400">current balance</p>
          <p className="text-xs text-brand-500 mt-3">View history →</p>
        </StatCard>

        {/* Chores */}
        <StatCard onClick={() => navigate(`/chores/${userId}`)} accent="brand">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Chores Today</p>
          {choreProgressToday.total > 0 ? (
            <>
              <p className="text-2xl font-bold text-gray-900 mb-2">
                {choreProgressToday.done}
                <span className="text-base font-normal text-gray-400">/{choreProgressToday.total}</span>
              </p>
              <div className="bg-gray-100 rounded-full h-2 mb-1">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all"
                  style={{ width: `${chorePct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">{chorePct}% complete</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">No chores today</p>
          )}
          <p className="text-xs text-brand-500 mt-3">View chores →</p>
        </StatCard>

      </div>

      {/* ── Activity feed ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            {isParent && (
              <Link
                to={`/family-activity?userId=${userId}`}
                className="text-xs text-brand-500 hover:text-brand-700"
              >
                Full activity →
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className={SEL} value={actDateKey} onChange={(e) => setActDateKey(e.target.value)}>
              {DATE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <div className="flex items-center gap-1">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setActTypeKey(o.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    actTypeKey === o.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-4">
          {actLoading ? (
            <LoadingSkeleton rows={4} />
          ) : activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Activity will appear here as actions are taken." />
          ) : (
            <GroupedActivityList activity={activity} showAvatar={false} onUndone={fetchActivity} />
          )}
        </div>
      </div>

    </div>
  );
}
