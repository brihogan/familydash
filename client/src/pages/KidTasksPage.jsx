import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal, faTag, faXmark, faTicket, faStar, faCheck } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
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
  const { useTickets } = useFamilySettings();
  const isParent   = user?.role === 'parent';

  const [taskSets,     setTaskSets]   = useState([]);
  const [memberName,   setMemberName] = useState('');
  const [member,       setMember]     = useState(null);
  const [kids,         setKids]       = useState([]);
  const [loading,      setLoading]    = useState(true);
  const [error,        setError]      = useState('');
  const [activeFilter, setActiveFilter] = useState(null); // "type:Award" etc.
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

  // ── Filter pills derived from the visible task sets ──────────────────────
  // Each option has a unique `value` like "type:Award" or "tag:Badge" plus
  // a human label. Filter is single-select; clicking the active one clears it.
  const filterOptions = (() => {
    const map = new Map(); // value → { value, label, sort }
    const add = (value, label, sort = 0) => { if (!map.has(value)) map.set(value, { value, label, sort }); };
    for (const ts of visibleSets) {
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

  const sortedSets = visibleSets
    .filter((ts) => setMatchesFilter(ts, activeFilter))
    .sort((a, b) => {
      const typeOrder = (t) => (t === 'Project' ? 0 : 1);
      if (typeOrder(a.type) !== typeOrder(b.type)) return typeOrder(a.type) - typeOrder(b.type);
      return a.name.localeCompare(b.name);
    });

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

  // For each task set, pick the single most-meaningful "primary" pill for the
  // card's top-left badge: prefer an Area-of-Discovery tag, else category, else type.
  const primaryPillFor = (ts) => {
    if (Array.isArray(ts.tags)) {
      const area = ts.tags.find((t) => t.startsWith('Discover'));
      if (area) return { label: area, filterValue: `tag:${area}` };
    }
    if (ts.category && ts.category !== 'Curiosity') return { label: ts.category, filterValue: `category:${ts.category}` };
    if (ts.category) return { label: ts.category, filterValue: `category:${ts.category}` };
    return { label: ts.type, filterValue: `type:${ts.type}` };
  };

  const renderCard = (ts) => {
    const pct  = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
    const done = ts.step_count > 0 && ts.completed_count === ts.step_count;
    const size = 112;
    const sw   = 8;
    const r    = (size - sw * 2) / 2;
    const circ = 2 * Math.PI * r;
    const isFlipped = flippedIds.has(ts.id);

    const borderClass = done
      ? 'border-green-300/70 dark:border-green-700/60'
      : 'border-gray-200/70 dark:border-gray-700/60';

    // For Curiosity badges, tint the card's top gradient with the kid's current
    // badge level color so the level is felt at-a-glance. Uses backgroundImage
    // so the Tailwind bg-white / dark:bg-gray-800 base color shows through at
    // the bottom (works in both light + dark mode).
    const kidLevelCfg = member?.badge_level && BADGE_LEVELS[member.badge_level];
    const useLevelTint = !!(ts.badge_id && kidLevelCfg);
    const cardStyle = useLevelTint
      ? { backgroundImage: `linear-gradient(to bottom, ${kidLevelCfg.color}33 0%, ${kidLevelCfg.color}10 35%, transparent 70%)` }
      : undefined;

    return (
      <div
        key={ts.id}
        className="relative h-full"
        style={{ perspective: '1200px' }}
      >
        <div
          className="relative h-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* ── FRONT ─────────────────────────────────────────── */}
          <div
            onClick={() => !isFlipped && navigate(`/tasks/${userId}/${ts.id}`)}
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', ...(cardStyle || {}) }}
            className={`relative h-full flex flex-col items-center p-4 pt-12 ${useLevelTint ? 'bg-white dark:bg-gray-800' : 'bg-gradient-to-b from-gray-50 to-white dark:from-gray-700/40 dark:to-gray-800'} border rounded-2xl shadow-md hover:shadow-lg cursor-pointer transition-all ${borderClass} hover:border-brand-300/70 dark:hover:border-brand-500/40`}
          >
            {/* Top-left: primary category/type pill (also clickable as filter) */}
            {(() => {
              const primary = primaryPillFor(ts);
              const dot     = filterDotColor(primary.filterValue);
              const isTruncCandidate = primary.label.length > 14;
              return (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); togglePillFilter(primary.filterValue); }}
                  className="absolute top-2 left-2 max-w-[60%] text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center gap-1.5 hover:ring-2 hover:ring-brand-300 transition-shadow"
                  title={primary.label}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                  <span className={`truncate ${isTruncCandidate ? 'max-w-[110px]' : ''}`}>{primary.label}</span>
                </button>
              );
            })()}

            {/* Top-right: tag icon to flip */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); flipCard(ts.id); }}
              className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-brand-500 transition-colors"
              aria-label="Show tags"
              title="Show tags"
            >
              <FontAwesomeIcon icon={faTag} className="text-sm" />
            </button>

            {/* Progress ring + badge image / emoji */}
            <div className="relative mb-3 flex-shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none" stroke="currentColor" strokeWidth={sw}
                  className="text-gray-100 dark:text-gray-700"
                />
                {ts.step_count > 0 && (
                  <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="currentColor" strokeWidth={sw}
                    strokeDasharray={circ}
                    strokeDashoffset={circ - (pct / 100) * circ}
                    strokeLinecap="round"
                    className={done ? 'text-green-500' : 'text-brand-500'}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-4xl leading-none">
                {ts.badge_image_file ? (
                  <img
                    src={`/api/uploads/badges/${ts.badge_image_file}`}
                    alt={ts.name}
                    className="w-20 h-20 rounded-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : ts.badge_id ? (
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
                  >
                    <IconDisplay value={ts.emoji} fallback="🏅" />
                  </div>
                ) : (
                  <IconDisplay value={ts.emoji} fallback="📋" />
                )}
              </div>
              {/* Done checkmark overlay */}
              {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
                <span className="absolute -top-0.5 -right-0.5 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shadow ring-2 ring-white dark:ring-gray-800">
                  <FontAwesomeIcon icon={faCheck} />
                </span>
              )}
            </div>

            {/* Name */}
            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 text-center leading-snug line-clamp-2">
              {ts.name}
            </p>

            {/* Awaiting approval */}
            {done && (ts.completion_status === 'pending' || (ts.pending_step_count ?? 0) > 0) && (
              <span className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">⏳ Awaiting approval</span>
            )}

            {/* Completed today + Done star */}
            {done && ts.completion_status !== 'pending' && !(ts.pending_step_count > 0) && (
              <>
                <span className="mt-1.5 text-xs font-medium text-green-600 dark:text-green-400">Completed today!</span>
                <span className="mt-auto pt-2 text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                  <FontAwesomeIcon icon={faStar} />
                  Done
                </span>
              </>
            )}

            {/* Description */}
            {!done && ts.description && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-center line-clamp-2">{ts.description}</p>
            )}

            {/* Bottom: X/Y · 🎟 N */}
            {ts.step_count > 0 && !done && (
              <span className="mt-auto pt-2 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 font-medium">
                {ts.completed_count}/{ts.step_count}
                {useTickets && ts.ticket_reward > 0 && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <FontAwesomeIcon icon={faTicket} className="text-xs" />
                      {ts.ticket_reward}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>

          {/* ── BACK ──────────────────────────────────────────── */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
            className={`absolute inset-0 flex flex-col p-4 bg-gradient-to-b from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-800 border rounded-xl shadow-sm ${borderClass}`}
          >
            {/* X — flip back to front */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); flipCard(ts.id); }}
              className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-brand-500 transition-colors"
              aria-label="Close tags"
              title="Back"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>

            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 pr-7 mb-3">
              {ts.name}
            </p>

            <div className="flex flex-wrap items-center gap-1.5 p-1 -m-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePillFilter(`type:${ts.type}`); }}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full hover:ring-2 hover:ring-brand-300 transition-shadow ${
                  ts.type === 'Project'
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
              >
                {ts.type}
              </button>
              {ts.category && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); togglePillFilter(`category:${ts.category}`); }}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:ring-2 hover:ring-brand-300 transition-shadow"
                >
                  {ts.category}
                </button>
              )}
              {Array.isArray(ts.tags) && ts.tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); togglePillFilter(`tag:${tag}`); }}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:ring-2 hover:ring-brand-300 transition-shadow"
                >
                  {tag}
                </button>
              ))}
              {ts.badge_level && BADGE_LEVELS[ts.badge_level] && (() => {
                const lvl = BADGE_LEVELS[ts.badge_level];
                return (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePillFilter(`level:${ts.badge_level}`); }}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border hover:ring-2 hover:ring-brand-300 transition-shadow"
                    style={{ backgroundColor: lvl.color, color: lvl.textColor, borderColor: lvl.borderColor }}
                  >
                    {lvl.label}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
          {isParent && kids.length > 1 && (
            <KidProfilePicker kids={kids} currentId={userId} routePrefix="/tasks" className="flex items-center gap-1.5" />
          )}
        </div>
      </div>

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
      ) : sortedSets.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          {activeFilter ? 'No tasks match this filter.' : 'No tasks assigned yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 auto-rows-fr">
          {sortedSets.map(renderCard)}
        </div>
      )}
    </div>
  );
}
