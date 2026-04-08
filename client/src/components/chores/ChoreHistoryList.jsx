import { relativeTime } from '../../utils/relativeTime.js';
import { useFamilySettings } from '../../context/FamilySettingsContext.jsx';

export default function ChoreHistoryList({ logs, onUndo, disabled }) {
  const { useTickets, choresLabelLower } = useFamilySettings();
  const completed = logs.filter((l) => l.completed_at);
  if (!completed.length) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 italic">No completed {choresLabelLower} for this date.</p>;
  }
  return (
    <div className="space-y-2">
      {completed.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg"
          style={{ animation: 'chore-enter 350ms ease-out both' }}
        >
          <span className="text-green-600 text-sm">✓</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{log.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Completed {relativeTime(log.completed_at)}</p>
          </div>
          {useTickets && log.ticket_reward_at_time > 0 && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              🎟 {log.ticket_reward_at_time}
            </span>
          )}
          <button
            onClick={() => onUndo(log)}
            disabled={disabled}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 dark:border-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
