import DiscoveryAwardDetail from './DiscoveryAwardDetail.jsx';
import SpecificBadgesAwardDetail from './SpecificBadgesAwardDetail.jsx';
import TaskListAwardDetail from './TaskListAwardDetail.jsx';
import GenericAwardDetail from './GenericAwardDetail.jsx';

/**
 * Dispatcher: picks the right detail UI based on `taskSet.award_type`.
 * All detail components receive { userId, taskSet, onAwardStateChanged }.
 *
 * Phase 3 implements Discovery; Phase 4 implements specific-badges + task-list.
 * Other types (manual, count_at_level, composite) fall through to GenericAwardDetail
 * which just shows the description + a parent-approve button placeholder.
 */
export default function AwardDetail({ userId, taskSet, onAwardStateChanged }) {
  switch (taskSet.award_type) {
    case 'area_coverage':
      return <DiscoveryAwardDetail userId={userId} taskSet={taskSet} onAwardStateChanged={onAwardStateChanged} />;
    case 'specific_badges':
      return <SpecificBadgesAwardDetail userId={userId} taskSet={taskSet} onAwardStateChanged={onAwardStateChanged} />;
    case 'task_list':
      return <TaskListAwardDetail userId={userId} taskSet={taskSet} onAwardStateChanged={onAwardStateChanged} />;
    default:
      return <GenericAwardDetail userId={userId} taskSet={taskSet} />;
  }
}
