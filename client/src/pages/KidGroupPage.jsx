import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faShieldHalved, faTrophy } from '@fortawesome/free-solid-svg-icons';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import { useFamilySettings } from '../context/FamilySettingsContext.jsx';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import Modal from '../components/shared/Modal.jsx';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';
import TaskSetCard from '../components/tasks/TaskSetCard.jsx';

const AREAS = [
  'Discover Agriculture',
  'Discover Art',
  'Discover Character',
  'Discover Health & Safety',
  'Discover the Home',
  'Discover Knowledge',
  'Discover the Outdoors',
  'Discover Science & Technology',
  'Discover the World',
];

function shortArea(category) {
  return category.replace('Discover ', '').replace('the ', '');
}

function statusFor(ts) {
  if (ts.step_count > 0 && ts.completed_count >= ts.step_count) return 'completed';
  if (ts.completed_count > 0) return 'in_progress';
  return 'not_started';
}

const STATUS_OPTIONS = [
  { key: 'all',         label: 'All' },
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed',   label: 'Completed' },
  { key: 'archived',    label: 'Archived' },
];

/**
 * Sub-page for a Curiosity grouping ('badges' or 'awards') under a kid's
 * /tasks page. Filters the kid's task sets to just that group with optional
 * status + Area of Discovery (badges only) pills.
 */
export default function KidGroupPage() {
  const { userId, groupKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { useTickets } = useFamilySettings();

  const [taskSets,        setTaskSets]        = useState([]);
  const [archivedSets,    setArchivedSets]    = useState([]);
  const [member,          setMember]          = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [status,          setStatus]          = useState('all');
  const [area,            setArea]            = useState('');
  const [browserOpen,     setBrowserOpen]     = useState(false);
  const [flippedIds, setFlippedIds] = useState(() => new Set());
  const flipCard = (id) => setFlippedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const isBadges = groupKey === 'badges';
  const isAwards = groupKey === 'awards';
  const groupTag  = isBadges ? 'Badge' : 'Award';
  const titleText = isBadges ? 'Badges' : 'Awards';
  const titleIcon = isBadges ? faShieldHalved : faTrophy;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, archivedData, familyData] = await Promise.all([
        taskSetsApi.getUserTaskSets(userId),
        taskSetsApi.getUserTaskSets(userId, { archived: 'true' }),
        familyApi.getFamily(),
      ]);
      setTaskSets(taskData.taskSets || []);
      setArchivedSets(archivedData.taskSets || []);
      const m = (familyData.members || []).find((mm) => mm.id === parseInt(userId, 10));
      if (m) setMember(m);
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groupSets = useMemo(() => {
    return taskSets.filter((ts) => Array.isArray(ts.tags) && ts.tags.includes(groupTag));
  }, [taskSets, groupTag]);

  const archivedGroupSets = useMemo(() => {
    return archivedSets.filter((ts) => Array.isArray(ts.tags) && ts.tags.includes(groupTag));
  }, [archivedSets, groupTag]);

  const filtered = useMemo(() => {
    const source = status === 'archived' ? archivedGroupSets : groupSets;
    // Bucket order on the main list: pinned first (always float to top
    // regardless of progress), then in-progress (highest % first so the
    // kid sees what they're closest to finishing), then not-started, then
    // completed (already-won, sinks to the bottom). Archived view keeps
    // simple alphabetical since there's only one bucket there.
    const bucketOrder = { in_progress: 0, not_started: 1, completed: 2 };
    return source.filter((ts) => {
      if (status !== 'all' && status !== 'archived' && statusFor(ts) !== status) return false;
      if (area && !(Array.isArray(ts.tags) && ts.tags.includes(area))) return false;
      return true;
    }).sort((a, b) => {
      if (status === 'archived') return a.name.localeCompare(b.name);
      // Pinned beats every status bucket.
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      const sa = statusFor(a);
      const sb = statusFor(b);
      if (bucketOrder[sa] !== bucketOrder[sb]) return bucketOrder[sa] - bucketOrder[sb];
      if (sa === 'in_progress') {
        const pa = a.step_count > 0 ? a.completed_count / a.step_count : 0;
        const pb = b.step_count > 0 ? b.completed_count / b.step_count : 0;
        if (pa !== pb) return pb - pa; // higher % first
      }
      return a.name.localeCompare(b.name);
    });
  }, [groupSets, archivedGroupSets, status, area]);

  const statusCounts = useMemo(() => {
    const c = { all: groupSets.length, not_started: 0, in_progress: 0, completed: 0, archived: archivedGroupSets.length };
    for (const ts of groupSets) c[statusFor(ts)]++;
    return c;
  }, [groupSets, archivedGroupSets]);

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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`/tasks/${userId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Back"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <FontAwesomeIcon icon={titleIcon} className="text-brand-500 text-2xl shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {titleText}
            <span className="ml-1 text-gray-400 dark:text-gray-500 font-medium">· {groupSets.length}</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setBrowserOpen(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/50 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
        >
          Browse {titleText.toLowerCase()}
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {STATUS_OPTIONS.map((opt) => {
          const count = statusCounts[opt.key];
          const isActive = status === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatus(opt.key)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
              <span className="text-[10px] font-semibold opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Area-of-Discovery filter (badges only) */}
      {isBadges && (
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <button
            type="button"
            onClick={() => setArea('')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !area
                ? 'bg-brand-500 text-white border-brand-500'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
            }`}
          >
            All areas
          </button>
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(area === a ? '' : a)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                area === a
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400'
              }`}
            >
              {shortArea(a)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          {groupSets.length === 0
            ? `No ${titleText.toLowerCase()} assigned yet.`
            : 'No matches for these filters.'}
        </div>
      ) : (
        // Responsive grid mirrors KidTasksPage: 3 per row on iPhone-mini-class
        // screens, 8 on xl desktops. Mobile extends beyond the page padding
        // (-mx-4) so 120px badges fit 3-across on a 375px viewport.
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-2 gap-y-5 sm:gap-3 lg:gap-4 pt-4 justify-items-center lg:justify-items-start">
          {(() => {
            // Split the already-sorted list into pinned + rest so we can
            // drop a divider between them. `filtered` is sorted with
            // pinned first (see the bucket order in the useMemo above),
            // so this is just a fast partition.
            const pinned = filtered.filter((ts) => ts.is_pinned);
            const rest   = filtered.filter((ts) => !ts.is_pinned);
            return (
              <>
                {pinned.map(renderCard)}
                {pinned.length > 0 && rest.length > 0 && (
                  <div className="col-span-full justify-self-stretch w-full border-t border-gray-200 dark:border-gray-700 mt-1 mb-2" />
                )}
                {rest.map(renderCard)}
              </>
            );
          })()}
        </div>
      )}

      <Modal open={browserOpen} onClose={() => setBrowserOpen(false)} title={`Browse ${titleText.toLowerCase()}`} size="xl">
        <BadgeBrowser
          userId={parseInt(userId, 10)}
          compact
          initialType={isAwards ? 'award' : 'badge'}
          onEnrolled={(taskSetId) => {
            setBrowserOpen(false);
            navigate(`/tasks/${userId}/${taskSetId}`, { state: { from: location.pathname + location.search } });
          }}
        />
      </Modal>
    </div>
  );
}
