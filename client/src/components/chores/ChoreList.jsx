import ChoreItem from './ChoreItem.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';

export default function ChoreList({ logs, onToggle, disabled }) {
  const { choresLabelLower } = useFamilySettings();
  if (!logs.length) {
    return <EmptyState title={`No ${choresLabelLower}`} description={`No ${choresLabelLower} are set up for this day.`} />;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <ChoreItem key={log.id} log={log} onToggle={onToggle} disabled={disabled} />
      ))}
    </div>
  );
}
