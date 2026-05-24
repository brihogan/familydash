import GenericAwardDetail from './GenericAwardDetail.jsx';

/**
 * Rendered by UserTaskDetailPage ONLY when an award task_set has zero steps —
 * i.e. award types whose completion isn't expressible as a step list:
 * 'manual', 'count_at_level', 'composite'. Everything else (task_list,
 * specific_badges, area_coverage) generates real task_steps on enrollment
 * and falls through to the standard step rendering instead.
 */
export default function AwardDetail({ userId, taskSet, onAwardStateChanged }) {
  return <GenericAwardDetail userId={userId} taskSet={taskSet} onAwardStateChanged={onAwardStateChanged} />;
}
