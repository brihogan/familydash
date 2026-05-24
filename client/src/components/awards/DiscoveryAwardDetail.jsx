import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import ProgressRing from '../dashboard/ProgressRing.jsx';

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

/**
 * Discovery Award dashboard. For each of the 9 Areas of Discovery, surface
 * the kid's enrolled badges at the award's level:
 *   - 0 matches → "Find a badge" link to /badges/:userId?type=badge&category=…
 *   - 1 match  → show name + progress ring inline
 *   - ≥2       → small dropdown; default to highest-progress; selection
 *                persists in task_sets.award_state.area_selection[area].
 *
 * Award is "earned" when every area has at least one badge at 100%.
 */
export default function DiscoveryAwardDetail({ userId, taskSet, onAwardStateChanged }) {
  const awardLevel = taskSet.badge_level;
  const levelCfg   = awardLevel ? BADGE_LEVELS[awardLevel] : null;

  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Local state mirrors award_state.area_selection for optimistic UI.
  const [selection, setSelection] = useState(taskSet.award_state?.area_selection || {});
  useEffect(() => { setSelection(taskSet.award_state?.area_selection || {}); }, [taskSet.id]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await taskSetsApi.getUserTaskSets(userId);
      setAssignments(data.taskSets || []);
    } catch {
      setError('Could not load your badges.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  // Group enrolled badge task_sets by Area of Discovery (at the award level).
  // We only count active badge enrollments — i.e. badge_id set, matching level,
  // and the underlying badge isn't itself an award.
  const byArea = useMemo(() => {
    const map = {};
    for (const area of AREAS) map[area] = [];
    for (const ts of assignments) {
      if (!ts.badge_id) continue;
      if (ts.badge_is_award) continue;
      if (ts.badge_level !== awardLevel) continue;
      const cat = ts.badge_category;
      if (!cat || !map[cat]) continue;
      const pct = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
      map[cat].push({
        taskSetId: ts.id,
        name:      ts.name,
        pct,
        completedCount: ts.completed_count,
        stepCount: ts.step_count,
        imageFile: ts.badge_image_file,
      });
    }
    // Sort each area by highest progress first so "default = highest" is just [0].
    for (const area of AREAS) map[area].sort((a, b) => b.pct - a.pct);
    return map;
  }, [assignments, awardLevel]);

  // Resolve which badge "counts" for each area: explicit selection if it still
  // matches an enrollment; otherwise the highest-progress badge.
  function activeBadgeFor(area) {
    const list = byArea[area];
    if (!list.length) return null;
    const explicit = selection[area];
    if (explicit) {
      const match = list.find(b => b.taskSetId === explicit);
      if (match) return match;
    }
    return list[0];
  }

  const earnedCount = AREAS.filter(a => activeBadgeFor(a)?.pct === 100).length;
  const allEarned   = earnedCount === AREAS.length;

  async function handleSelect(area, taskSetId) {
    const next = { ...selection, [area]: taskSetId };
    setSelection(next); // optimistic
    try {
      const result = await taskSetsApi.updateAwardState(userId, taskSet.id, { area_selection: next });
      onAwardStateChanged?.(result.award_state);
    } catch {
      // revert on failure
      setSelection(selection);
    }
  }

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className={`p-3 rounded-lg flex items-center gap-3 ${
        allEarned
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
          : 'bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700'
      }`}>
        <div className="text-2xl">{allEarned ? '🏆' : '🎯'}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {earnedCount} / {AREAS.length} Areas of Discovery earned
            {levelCfg && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">· {levelCfg.label}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {allEarned ? 'Discovery Award complete!' : 'Earn one badge from each area to complete this award.'}
          </p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Area rows */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {AREAS.map((area) => {
          const list   = byArea[area];
          const active = activeBadgeFor(area);
          const done   = active?.pct === 100;
          return (
            <div key={area} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800">
              {/* Area name */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${done ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'}`}>
                  {shortArea(area)}
                </p>
                {list.length > 1 && (
                  <select
                    value={active?.taskSetId || ''}
                    onChange={(e) => handleSelect(area, parseInt(e.target.value, 10))}
                    className="mt-1 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                  >
                    {list.map(b => (
                      <option key={b.taskSetId} value={b.taskSetId}>
                        {b.name} ({b.pct}%)
                      </option>
                    ))}
                  </select>
                )}
                {list.length === 1 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{active.name}</p>
                )}
              </div>

              {/* Right side: progress, or "Find a badge" link */}
              {loading ? (
                <span className="text-xs text-gray-400">…</span>
              ) : list.length === 0 ? (
                <Link
                  to={`/badges/${userId}?type=badge&category=${encodeURIComponent(area)}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/50 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                >
                  Find a badge <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-[10px]" />
                </Link>
              ) : (
                <Link
                  to={`/tasks/${userId}/${active.taskSetId}`}
                  className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  title={`Go to ${active.name}`}
                >
                  <span className="font-semibold tabular-nums">
                    {active.completedCount}/{active.stepCount}
                  </span>
                  <ProgressRing
                    pct={active.pct}
                    done={done}
                    size={36}
                  >
                    {done ? (
                      <FontAwesomeIcon icon={faCheck} className="text-green-500" />
                    ) : active.imageFile ? (
                      <img
                        src={`/api/uploads/badges/${active.imageFile}`}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : null}
                  </ProgressRing>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
