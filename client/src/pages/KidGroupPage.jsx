import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faShieldHalved, faTrophy, faCheck } from '@fortawesome/free-solid-svg-icons';
import { taskSetsApi } from '../api/taskSets.api.js';
import { familyApi } from '../api/family.api.js';
import LoadingSkeleton from '../components/shared/LoadingSkeleton.jsx';
import Modal from '../components/shared/Modal.jsx';
import BadgeBrowser from '../components/badges/BadgeBrowser.jsx';
import ProgressRing from '../components/dashboard/ProgressRing.jsx';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';

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
];

/**
 * Sub-page for a Curiosity grouping ('badges' or 'awards') under a kid's
 * /tasks page. Filters the kid's task sets to just that group with optional
 * status + Area of Discovery (badges only) pills.
 */
export default function KidGroupPage() {
  const { userId, groupKey } = useParams();
  const navigate = useNavigate();

  const [taskSets, setTaskSets] = useState([]);
  const [member,   setMember]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [status,   setStatus]   = useState('all');
  const [area,     setArea]     = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);

  const isBadges = groupKey === 'badges';
  const isAwards = groupKey === 'awards';
  const groupTag  = isBadges ? 'Badge' : 'Award';
  const titleText = isBadges ? 'Badges' : 'Awards';
  const titleIcon = isBadges ? faShieldHalved : faTrophy;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, familyData] = await Promise.all([
        taskSetsApi.getUserTaskSets(userId),
        familyApi.getFamily(),
      ]);
      setTaskSets(taskData.taskSets || []);
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

  const filtered = useMemo(() => {
    return groupSets.filter((ts) => {
      if (status !== 'all' && statusFor(ts) !== status) return false;
      if (area && !(Array.isArray(ts.tags) && ts.tags.includes(area))) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [groupSets, status, area]);

  const statusCounts = useMemo(() => {
    const c = { all: groupSets.length, not_started: 0, in_progress: 0, completed: 0 };
    for (const ts of groupSets) c[statusFor(ts)]++;
    return c;
  }, [groupSets]);

  const kidLevelCfg = member?.badge_level && BADGE_LEVELS[member.badge_level];

  const renderCard = (ts) => {
    const pct  = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
    const done = ts.step_count > 0 && ts.completed_count >= ts.step_count;
    return (
      <button
        key={ts.id}
        type="button"
        onClick={() => navigate(`/tasks/${userId}/${ts.id}`)}
        className={`relative flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border rounded-xl text-left shadow-sm hover:shadow-md transition-all ${
          done
            ? 'border-green-300/70 dark:border-green-700/60'
            : 'border-gray-200 dark:border-gray-700 hover:border-brand-300/70 dark:hover:border-brand-500/40'
        }`}
      >
        <ProgressRing
          pct={pct}
          done={done}
          size={52}
          trackColor={kidLevelCfg ? `${kidLevelCfg.color}55` : undefined}
          progressColor={done ? '#22C55E' : (kidLevelCfg?.borderColor || undefined)}
        >
          {done ? (
            <FontAwesomeIcon icon={faCheck} className="text-green-500" />
          ) : ts.badge_image_file ? (
            <img
              src={`/api/uploads/badges/${ts.badge_image_file}`}
              alt=""
              className="w-full h-full rounded-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="text-lg leading-none">{ts.emoji || (isAwards ? '🏆' : '🏅')}</span>
          )}
        </ProgressRing>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ts.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {ts.step_count > 0 ? `${ts.completed_count}/${ts.step_count} steps` : 'No steps'}
            {isBadges && Array.isArray(ts.tags) && (() => {
              const a = ts.tags.find((t) => t.startsWith('Discover'));
              return a ? ` · ${shortArea(a)}` : '';
            })()}
          </p>
        </div>
      </button>
    );
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map(renderCard)}
        </div>
      )}

      <Modal open={browserOpen} onClose={() => setBrowserOpen(false)} title={`Browse ${titleText.toLowerCase()}`} size="xl">
        <BadgeBrowser
          userId={parseInt(userId, 10)}
          compact
          initialType={isAwards ? 'award' : 'badge'}
          onEnrolled={(taskSetId) => {
            setBrowserOpen(false);
            navigate(`/tasks/${userId}/${taskSetId}`);
          }}
        />
      </Modal>
    </div>
  );
}
