import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal, faTag, faXmark, faTicket, faStar, faCheck, faShieldHalved, faTrophy, faChevronRight, faFolder } from '@fortawesome/free-solid-svg-icons';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import KidProfilePicker from '../components/shared/KidProfilePicker.jsx';
import Modal from '../components/shared/Modal.jsx';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';
import TaskSetCard, { useMedallionSize, useIsDark } from '../components/tasks/TaskSetCard.jsx';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';

export default function KidTasksPage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();
  const { useTickets, useBadges } = useFamilySettings();
  const medallionSize = useMedallionSize();
  const isDark = useIsDark();
  const isParent   = user?.role === 'parent';

  const [taskSets,     setTaskSets]   = useState([]);
  const [memberName,   setMemberName] = useState('');
  const [member,       setMember]     = useState(null);
  const [kids,         setKids]       = useState([]);
  const [loading,      setLoading]    = useState(true);
  const [error,        setError]      = useState('');
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

  // Pinned task sets surface at the top of /tasks/:userId regardless of
  // type (loose tasks, badges, awards all show here when pinned). Badges
  // and awards still appear inside their folder card too — pinning just
  // adds them up here, doesn't move them.
  // Sort: awards first, then badges, then loose; within each type
  // in-progress → not-started → completed; alpha as final tiebreak.
  const pinnedTypeOrder = (ts) => isAwardTs(ts) ? 0 : isBadgeTs(ts) ? 1 : 2;
  const pinnedStatusOrder = (ts) => {
    const total = ts.step_count || 0;
    const done  = ts.completed_count || 0;
    if (total > 0 && done >= total) return 2; // completed
    if (done > 0) return 0;                   // in-progress
    return 1;                                 // not-started
  };
  const pinnedSets = visibleSets
    .filter((ts) => ts.is_pinned)
    .sort((a, b) => {
      const ta = pinnedTypeOrder(a), tb = pinnedTypeOrder(b);
      if (ta !== tb) return ta - tb;
      const sa = pinnedStatusOrder(a), sb = pinnedStatusOrder(b);
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

  // Loose sets excluding pinned ones (they're already rendered above) so
  // we don't double-render.
  const sortedSets = otherSets
    .filter((ts) => !ts.is_pinned)
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
    const size = medallionSize;
    const sw = 8;
    // Inner disc / arc text scale with the badge so 104px folder cards
    // keep the same look as 120px ones at the sm+ breakpoint.
    const innerSize = Math.round(size * 0.77);
    const r = (size - sw) / 2; // stroke flush to button edge — no white halo
    const circ = 2 * Math.PI * r;
    const overallPct = c.totalSteps > 0 ? Math.round((c.doneSteps / c.totalSteps) * 100) : 0;
    // Owl/Level 5 borderColor is gray-900 — invisible on a dark bg, so we
    // invert the relationship for that level (track gets the darkest shade,
    // progress arc gets a light visible shade).
    const isOwlLevel = kidLevelCfg?.borderColor === '#111827';
    const trackColor = isDark
      ? (kidLevelCfg?.darkTrackColor || '#374151')
      : (kidLevelCfg?.trackColor || kidLevelCfg?.color || '#E5E7EB');
    const progressColor = isDark && isOwlLevel
      ? '#6B7280'
      : (kidLevelCfg?.borderColor || '#6366F1');

    // Curved title — uppercase label across the top arc, "FOLDER" across the
    // bottom arc. Both arcs sit INSIDE the colored inner disc (r=32), tucked
    // ~2px in from where TaskSetCard places them. NOTE: we do NOT use
    // side="right" on the bottom path — a CCW left→right bottom arc already
    // puts glyph tops on the inner (toward-center) side of the curve, which
    // at the bottom = pointing up = right-side up. side="right" would flip
    // them to point AWAY from center → upside down. (The TaskSetCard
    // emoji-badge bottom arc is rarely shown for short names, so the
    // upside-down issue there hides itself.)
    const cx        = size / 2;
    const cy        = size / 2;
    const topR      = Math.round(size * 0.29);
    const botR      = topR + 4;
    const topPathId = `group-arc-top-${key}`;
    const botPathId = `group-arc-bot-${key}`;
    const topPathD  = `M ${cx - topR},${cy} A ${topR},${topR} 0 0 1 ${cx + topR},${cy}`;
    const botPathD  = `M ${cx - botR},${cy} A ${botR},${botR} 0 0 0 ${cx + botR},${cy}`;
    const arcText   = { fontSize: 7, fontWeight: 700, letterSpacing: '0.2px', textTransform: 'uppercase' };

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
          className="rounded-full flex items-center justify-center text-3xl"
          style={{ width: innerSize, height: innerSize, backgroundColor: `${color}1A`, color }}
        >
          <FontAwesomeIcon icon={icon} />
        </span>
        {/* Arc text drawn LAST so it sits on top of the colored inner disc.
            z-10 keeps it above both the progress-ring SVG and the icon span. */}
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none z-10">
          <defs>
            <path id={topPathId} d={topPathD} fill="none" />
            <path id={botPathId} d={botPathD} fill="none" />
          </defs>
          <text fill={color} style={arcText}>
            <textPath href={`#${topPathId}`} startOffset="50%" textAnchor="middle">
              {label.toUpperCase()}
            </textPath>
          </text>
          <text fill={color} style={arcText}>
            <textPath href={`#${botPathId}`} startOffset="50%" textAnchor="middle">
              FOLDER
            </textPath>
          </text>
        </svg>
      </button>
    );
  };

  // How many sets were completed today (visible to the kid)
  const completedTodayCount = visibleSets.filter(
    (ts) => ts.step_count > 0 && ts.completed_count >= ts.step_count && isToday(ts.earned_at)
  ).length;

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
            navigate(`/tasks/${userId}/${taskSetId}`, { state: { chain: [...(location.state?.chain || []), location.pathname + location.search] } });
          }}
        />
      </Modal>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (badgeSets.length === 0 && awardSets.length === 0 && sortedSets.length === 0) ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No tasks assigned yet.
        </div>
      ) : (
        // Responsive grid: 3 per row on iPhone-mini-class screens, ramping to
        // 8 on xl desktops. Mobile uses -mx-4 to extend the grid out beyond
        // the page p-4 so 120px badges with a 4px gap fit 3-across on a
        // 375px viewport (3*120 + 2*4 = 368 < 375). On sm+ we restore the
        // padding and let the cells size themselves; badges are left-aligned
        // in their cells on lg+ for a clean column.
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-2 gap-y-5 sm:gap-3 lg:gap-4 pt-4 justify-items-center lg:justify-items-start">
          {/* Pinned task sets — rendered first so they always sit at the
              top of the page. Badges/awards that are pinned ALSO continue
              to show inside their folder below; pinning is additive. */}
          {pinnedSets.map(renderCard)}
          {/* Divider between the pinned group and the rest of the list,
              so it reads as a deliberate "shortcut row" instead of just
              a re-sort. col-span-full spans every column of the
              responsive grid; hidden when nothing is pinned. */}
          {pinnedSets.length > 0 && (
            <div className="col-span-full justify-self-stretch w-full border-t border-gray-200 dark:border-gray-700 mt-1 mb-2" />
          )}
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
