import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { taskSetsApi } from '../../api/taskSets.api.js';
import LoadingSkeleton from '../shared/LoadingSkeleton.jsx';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';

/**
 * Detail view for `count_at_level` awards (WOW).
 *
 * Per CU: "Awarded for earning N+ badges at any single level." Each
 * enrollment is tied to one badge level — we count the kid's 100%-
 * complete badges at THAT level. Pre-enrollment completions count too.
 *
 * UI:
 *   - One-line counter ("5 more to go" or "🎉 Earned!"). The visual
 *     progress is the outer ring around the award medallion (the parent
 *     page reads this via the onProgress callback and feeds it into the
 *     ring calculation), so no in-page progress bar here.
 *   - Grid of completed badges as circle medallions (matches the
 *     minimal style used at /tasks/:userId/group/badges).
 */
export default function CountAtLevelAwardDetail({ userId, taskSet, onProgress }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await taskSetsApi.getAwardBadgeProgress(userId, taskSet.id);
        if (cancelled) return;
        setData(d);
        // Lift progress up so the parent page can color the outer ring.
        onProgress?.(d);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || 'Could not load progress.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, taskSet.id, onProgress]);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error)   return <p className="text-sm text-red-500">{error}</p>;
  if (!data)   return null;

  const levelCfg     = BADGE_LEVELS[data.level];
  const levelLabel   = levelCfg?.label || data.level;
  const remaining    = Math.max(0, data.min - data.count);
  // Per-level palette for the medallion ring around each completed badge,
  // matches the minimal TaskSetCard treatment used in /group/badges.
  const trackColor   = levelCfg?.trackColor  || levelCfg?.color || '#E5E7EB';
  const progressDone = levelCfg?.borderColor || '#22C55E';

  return (
    <div className="space-y-4">
      {/* Headline counter card — centered, with the level palette so it
          ties visually to the medallions below. The award medallion at
          the top of the page already shows the description + progress
          ring, so we don't duplicate either here. */}
      <div
        className={`text-center px-4 py-3 rounded-xl border ${
          data.isComplete
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}
      >
        <p className={`text-base font-semibold ${
          data.isComplete
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-gray-700 dark:text-gray-200'
        }`}>
          {data.isComplete
            ? `🎉 Earned! ${data.count} completed badges at ${levelLabel}.`
            : `${remaining} more badge${remaining === 1 ? '' : 's'} to go at ${levelLabel}.`}
        </p>
      </div>

      {/* Badge grid — completed only, newest first. Circle medallions matching
          the /tasks/:userId/group/badges minimal style (ring + drop shadow,
          completed = full level color arc). No card chrome. */}
      {data.completed.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Completed Badges ({data.completed.length})
          </p>
          <div className="flex flex-wrap gap-4 sm:gap-5">
            {data.completed.map((b) => (
              <CompletedBadgeMedallion
                key={b.task_set_id}
                userId={userId}
                badge={b}
                trackColor={trackColor}
                progressColor={progressDone}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-6">
          No completed badges at {levelLabel} yet. Earn your first one and it'll show up here!
        </p>
      )}
    </div>
  );
}

// Minimal circle medallion — full level-color arc (the badge is complete by
// definition in this list), drop shadow, badge image inside. Same geometry
// as TaskSetCard's `minimal` mode used in /group/badges. Click navigates to
// the underlying badge task page (the user said "no clicking into it" meaning
// no flippy card chrome, but a plain Link to the badge is still useful).
function CompletedBadgeMedallion({ userId, badge, trackColor, progressColor }) {
  const size = 96;
  const sw   = 8;
  const r    = (size - sw) / 2;
  return (
    <Link
      to={`/tasks/${userId}/${badge.task_set_id}`}
      title={badge.name}
      className="relative shadow-md rounded-full hover:opacity-90 transition-opacity"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
        {/* Fully complete → full-circle arc in the level's saturated color. */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={progressColor} strokeWidth={sw} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-3xl leading-none">
        {badge.image_file ? (
          <img
            src={`/api/uploads/badges/${badge.image_file}`}
            alt=""
            className="w-16 h-16 rounded-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <span
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
          >
            {badge.emoji || '🏅'}
          </span>
        )}
      </div>
    </Link>
  );
}
