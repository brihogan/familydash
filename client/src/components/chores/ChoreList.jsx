import ChoreItem from './ChoreItem.jsx';
import EmptyState from '../shared/EmptyState.jsx';

export default function ChoreList({ logs, onToggle, disabled }) {
  if (!logs.length) {
    return <EmptyState title="No chores" description="No chores are set up for this day." />;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <ChoreItem key={log.id} log={log} onToggle={onToggle} disabled={disabled} />
      ))}
    </div>
  );
}
