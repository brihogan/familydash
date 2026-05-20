import { useEffect, useState } from 'react';
import { taskSetsApi } from '../../api/taskSets.api.js';
import { IconDisplay } from '../shared/IconPicker.jsx';
import { BADGE_LEVELS } from '../../constants/badgeLevels.js';
import useScrollLock from '../../hooks/useScrollLock.js';
import { formatDate } from '../../utils/formatDate.js';
import BadgeImageLightbox from './BadgeImageLightbox.jsx';

/**
 * Read-only trophy view: opens when a kid taps a trophy on the shelf.
 * Shows each completed step as a bullet with its input answer (if any).
 */
export default function TrophyDetailModal({ userId, taskSetId, onClose }) {
  const [taskSet,     setTaskSet]     = useState(null);
  const [steps,       setSteps]       = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [lightbox,    setLightbox]    = useState(false);

  useScrollLock(true);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError('');
    taskSetsApi.getUserTaskSet(userId, taskSetId)
      .then((data) => {
        setTaskSet(data.taskSet);
        setSteps(data.steps || []);
        setCompletions(data.completions || []);
      })
      .catch(() => setError('Could not load this trophy.'))
      .finally(() => setLoading(false));
  }, [userId, taskSetId]);

  // Build a list of completion entries to show as bullets — preserves repeat instances.
  const completionEntries = (() => {
    const list = [];
    for (const step of steps) {
      const count  = step.repeat_count || 1;
      const stepCompletions = completions
        .filter((c) => c.task_step_id === step.id)
        .sort((a, b) => a.instance - b.instance);
      for (let i = 1; i <= (stepCompletions.length || 0); i++) {
        const completion = stepCompletions.find((c) => c.instance === i);
        const name = count > 1 ? step.name.replace('{#}', String(i)) : step.name;
        list.push({
          id:           `${step.id}-${i}`,
          name,
          isOptional:   !!step.is_optional,
          inputResponse: completion?.input_response || null,
          inputPrompt:   step.input_prompt || null,
        });
      }
    }
    return list;
  })();

  const earnedDate = taskSet?.earned_at ? formatDate(taskSet.earned_at.slice(0, 10)) : null;
  const levelCfg   = taskSet?.badge_level && BADGE_LEVELS[taskSet.badge_level];

  return (
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

        {loading && (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
        )}

        {error && (
          <div className="p-10 text-center text-red-500 text-sm">{error}</div>
        )}

        {!loading && !error && taskSet && (
          <>
            {/* ── Header (large icon + name + vertical pills) ── */}
            <div className="p-5 sm:p-6 bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                {/* Large badge icon */}
                {taskSet.badge_image_file ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(true)}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex-shrink-0 shadow-md ring-2 ring-amber-300 dark:ring-amber-600 overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity"
                    aria-label="View badge full size"
                  >
                    <img
                      src={`/api/uploads/badges/${taskSet.badge_image_file}`}
                      alt={taskSet.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </button>
                ) : (
                  <span className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center text-6xl flex-shrink-0 bg-gradient-to-br from-yellow-50 to-amber-200 rounded-full shadow-md ring-2 ring-amber-300">
                    <IconDisplay value={taskSet.emoji} fallback="🏆" />
                  </span>
                )}

                {/* Title + earned date + pills below */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                    {taskSet.name}
                  </h2>
                  {earnedDate && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 font-medium">
                      🏅 Earned {earnedDate}
                    </p>
                  )}
                  {taskSet.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{taskSet.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full whitespace-nowrap">
                      {taskSet.type}
                    </span>
                    {taskSet.category && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-100 border border-brand-200 dark:border-brand-500/30 rounded-full whitespace-nowrap">
                        {taskSet.category.replace('Discover ', '').replace('the ', '')}
                      </span>
                    )}
                    {Array.isArray(taskSet.tags) && taskSet.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap"
                      >
                        {tag}
                      </span>
                    ))}
                    {levelCfg && (
                      <span
                        className="px-2 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap"
                        style={{ backgroundColor: levelCfg.color, color: levelCfg.textColor, borderColor: levelCfg.borderColor }}
                      >
                        {levelCfg.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body: completed steps as bullets ── */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                What was done ({completionEntries.length} step{completionEntries.length === 1 ? '' : 's'})
              </h3>

              {completionEntries.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No completion details available.</p>
              ) : (
                <ul className="space-y-3">
                  {completionEntries.map((entry) => (
                    <li key={entry.id} className="flex gap-3">
                      <span className="mt-1 text-green-500 dark:text-green-400 text-sm shrink-0">●</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                          {entry.name}
                          {entry.isOptional && (
                            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 align-middle">
                              optional
                            </span>
                          )}
                        </p>
                        {entry.inputResponse && (
                          <div className="mt-1.5 pl-3 border-l-2 border-brand-300 dark:border-brand-500/50">
                            {entry.inputPrompt && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 italic mb-0.5">
                                {entry.inputPrompt}
                              </p>
                            )}
                            <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
                              {entry.inputResponse}
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {lightbox && taskSet?.badge_image_file && (
        <BadgeImageLightbox
          imageFile={taskSet.badge_image_file}
          alt={taskSet.name}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}
