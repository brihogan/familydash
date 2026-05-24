import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal, faTag, faXmark, faTicket, faStar, faCheck, faShieldHalved, faTrophy, faChevronRight, faFolder } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import Modal from '../components/shared/Modal.jsx';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';
import TaskSetCard from '../components/tasks/TaskSetCard.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';

export default function KidTasksPage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const { useTickets, useBadges } = useFamilySettings();
  const isParent   = user?.role === 'parent';

  const [taskSets,     setTaskSets]   = useState([]);
  const [memberName,   setMemberName] = useState('');
  const [member,       setMember]     = useState(null);
  const [kids,         setKids]       = useState([]);
  const [loading,      setLoading]    = useState(true);
  const [error,        setError]      = useState('');
  const [activeFilter, setActiveFilter] = useState(null); // "type:Award" etc.
  const [badgesOpen,   setBadgesOpen]   = useState(false);
  const [flippedIds,   setFlippedIds]   = useState(() => new Set());
  const flipCard = (id) => setFlippedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, familyData] = await Promise.all([
        taskSetsApi.getUserTaskSets(userId),
        familyApi.getFamily(),
      ]);
      setTaskSets(taskData.taskSets);
      const m = familyData.members.find((mm) => mm.id === parseInt(userId, 10));
      if (m) { setMemberName(m.name); setMember(m); }
      if (isParent) setKids(familyData.members.filter((m) => (m.role === 'kid' || !!m.chores_enabled) && m.is_active));
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [userId, isParent]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Filter: keep incomplete sets, completed Projects (stay for the day),
  // and completed Awards earned today (visible until end of day, then only on Trophy Shelf)
  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  };

  const visibleSets = taskSets
    .filter((ts) => {
      const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
      if (!done) return true;
      if (ts.type === 'Project') return true;
      // Keep pending-approval sets visible
      if (ts.completion_status === 'pending' || (ts.pending_step_count ?? 0) > 0) return true;
      return isToday(ts.earned_at);
    });

  // Group Curiosity badges + awards into folder cards on the main page; the
  // sub-pages at /tasks/:userId/group/badges and /awards list the individuals
  // with status + area filters.
  const isBadgeTs = (ts) => Array.isArray(ts.tags) && ts.tags.includes('Badge');
  const isAwardTs = (ts) => Array.isArray(ts.tags) && ts.tags.includes('Award');
  // Folder counts include the kid's complete collection (done + in-flight),
  // matching what they see when they click into the group page.
  const badgeSets = taskSets.filter(isBadgeTs);
  const awardSets = taskSets.filter(isAwardTs);
  const otherSets = visibleSets.filter((ts) => !isBadgeTs(ts) && !isAwardTs(ts));

  // ── Filter pills derived from "other" sets only ──────────────────────────
  // (Curiosity badges/awards live behind folder cards with their own filters.)
  // Each option has a unique `value` like "type:Project" plus a human label.
  // Filter is single-select; clicking the active one clears it.
  const filterOptions = (() => {
    const map = new Map(); // value → { value, label, sort }
    const add = (value, label, sort = 0) => { if (!map.has(value)) map.set(value, { value, label, sort }); };
    for (const ts of otherSets) {
      if (ts.type)     add(`type:${ts.type}`,         ts.type,     1);
      if (ts.category) add(`category:${ts.category}`, ts.category, 2);
      if (Array.isArray(ts.tags)) {
        for (const t of ts.tags) add(`tag:${t}`, t, 3);
      }
      if (ts.badge_level && BADGE_LEVELS[ts.badge_level]) {
        add(`level:${ts.badge_level}`, BADGE_LEVELS[ts.badge_level].label, 4);
      }
    }
    return [...map.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  })();

  const setMatchesFilter = (ts, filter) => {
    if (!filter) return true;
    const [kind, ...rest] = filter.split(':');
    const val = rest.join(':');
    switch (kind) {
      case 'type':     return ts.type === val;
      case 'category': return ts.category === val;
      case 'tag':      return Array.isArray(ts.tags) && ts.tags.includes(val);
      case 'level':    return ts.badge_level === val;
      default:         return true;
    }
  };

  const sortedSets = otherSets
    .filter((ts) => setMatchesFilter(ts, activeFilter))
    .sort((a, b) => {
      const typeOrder = (t) => (t === 'Project' ? 0 : 1);
      if (typeOrder(a.type) !== typeOrder(b.type)) return typeOrder(a.type) - typeOrder(b.type);
      return a.name.localeCompare(b.name);
    });

  const groupCardCounts = (sets) => {
    let done = 0, inProgress = 0;
    let totalSteps = 0, doneSteps = 0;
    for (const ts of sets) {
      totalSteps += ts.step_count || 0;
      doneSteps  += Math.min(ts.completed_count || 0, ts.step_count || 0);
      if (ts.step_count > 0 && ts.completed_count >= ts.step_count) done++;
      else if (ts.completed_count > 0) inProgress++;
    }
    return {
      total: sets.length,
      done, inProgress,
      notStarted: sets.length - done - inProgress,
      totalSteps, doneSteps,
    };
  };

  // Minimal "circle only" folder card: just the progress ring + icon, no chrome.
  // The arc color tracks the kid's badge level (since every badge/award in
  // the folder is at their level): saturated when 100% done, lighter while
  // in-progress, brand-blue if no level set yet.
  const kidLevelCfg = member?.badge_level && BADGE_LEVELS[member.badge_level];
  const renderGroupCard = ({ key, label, icon, sets, color }) => {
    const c = groupCardCounts(sets);
    const size = 96;
    const sw = 8;
    const r = (size - sw) / 2; // stroke flush to button edge — no white halo
    const circ = 2 * Math.PI * r;
    const overallPct = c.totalSteps > 0 ? Math.round((c.doneSteps / c.totalSteps) * 100) : 0;
    const trackColor    = kidLevelCfg?.color       || '#E5E7EB';
    const progressColor = kidLevelCfg?.borderColor || '#6366F1';
    return (
      <button
        key={key}
        type="button"
        onClick={() => navigate(`/tasks/${userId}/group/${key}`)}
        className="relative flex items-center justify-center rounded-full shadow-md hover:shadow-lg hover:opacity-90 transition-all"
        style={{ width: size, height: size }}
        title={`${label} · ${c.total} (${overallPct}% done)`}
      >
        <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
          {overallPct > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={progressColor} strokeWidth={sw}
              strokeDasharray={circ} strokeDashoffset={circ - (overallPct / 100) * circ} strokeLinecap="round" />
          )}
        </svg>
        <span
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <FontAwesomeIcon icon={icon} />
        </span>
      </button>
    );
  };

  const togglePillFilter = (value) => setActiveFilter((cur) => (cur === value ? null : value));

  // How many sets were completed today (visible to the kid)
  const completedTodayCount = visibleSets.filter(
    (ts) => ts.step_count > 0 && ts.completed_count >= ts.step_count && isToday(ts.earned_at)
  ).length;

  // Tag color helper for filter-pill dots and card top-left badge
  const filterDotColor = (value) => {
    const [kind, ...rest] = value.split(':');
    const val = rest.join(':');
    if (kind === 'level' && BADGE_LEVELS[val]) return BADGE_LEVELS[val].borderColor;
    if (kind === 'type')  return val === 'Project' ? '#6366F1' : '#F59E0B'; // brand-blue / amber
    if (kind === 'category') {
      if (val === 'Curiosity') return '#F59E0B';
      return '#A78BFA';
    }
    if (kind === 'tag') {
      if (val === 'Badge')                  return '#A855F7'; // purple
      if (val.startsWith('Discover Health')) return '#EF4444';
      if (val.startsWith('Discover Knowledge')) return '#3B82F6';
      if (val.startsWith('Discover the World')) return '#10B981';
      if (val.startsWith('Discover Art'))    return '#EC4899';
      if (val.startsWith('Discover the Home')) return '#F97316';
      if (val.startsWith('Discover Science')) return '#06B6D4';
      if (val.startsWith('Discover the Outdoors')) return '#84CC16';
      if (val.startsWith('Discover Agriculture')) return '#22C55E';
      if (val.startsWith('Discover Character')) return '#FBBF24';
      return '#9CA3AF';
    }
    return '#9CA3AF';
  };

  // Card render delegated to <TaskSetCard>; keep this wrapper so the
  // pre-existing `renderCard(ts)` call site stays a one-liner.
  const renderCard = (ts) => (
    <TaskSetCard
      key={ts.id}
      taskSet={ts}
      userId={userId}
      member={member}
      isFlipped={flippedIds.has(ts.id)}
      onFlip={flipCard}
      onPillFilter={togglePillFilter}
      useTickets={useTickets}
      minimal
    />
  );


  const firstName = (memberName || '').split(' ')[0];
  const setsCount = visibleSets.length;
  const ticketBalance = member?.ticket_balance ?? 0;

  return (
    <div>
      {/* Header: avatar + greeting + ticket counter + kid switcher */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          {member && (
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl shrink-0"
              style={{ backgroundColor: (member.avatar_color || '#6366f1') + '33' }}
            >
              {member.avatar_emoji || (firstName ? firstName[0].toUpperCase() : '🙂')}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              Hi {firstName || '…'}!
              <span className="ml-1 text-gray-400 dark:text-gray-500 font-medium">· {setsCount} set{setsCount === 1 ? '' : 's'}</span>
            </h1>
            {completedTodayCount > 0 && (
              <p className="text-xs sm:text-sm text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                {completedTodayCount} completed today
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {useTickets && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-semibold flex items-center gap-1.5">
              <FontAwesomeIcon icon={faTicket} className="text-xs" />
              {ticketBalance}
            </span>
          )}
        </div>
      </div>

      {isParent && kids.length > 1 && (
        <div className="mb-5">
          <KidProfilePicker kids={kids} currentId={userId} routePrefix="/tasks" className="flex items-center gap-2 p-1 overflow-x-auto scrollbar-hide min-w-0" />
        </div>
      )}

      {useBadges && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setBadgesOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-brand-300 dark:hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 shadow-sm transition-colors"
          >
            <FontAwesomeIcon icon={faShieldHalved} className="text-brand-500" />
            Browse Badges
          </button>
        </div>
      )}

      <Modal open={badgesOpen} onClose={() => setBadgesOpen(false)} title="Browse Badges" size="xl">
        <BadgeBrowser
          userId={parseInt(userId, 10)}
          compact
          onEnrolled={(taskSetId) => {
            setBadgesOpen(false);
            navigate(`/tasks/${userId}/${taskSetId}`);
          }}
        />
      </Modal>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Filter pills — colored dot per pill, black background when selected */}
      {filterOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              !activeFilter
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {filterOptions.map((opt) => {
            const isActive = activeFilter === opt.value;
            const dotColor = filterDotColor(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => togglePillFilter(opt.value)}
                className={`text-sm px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (badgeSets.length === 0 && awardSets.length === 0 && sortedSets.length === 0) ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          {activeFilter ? 'No tasks match this filter.' : 'No tasks assigned yet.'}
        </div>
      ) : (
        // Flex-wrap layout: circles flow naturally and pack tighter than a grid.
        <div className="flex flex-wrap gap-4 sm:gap-5">
          {awardSets.length > 0 && renderGroupCard({
            key: 'awards',
            label: 'Awards',
            icon: faFolder,
            sets: awardSets,
            color: '#F97316', // orange-500
          })}
          {badgeSets.length > 0 && renderGroupCard({
            key: 'badges',
            label: 'Badges',
            icon: faFolder,
            sets: badgeSets,
            color: '#A855F7', // purple-500
          })}
          {sortedSets.map(renderCard)}
        </div>
      )}
    </div>
  );
}
