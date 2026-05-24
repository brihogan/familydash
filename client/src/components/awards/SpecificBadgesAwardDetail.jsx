import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { badgesApi } from '../../api/badges.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import ProgressRing from '../dashboard/ProgressRing.jsx';
import BadgePreviewModal from '../badges/BadgePreviewModal.jsx';

/**
 * Detail page for awards whose completion is "earn this specific list of
 * named badges at your level" — e.g. Liberty (5 civic badges), Fruit of the
 * Spirit (9 character badges).
 *
 * For each required badge name we surface a row showing either:
 *   - badge name + progress ring + link to the in-flight task set (if enrolled)
 *   - badge name + "Start badge" button that opens BadgePreviewModal (if not)
 */
export default function SpecificBadgesAwardDetail({ userId, taskSet }) {
  const awardLevel = taskSet.badge_level;
  const levelCfg   = awardLevel ? BADGE_LEVELS[awardLevel] : null;
  const badgeNames = taskSet.award_config?.badge_names || [];

  const [catalog,     setCatalog]     = useState([]); // badge metadata from /badges?names=…
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [previewBadge, setPreviewBadge] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const namesParam = badgeNames.join(',');
      const [catalogRes, assignmentsRes] = await Promise.all([
        badgesApi.getBadges({ names: namesParam, type: 'all', limit: 100 }),
        taskSetsApi.getUserTaskSets(userId),
      ]);
      setCatalog(catalogRes.badges || []);
      setAssignments(assignmentsRes.taskSets || []);
    } catch {
      setError('Could not load badge data.');
    } finally {
      setLoading(false);
    }
  }, [userId, badgeNames.join(',')]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Lookup the in-flight enrollment for a given badge name at the award's level.
  const enrollmentByName = useMemo(() => {
    const map = new Map();
    for (const ts of assignments) {
      if (!ts.badge_id || ts.badge_is_award) continue;
      if (ts.badge_level !== awardLevel) continue;
      const key = (ts.name || '').toLowerCase();
      const pct = ts.step_count > 0 ? Math.round((ts.completed_count / ts.step_count) * 100) : 0;
      map.set(key, {
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

  const rows = badgeNames.map((name) => {
    const enrolled = enrollmentByName.get(name.toLowerCase());
    const badge    = catalogByName.get(name.toLowerCase());
    const done     = enrolled?.pct === 100;
    return { name, badge, enrolled, done };
  });

  const earnedCount = rows.filter(r => r.done).length;
  const allEarned   = earnedCount === rows.length;

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
            {earnedCount} / {rows.length} badges earned
            {levelCfg && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">· {levelCfg.label}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {allEarned ? 'Award complete!' : 'Earn every badge listed below to complete this award.'}
          </p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {rows.map(({ name, badge, enrolled, done }) => (
          <div key={name} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${done ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'}`}>
                {name}
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
                title={`Go to ${name}`}
              >
                <span className="font-semibold tabular-nums">
                  {enrolled.completedCount}/{enrolled.stepCount}
                </span>
                <ProgressRing pct={enrolled.pct} done={done} size={36}>
                  {done ? (
                    <FontAwesomeIcon icon={faCheck} className="text-green-500" />
                  ) : enrolled.imageFile ? (
                    <img
                      src={`/api/uploads/badges/${enrolled.imageFile}`}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : null}
                </ProgressRing>
              </Link>
            ) : badge ? (
              <button
                type="button"
                onClick={() => setPreviewBadge(badge)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/50 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
              >
                Start badge <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-[10px]" />
              </button>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
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
