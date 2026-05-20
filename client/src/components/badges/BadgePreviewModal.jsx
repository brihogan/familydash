import { useState, useEffect } from 'react';
import { badgesApi } from '../../api/badges.api.js';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import useScrollLock from '../../hooks/useScrollLock.js';
import BadgeImageLightbox from './BadgeImageLightbox.jsx';

function LevelPill({ level }) {
  const cfg = BADGE_LEVELS[level];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border"
      style={{ backgroundColor: cfg.color, color: cfg.textColor, borderColor: cfg.borderColor }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Read-only preview of a badge from the library. Shows the required steps and
 * the optional pool as bullet lists (not interactive tasks). A prominent CTA
 * at the top lets the user start the badge (which calls enroll with no
 * optionals — they'll pick them later on the task page).
 */
export default function BadgePreviewModal({ badge, userId, userLevel, canEnroll, onClose, onEnrolled }) {
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');   // failed to fetch badge detail
  const [enrollError, setEnrollError] = useState(''); // failed to enroll
  const [starting,  setStarting]  = useState(false);
  const [lightbox,  setLightbox]  = useState(false);

  useScrollLock(true);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    badgesApi.getBadge(badge.id, userLevel)
      .then(setDetail)
      .catch(() => setLoadError('Could not load badge details.'))
      .finally(() => setLoading(false));
  }, [badge.id, userLevel]);

  const optCounts    = detail?.level_opt_counts ?? {};
  const pickCount    = userLevel ? (optCounts[userLevel] ?? 0) : 0;
  const requirements = detail?.requirements ?? [];
  const optionals    = detail?.optionals    ?? [];
  const levelCfg     = userLevel && BADGE_LEVELS[userLevel];

  const handleStart = async () => {
    setStarting(true);
    setEnrollError('');
    try {
      const result = await badgesApi.enroll(userId, badge.id, []);
      onEnrolled(result.taskSetId);
    } catch (e) {
      setEnrollError(e?.response?.data?.error || 'Could not start badge.');
      setStarting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />

        <div className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 dark:bg-gray-700/80 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 text-xl leading-none shadow-sm"
            aria-label="Close"
          >
            ×
          </button>

          {/* ── Header ── */}
          <div className="p-5 sm:p-6 bg-gradient-to-b from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4">
              {badge.image_file ? (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex-shrink-0 shadow-md ring-2 ring-brand-300 dark:ring-brand-600 overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity"
                  aria-label="View full size"
                >
                  <img
                    src={`/api/uploads/badges/${badge.image_file}`}
                    alt={badge.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </button>
              ) : (
                <span
                  className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center text-6xl flex-shrink-0 rounded-full shadow-md ring-2 ring-amber-200 dark:ring-amber-700"
                  style={{ background: 'radial-gradient(circle at center, #FFFCF0 0%, #F5E6C8 100%)' }}
                >
                  {detail?.emoji || badge.emoji || '🏅'}
                </span>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {badge.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{badge.category}</p>
                {levelCfg && (
                  <div className="mt-2">
                    <LevelPill level={userLevel} />
                  </div>
                )}
                {(detail?.description || badge.description) && (
                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-3 leading-snug">
                    {detail?.description || badge.description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* "I want to start this!" CTA */}
            {!loading && !loadError && (
              <div>
                <button
                  type="button"
                  disabled={!canEnroll || starting || !userLevel}
                  onClick={handleStart}
                  className={`w-full px-4 py-3 rounded-xl font-semibold text-base transition-all shadow-sm ${
                    canEnroll && !starting && userLevel
                      ? 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white hover:shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {starting
                    ? 'Starting…'
                    : !userLevel
                      ? 'Set a badge level first'
                      : !canEnroll
                        ? 'Badge full — finish another first'
                        : '🚀 I want to start this badge!'}
                </button>
                {pickCount > 0 && canEnroll && userLevel && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    After starting, you'll pick {pickCount} optional task{pickCount === 1 ? '' : 's'} on the next screen.
                  </p>
                )}
                {enrollError && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">{enrollError}</p>
                  </div>
                )}
              </div>
            )}

            {loading && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Loading details…</p>
            )}

            {loadError && (
              <p className="text-sm text-red-500 text-center py-4">{loadError}</p>
            )}

            {!loading && !loadError && (
              <>
                {/* Required */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Required Steps ({requirements.length})
                  </h3>
                  {requirements.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No required steps for this level.</p>
                  ) : (
                    <ul className="space-y-2">
                      {requirements.map((req) => (
                        <li key={req.id} className="flex gap-2.5">
                          <span className="mt-0.5 text-brand-500 shrink-0">★</span>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{req.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Optional pool */}
                {optionals.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                      Optional Pool · pick {pickCount} when you start
                    </h3>
                    <ul className="space-y-2">
                      {optionals.map((opt) => (
                        <li key={opt.id} className="flex gap-2.5">
                          <span className="mt-0.5 text-amber-500 shrink-0">○</span>
                          <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">{opt.text}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <BadgeImageLightbox
          imageFile={badge.image_file}
          alt={badge.name}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}
