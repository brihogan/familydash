/**
 * Fallback for award types without a custom detail page yet (manual,
 * count_at_level, composite). Shows the description + the award_config hint
 * for now; per-type UIs land in later phases.
 */
export default function GenericAwardDetail({ taskSet }) {
  const cfg = taskSet.award_config || {};
  return (
    <div className="space-y-4">
      {taskSet.badge_description && (
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
          {taskSet.badge_description}
        </p>
      )}
      <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
        <p className="text-xs uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 mb-1">
          How to earn it
        </p>
        <p className="text-sm text-amber-900 dark:text-amber-200">
          {cfg.hint || 'Auto-tracking for this award type is coming soon. A parent can mark it complete when earned.'}
        </p>
      </div>
    </div>
  );
}
