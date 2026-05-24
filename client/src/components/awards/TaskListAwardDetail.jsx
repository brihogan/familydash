import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faArrowRight, faSquareCheck, faSquare } from '@fortawesome/free-solid-svg-icons';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { badgesApi } from '../../api/badges.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import ProgressRing from '../dashboard/ProgressRing.jsx';
import BadgePreviewModal from '../badges/BadgePreviewModal.jsx';

const LEVEL_ORDER = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];

/**
 * Detail page for awards whose completion is a per-level checklist of mixed
 * specific-badge + activity steps — e.g. STEAM, Outdoors, Life Skills.
 *
 * award_config.per_level shape:
 *   { [level]: [{type:'badge', name:'…'} | {type:'activity', text:'…'}], all: […] }
 *
 * Activities don't map to a badge — they're text rows checked off by a parent
 * or kid; state persists in task_sets.award_state.activity_done[stepKey].
 */
export default function TaskListAwardDetail({ userId, taskSet, onAwardStateChanged }) {
  const awardLevel = taskSet.badge_level;
  const levelCfg   = awardLevel ? BADGE_LEVELS[awardLevel] : null;
  const perLevel   = taskSet.award_config?.per_level || {};

  // Cumulative step list: union of preschool…awardLevel (the lower-level skills
  // must be maintained too), then `all` if present. Each step gets a stable key.
  const steps = useMemo(() => {
    const out = [];
    const maxIdx = LEVEL_ORDER.indexOf(awardLevel);
    if (maxIdx >= 0) {
      for (let i = 0; i <= maxIdx; i++) {
        const lv = LEVEL_ORDER[i];
        (perLevel[lv] || []).forEach((s, idx) => out.push({ ...s, key: `${lv}.${idx}`, sourceLevel: lv }));
      }
    }
    (perLevel.all || []).forEach((s, idx) => out.push({ ...s, key: `all.${idx}`, sourceLevel: 'all' }));
    return out;
  }, [perLevel, awardLevel]);

  const badgeNames = useMemo(
    () => Array.from(new Set(steps.filter(s => s.type === 'badge').map(s => s.name))),
    [steps]
  );

  const [catalog,     setCatalog]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [previewBadge, setPreviewBadge] = useState(null);
  const [activityDone, setActivityDone] = useState(taskSet.award_state?.activity_done || {});

  useEffect(() => { setActivityDone(taskSet.award_state?.activity_done || {}); }, [taskSet.id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const namesParam = badgeNames.join(',');
      const promises = [taskSetsApi.getUserTaskSets(userId)];
      if (namesParam) promises.push(badgesApi.getBadges({ names: namesParam, type: 'all', limit: 100 }));
      const results = await Promise.all(promises);
      setAssignments(results[0].taskSets || []);
      setCatalog(results[1]?.badges || []);
    } catch {
      setError('Could not load step data.');
    } finally {
      setLoading(false);
    }
  }, [userId, badgeNames.join(',')]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const enrollmentByName = useMemo(() => {
    const map = new Map();
    for (const ts of assignments) {
      if (!ts.badge_id || ts.badge_is_award) continue;
      if (ts.badge_level !== awardLevel) continue;
      const pct = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
      map.set((ts.name || '').toLowerCase(), {
        taskSetId: ts.id,
        pct,
        completedCount: ts.completed_count,
        stepCount: ts.step_count,
        imageFile: ts.badge_image_file,
      });
    }
    return map;
  }, [assignments, awardLevel]);

  const catalogByName = useMemo(() => {
    const map = new Map();
    for (const b of catalog) map.set((b.name || '').toLowerCase(), b);
    return map;
  }, [catalog]);

  async function toggleActivity(key) {
    const next = { ...activityDone, [key]: !activityDone[key] };
    setActivityDone(next); // optimistic
    try {
      const result = await taskSetsApi.updateAwardState(userId, taskSet.id, { activity_done: next });
      onAwardStateChanged?.(result.award_state);
    } catch {
      setActivityDone(activityDone); // revert
    }
  }

  function stepIsDone(step) {
    if (step.type === 'badge') {
      return enrollmentByName.get(step.name.toLowerCase())?.pct === 100;
    }
    return !!activityDone[step.key];
  }

  const earnedCount = steps.filter(stepIsDone).length;
  const allEarned   = steps.length > 0 && earnedCount === steps.length;

  // Group rows by source level for visual headers (helpful for Outdoors).
  const rowsByLevel = useMemo(() => {
    const groups = {};
    for (const step of steps) {
      const k = step.sourceLevel;
      groups[k] = groups[k] || [];
      groups[k].push(step);
    }
    return groups;
  }, [steps]);

  const orderedLevels = [...LEVEL_ORDER.filter(l => rowsByLevel[l]), 'all'].filter(l => rowsByLevel[l]);
  const showLevelHeaders = orderedLevels.length > 1;

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
            {earnedCount} / {steps.length} steps complete
            {levelCfg && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">· {levelCfg.label}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {allEarned ? 'Award complete!' : 'Mix of specific badges and hands-on activities.'}
          </p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="space-y-4">
        {orderedLevels.map(lv => (
          <div key={lv}>
            {showLevelHeaders && (
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
                {lv === 'all' ? 'All Levels' : (BADGE_LEVELS[lv]?.label || lv)}
              </h3>
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {rowsByLevel[lv].map((step) => {
                if (step.type === 'badge') {
                  const enrolled = enrollmentByName.get(step.name.toLowerCase());
                  const badge    = catalogByName.get(step.name.toLowerCase());
                  const done     = enrolled?.pct === 100;
                  return (
                    <div key={step.key} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${done ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'}`}>
                          <span className="text-[10px] uppercase tracking-wider text-brand-600 dark:text-brand-400 mr-1.5">Badge</span>
                          {step.name}
                        </p>
                        {!badge && !loading && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">No matching badge in the library.</p>
                        )}
                      </div>
                      {loading ? (
                        <span className="text-xs text-gray-400">…</span>
                      ) : enrolled ? (
                        <Link
                          to={`/tasks/${userId}/${enrolled.taskSetId}`}
                          className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          title={`Go to ${step.name}`}
                        >
                          <span className="font-semibold tabular-nums">
                            {enrolled.completedCount}/{enrolled.stepCount}
                          </span>
                          <ProgressRing pct={enrolled.pct} done={done} size={36}>
                            {done ? <FontAwesomeIcon icon={faCheck} className="text-green-500" /> :
                              enrolled.imageFile ? (
                                <img src={`/api/uploads/badges/${enrolled.imageFile}`} alt="" className="w-full h-full rounded-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                              ) : null}
                          </ProgressRing>
                        </Link>
                      ) : badge ? (
                        <button type="button" onClick={() => setPreviewBadge(badge)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/50 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                          Start badge <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-[10px]" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  );
                }
                // Activity row
                const done = !!activityDone[step.key];
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => toggleActivity(step.key)}
                    className="w-full flex items-start gap-3 p-3 bg-white dark:bg-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <FontAwesomeIcon
                      icon={done ? faSquareCheck : faSquare}
                      className={`text-lg mt-0.5 shrink-0 ${done ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Activity</p>
                      <p className={`text-sm ${done ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
                        {step.text}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {previewBadge && (
        <BadgePreviewModal
          badge={previewBadge}
          userId={userId}
          userLevel={awardLevel}
          canEnroll={true}
          onClose={() => setPreviewBadge(null)}
          onEnrolled={() => { setPreviewBadge(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
