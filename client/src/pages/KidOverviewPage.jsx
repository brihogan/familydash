import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTachographDigital, faCrown, faBroom, faChevronDown, faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { overviewApi } from '../api/overview.api.js';
import { activityApi } from '../api/activity.api.js';
import { familyApi } from '../api/family.api.js';
import { formatCents } from '../utils/formatCents.js';
import ActivityRow, { GroupedActivityList } from '../components/shared/ActivityRow.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';
import ProgressRing from '../components/dashboard/ProgressRing.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';

// ─── Activity filter config ───────────────────────────────────────────────────

const TYPE_GROUPS = {
  bank:    ['deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'allowance', 'manual_adjustment'],
  chores:  ['chore_completed', 'chore_undone', 'chores_all_done'],
  tasks:   ['task_step_completed', 'task_step_undone', 'taskset_completed'],
  rewards: ['reward_redeemed', 'reward_undone'],
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

function localMidnightUTC(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offsetDays) d.setDate(d.getDate() - offsetDays);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const SEL = 'border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400';

// ─── Weekly bar chart ─────────────────────────────────────────────────────────

function WeeklyChart({ data }) {
  const { useTickets } = useFamilySettings();
  const globalMax = Math.max(
    ...data.flatMap((d) => [
      useTickets ? d.ticketsFromChores + d.ticketsFromParents : 0,
      d.choresTotal + (d.stepsDone ?? 0),
    ]),
    1,
  );

  return (
    <div>
      {/* One column per day — divide-x draws the subtle vertical separators */}
      <div className="flex divide-x divide-gray-100 dark:divide-gray-700">
        {data.map((day) => {
          const ticketsTotal  = day.ticketsFromChores + day.ticketsFromParents;
          const stepsDone     = day.stepsDone ?? 0;
          const combined      = day.choresTotal + stepsDone;
          const choreBarH     = combined > 0 ? Math.max((combined / globalMax) * 88, 4) : 0;
          const allChoresDone = day.choresTotal > 0 && day.choresDone === day.choresTotal;
          return (
          <div key={day.date} className="flex-1 flex flex-col px-1.5 first:pl-0 last:pr-0">
            {/* Number label */}
            <div className="flex justify-center mb-1 h-4">
              {useTickets && ticketsTotal > 0 && (
                <span className="text-xs text-amber-600 font-medium leading-none">{ticketsTotal}</span>
              )}
            </div>
            {/* Bars */}
            <div
              className={`flex gap-0.5 items-end ${day.isToday ? 'opacity-100' : 'opacity-80'}`}
              style={{ height: '88px' }}
            >
              {/* Tickets: stacked chores (amber, bottom) + parent (green, top) */}
              {useTickets && (ticketsTotal > 0 ? (
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
                <div className="flex-1 min-h-[2px] rounded-t-sm bg-gray-100 dark:bg-gray-700" />
              ))}
              {/* Chores + tasks bar with optional crown */}
              <div className="flex-1 relative flex items-end">
                {allChoresDone && (
                  <FontAwesomeIcon
                    icon={faCrown}
                    className="absolute left-1/2 -translate-x-1/2 text-yellow-400"
                    style={{ bottom: `${choreBarH + 3}px`, fontSize: '11px' }}
                  />
                )}
                {combined > 0 ? (
                  <div
                    className="w-full flex flex-col rounded-t-sm overflow-hidden transition-all"
                    style={{ height: `${choreBarH}px` }}
                    title={`${day.choresDone}/${day.choresTotal} chores done, ${stepsDone} task steps`}
                  >
                    {day.choresTotal - day.choresDone > 0 && (
                      <div className="bg-red-400 w-full" style={{ flex: day.choresTotal - day.choresDone }} />
                    )}
                    {stepsDone > 0 && (
                      <div className="bg-violet-400 w-full" style={{ flex: stepsDone }} />
                    )}
                    {day.choresDone > 0 && (
                      <div className="bg-blue-400 w-full" style={{ flex: day.choresDone }} />
                    )}
                  </div>
                ) : (
                  <div className="w-full min-h-[2px] rounded-t-sm bg-gray-100 dark:bg-gray-700" />
                )}
              </div>
            </div>
            {/* Day label */}
            <div className={`text-center text-xs mt-1 truncate ${
              day.isToday ? 'font-semibold text-brand-600' : 'text-gray-400 dark:text-gray-500'
            }`}>
              {day.label}
            </div>
          </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 justify-center mt-3 flex-wrap">
        {useTickets && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Tickets (chores)</span>
          </div>
        )}
        {useTickets && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Tickets (parent)</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Chores done</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-violet-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Set steps</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-400" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Chores pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faCrown} className="text-yellow-400 text-xs" />
          <span className="text-xs text-gray-500 dark:text-gray-400">All chores done</span>
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
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm cursor-pointer transition-colors ${colors[accent]}`}
    >
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KidOverviewPage() {
  const { userId } = useParams();
  const { user, logout } = useAuth();
  const { useBanking, useSets, useTickets } = useFamilySettings();
  const navigate   = useNavigate();
  const isParent   = user?.role === 'parent';

  const [overview,   setOverview]   = useState(null);
  const [activity,   setActivity]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [actLoading, setActLoading] = useState(true);
  const [error,      setError]      = useState('');

  const [actDateKey,  setActDateKey]  = useState('today');
  const [actTypeKey,  setActTypeKey]  = useState('all');
  const [kids,        setKids]        = useState([]);
  const [memberRole,  setMemberRole]  = useState(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Fetch kid list for the switcher (parent only, once)
  useEffect(() => {
    if (!isParent) return;
    familyApi.getFamily()
      .then(({ members }) => {
        setKids(members.filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
        const viewed = members.find((m) => m.id === parseInt(userId, 10));
        if (viewed) setMemberRole(viewed.role);
      })
      .catch(() => {});
  }, [isParent, userId]);

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
    if (actDateKey === 'today') {
      params.from = localMidnightUTC(0);
    } else if (actDateKey === 'yesterday') {
      params.from = localMidnightUTC(1);
      params.to   = localMidnightUTC(0);
    } else if (actDateKey === '7d') {
      params.from = localMidnightUTC(6);
    }
    // 'all' → no date params
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
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
  );
  if (!overview) return null;

  const { memberName, ticketBalance, accounts, choreProgressToday, last7Days,
          taskSets = [], trophyCount = 0, trophyCategories = [] } = overview;
  const mainAccount = accounts.find((a) => a.type === 'main');
  const subAccounts = accounts.filter((a) => a.type !== 'main');
  const chorePct    = choreProgressToday.total > 0
    ? Math.round((choreProgressToday.done / choreProgressToday.total) * 100)
    : 0;
  const choreDone   = choreProgressToday.total > 0 && choreProgressToday.done === choreProgressToday.total;
  const viewingParent = memberRole === 'parent';
  const showBanking = useBanking && !viewingParent;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="relative min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FontAwesomeIcon icon={faTachographDigital} className="text-brand-500 text-2xl shrink-0" />
            {isParent && kids.length > 1 ? (
              <button onClick={() => setSwitcherOpen((o) => !o)} className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{memberName}'s Overview</h1>
                <FontAwesomeIcon icon={faChevronDown} className={`text-gray-400 text-sm shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {isParent ? `${memberName}'s Overview` : 'My Overview'}
              </h1>
            )}
          </div>
          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                {kids.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => { setSwitcherOpen(false); navigate(`/kid/${k.id}`); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      String(k.id) === String(userId) ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {isParent && (
          <Link
            to={`/settings/users/${userId}`}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
            title="User settings"
          >
            <FontAwesomeIcon icon={faGear} className="text-lg" />
          </Link>
        )}
      </div>

      {/* ── 7-day chart ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Last 7 Days</h2>
        <WeeklyChart data={last7Days} />
      </div>

      {/* ── Stat cards ── */}
      <div className={`grid gap-4 ${{ 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[[showBanking, useTickets, true, true].filter(Boolean).length]}`}>

        {/* Bank */}
        {showBanking && (
          <StatCard onClick={() => navigate(`/bank/${userId}`)} accent="green">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Bank</p>
            {mainAccount && (
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100 mb-2">
                {formatCents(mainAccount.balance_cents)}
              </p>
            )}
            {subAccounts.length > 0 && (
              <div className="space-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                {subAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate">{a.name}</span>
                    <span className="font-mono">{formatCents(a.balance_cents)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-brand-500 mt-3">View bank →</p>
          </StatCard>
        )}

        {/* Tickets */}
        {useTickets && (
          <StatCard onClick={() => navigate(`/tickets/${userId}`)} accent="amber">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Tickets</p>
            <p className="text-2xl font-bold text-amber-600 mb-1">
              {ticketBalance} <span className="text-lg">🎟</span>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">current balance</p>
            <p className="text-xs text-brand-500 mt-3">View history →</p>
          </StatCard>
        )}

        {/* Trophies */}
        <StatCard onClick={() => navigate(`/trophies/${userId}`)} accent="amber">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Trophies</p>
          <p className="text-2xl font-bold text-amber-500 dark:text-amber-400 mb-1">
            🏆 {trophyCount}
          </p>
          {trophyCategories.length > 0 ? (
            <div className="space-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
              {trophyCategories.map(({ name, count }) => (
                <div key={name} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">{name}</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No achievements yet</p>
          )}
          <p className="text-xs text-brand-500 mt-3">View shelf →</p>
        </StatCard>

        {/* Today's Progress (chore + task set rings) */}
        <StatCard onClick={() => navigate(`/chores/${userId}`)} accent="brand">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Today's Progress</p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Chore ring */}
            <ProgressRing
              pct={chorePct}
              done={choreDone}
              size={56}
              title={`Chores: ${choreProgressToday.done}/${choreProgressToday.total}`}
              onClick={(e) => { e.stopPropagation(); navigate(`/chores/${userId}`); }}
            >
              <FontAwesomeIcon icon={choreDone ? faCrown : faBroom} className={choreDone ? 'text-yellow-400' : undefined} />
            </ProgressRing>
            {/* Task set rings — 2 per column, fill vertically first */}
            {useSets && taskSets.length > 0 && (
              <div
                className="grid gap-0.5"
                style={{ gridTemplateRows: 'repeat(2, auto)', gridAutoFlow: 'column' }}
              >
                {taskSets.map((ts) => {
                  const pct = ts.stepCount > 0 ? Math.round((ts.completedCount / ts.stepCount) * 100) : 0;
                  return (
                    <ProgressRing
                      key={ts.id}
                      pct={pct}
                      done={pct === 100}
                      size={27}
                      title={ts.name}
                      onClick={(e) => { e.stopPropagation(); navigate(`/tasks/${userId}`); }}
                    >
                      <IconDisplay value={ts.emoji} fallback="📋" />
                    </ProgressRing>
                  );
                })}
              </div>
            )}
          </div>
          {choreProgressToday.total > 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{chorePct}% of chores done</p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 italic">No chores today</p>
          )}
          <p className="text-xs text-brand-500 mt-1">View chores →</p>
        </StatCard>

      </div>

      {/* ── Activity feed ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Activity</h2>
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
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 dark:text-gray-500">Date</span>
              <select className={SEL} value={actDateKey} onChange={(e) => setActDateKey(e.target.value)}>
                {DATE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            {/* Mobile: dropdown */}
            <select
              className={`sm:hidden ${SEL}`}
              value={actTypeKey}
              onChange={(e) => setActTypeKey(e.target.value)}
            >
              {TYPE_OPTIONS.filter((o) => (showBanking || o.key !== 'bank') && (useSets || o.key !== 'tasks') && (useTickets || (o.key !== 'rewards' && o.key !== 'tickets'))).map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {/* Desktop: pills */}
            <div className="hidden sm:flex items-center gap-1">
              {TYPE_OPTIONS.filter((o) => (showBanking || o.key !== 'bank') && (useSets || o.key !== 'tasks') && (useTickets || (o.key !== 'rewards' && o.key !== 'tickets'))).map((o) => (
                <button
                  key={o.key}
                  onClick={() => setActTypeKey(o.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    actTypeKey === o.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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

      {/* Kid logout */}
      {!isParent && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            Log out
          </button>
        </div>
      )}

      {/* Logout confirm dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative z-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xs p-6 text-center">
            <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Log out?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Are you sure you want to log out?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => { await logout(); navigate('/login'); }}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
